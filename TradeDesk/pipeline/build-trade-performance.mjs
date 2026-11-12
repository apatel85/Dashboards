#!/usr/bin/env node
/**
 * build-trade-performance.mjs — price-at-trade vs price-now for recent
 * Congress + White House trades.
 *
 * Enriches congress.json / executive.json IN PLACE (adds price_at_trade /
 * price_now / perf_pct / perf_as_of per row; null outside the window) and
 * writes trade-performance.json (window meta for the UI footnote).
 *
 * Window: Congress = tx_date within the last 90 days (future-dated rows
 * skipped). Executive = tx_date within 90 days of THAT file's latest
 * tx_date — the executive source lags badly (latest tx 2026-07-31 as of
 * Nov 2026), so a calendar-90d window from today would be empty; the
 * window is relative to the freshest executive data instead. Documented,
 * not hidden: the meta file records both windows.
 *
 * Prices (keyless, Yahoo v8 chart only — no crumb needed):
 *  - price_at_trade = daily close ON OR BEFORE tx_date (last bar <= tx).
 *  - price_now = quotes.json snapshot price when the ticker is in it,
 *    else the latest Yahoo daily close. perf_as_of records which date
 *    price_now is from.
 *  - perf_pct = (price_now / price_at_trade - 1) * 100, 1dp. Same number
 *    for buys and sells (raw price change since the trade); the UI words
 *    it per trade_type ("bought at $X · now $Y").
 *  - Tickers with dots (BRK.B) are requested as BRK-B — Yahoo's form.
 *  - Rows with no ticker, no bars, or a trade before the fetched bars
 *    keep nulls; the UI renders "—". Never invent a price.
 *
 * Fetching: Yahoo chart with a small local pool (5 concurrent, 250ms
 * between batch starts, 3 attempts on 429/5xx). The shared politeFetch
 * helper enforces 1100ms/host, which would make ~740 tickers take ~14
 * minutes; the chart endpoint tolerates this modest pace from both this
 * VM and GitHub runners (build-quotes / build-brief already use it).
 *
 * Usage: OUT_DIR=/path/to/public/data node build-trade-performance.mjs
 * Non-fatal step in refresh.sh (keeps previous files on failure).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import {
  isoDate, addDays, r2, unixToDate, writeJsonAtomic,
} from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const WINDOW_DAYS = 90;
const CONCURRENCY = 5;
const BATCH_SPACING_MS = 250;
const MAX_TICKERS = 1200;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Yahoo's symbol form: BRK.B → BRK-B, MOG.A → MOG-A. */
function yahooSymbol(ticker) {
  return String(ticker).replace(/\./g, '-');
}

function readRows(name) {
  const p = path.join(OUT_DIR, name);
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(j)) {
      console.warn(`[trade-perf] ${name} is not a list — skipping`);
      return [];
    }
    return j;
  } catch (e) {
    console.warn(`[trade-perf] cannot read ${name}: ${e.message} — skipping`);
    return [];
  }
}

/** One ticker's daily closes (6mo, 1d). Null when Yahoo has no bars. */
async function fetchBars(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}?interval=1d&range=6mo`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      let res;
      try {
        res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null;
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      if (!r) return null;
      const ts = r.timestamp || [];
      const closes = r.indicators?.quote?.[0]?.close || [];
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        if (closes[i] == null) continue;
        bars.push({ date: unixToDate(ts[i]), close: r2(closes[i]) });
      }
      return bars.length ? bars : null;
    } catch (e) {
      if (attempt === 3) {
        console.warn(`[trade-perf] ${ticker}: bars failed (${e.message}) — perf null`);
        return null;
      }
      await sleep(1000 * attempt);
    }
  }
  return null;
}

/** Last bar with date <= target (bars sorted ascending by date). */
function closeOnOrBefore(bars, target) {
  let hit = null;
  for (const b of bars) {
    if (b.date <= target) hit = b;
    else break;
  }
  return hit;
}

async function main() {
  const today = isoDate();
  const congFrom = addDays(today, -WINDOW_DAYS);
  console.log(`[trade-perf] congress window ${congFrom} → ${today}`);

  const congress = readRows('congress.json');
  const executive = readRows('executive.json');

  // Executive window: relative to that file's freshest trade (source lag).
  let execMax = '';
  for (const t of executive) {
    if (t.tx_date && t.tx_date > execMax) execMax = t.tx_date;
  }
  const execTo = execMax || today;
  const execFrom = addDays(execTo, -WINDOW_DAYS);
  console.log(`[trade-perf] executive window ${execFrom} → ${execTo} (latest exec tx ${execTo})`);

  // Quotes snapshot for price_now (96 tickers); Yahoo last close otherwise.
  let quotes = {};
  let quotesAsOf = null;
  try {
    const q = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'quotes.json'), 'utf8'));
    quotes = q?.quotes || {};
    quotesAsOf = typeof q?.as_of === 'string' ? q.as_of.slice(0, 10) : null;
  } catch {
    console.warn('[trade-perf] quotes.json unreadable — price_now falls back to Yahoo last close');
  }

  const inWindow = (t, from, to) =>
    Boolean(t.tx_date) && t.tx_date >= from && t.tx_date <= to && Boolean(t.ticker);

  const congRows = congress.filter((t) => inWindow(t, congFrom, today));
  const execRows = executive.filter((t) => inWindow(t, execFrom, execTo));
  const tickers = [...new Set([...congRows, ...execRows].map((t) => t.ticker))];
  console.log(`[trade-perf] in-window rows: congress ${congRows.length}, executive ${execRows.length}; distinct tickers ${tickers.length}`);
  if (tickers.length > MAX_TICKERS) {
    console.error(`[trade-perf] FATAL: ${tickers.length} tickers exceeds cap ${MAX_TICKERS} — refusing to hammer Yahoo`);
    process.exit(1);
  }

  // Fetch bars in small batches (5 concurrent, 250ms between starts).
  const barsByTicker = new Map();
  let failed = 0;
  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((tk) => fetchBars(tk)));
    batch.forEach((tk, j) => {
      if (results[j]) barsByTicker.set(tk, results[j]);
      else failed++;
    });
    if (i + CONCURRENCY < tickers.length) await sleep(BATCH_SPACING_MS);
    if ((i / CONCURRENCY + 1) % 20 === 0) console.log(`[trade-perf] ${Math.min(i + CONCURRENCY, tickers.length)}/${tickers.length} tickers`);
  }
  console.log(`[trade-perf] bars fetched for ${barsByTicker.size}/${tickers.length} tickers (${failed} failed)`);

  const enrich = (rows, from, to) => {
    let priced = 0;
    for (const t of rows) {
      // Default: outside the window (or unpriceable) → explicit nulls, so
      // a row that ages out of the window loses its stale numbers.
      t.price_at_trade = null;
      t.price_now = null;
      t.perf_pct = null;
      t.perf_as_of = null;
      if (!inWindow(t, from, to)) continue;
      const bars = barsByTicker.get(t.ticker);
      if (!bars) continue;
      const at = closeOnOrBefore(bars, t.tx_date);
      if (!at || at.close == null || at.close <= 0) continue;
      const q = quotes[t.ticker];
      const now = q?.price != null && Number.isFinite(q.price)
        ? r2(q.price)
        : bars[bars.length - 1].close;
      const asOf = q?.price != null && Number.isFinite(q.price)
        ? (quotesAsOf ?? bars[bars.length - 1].date)
        : bars[bars.length - 1].date;
      if (now == null || now <= 0) continue;
      t.price_at_trade = at.close;
      t.price_now = now;
      t.perf_pct = r2(((now / at.close) - 1) * 100, 1);
      t.perf_as_of = asOf;
      priced++;
    }
    return priced;
  };

  const congPriced = enrich(congress, congFrom, today);
  const execPriced = enrich(executive, execFrom, execTo);
  console.log(`[trade-perf] priced rows: congress ${congPriced}/${congRows.length}, executive ${execPriced}/${execRows.length}`);

  writeJsonAtomic(path.join(OUT_DIR, 'congress.json'), congress);
  writeJsonAtomic(path.join(OUT_DIR, 'executive.json'), executive);
  writeJsonAtomic(path.join(OUT_DIR, 'trade-performance.json'), {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    congress: {
      from: congFrom, to: today, rows: congRows.length,
      tickers: new Set(congRows.map((t) => t.ticker)).size, priced: congPriced,
    },
    executive: {
      from: execFrom, to: execTo, rows: execRows.length,
      tickers: new Set(execRows.map((t) => t.ticker)).size, priced: execPriced,
      note: 'Window is relative to the freshest executive trade: the executive source lags (latest tx 2026-07-31 as of Nov 2026).',
    },
    as_of: today,
  });
  console.log('[trade-perf] done');
}

main().catch((e) => {
  console.error(`[trade-perf] FATAL: ${e.message}`);
  process.exit(1);
});
