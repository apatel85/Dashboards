#!/usr/bin/env node
/**
 * build-performance.mjs — track how the research agent's recommendations
 * have performed since they were made.
 *
 * Reads research.json (ideas with ticker, name, updated_at), dedupes by
 * ticker keeping the EARLIEST recommendation, then for each:
 *   rec_price     — daily close on/before the recommendation date (Yahoo)
 *   current_price — latest snapshot from quotes.json (falls back to a fresh
 *                   Yahoo fetch when the ticker isn't in quotes.json)
 *   pct_change    — (current - rec) / rec * 100
 *
 * Writes public/data/performance.json:
 *   { as_of, source, count, quotes_as_of, items: [
 *     { ticker, name, recommended_at, recommended_date, rec_price,
 *       current_price, pct_change, p_up, score } ] }
 *
 * $0, keyless (Yahoo chart API, browser UA). Non-fatal by design — on any
 * failure it keeps the previous performance.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooChart } from './lib/yahoo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

/** Parse Yahoo chart result into [{date: 'YYYY-MM-DD', close}]. */
function parseDailyBars(json) {
  const r = json?.chart?.result?.[0];
  if (!r) return [];
  const ts = r.timestamp || [];
  const closes = r.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    const d = new Date(ts[i] * 1000);
    out.push({ date: d.toISOString().slice(0, 10), close: c });
  }
  return out;
}

/** Latest bar on or before `dateStr` (YYYY-MM-DD). */
function closeOnOrBefore(bars, dateStr) {
  let best = null;
  for (const b of bars) {
    if (b.date <= dateStr && (!best || b.date > best.date)) best = b;
  }
  return best;
}

async function main() {
  const research = readJson('research.json');
  const ideas = Array.isArray(research) ? research : [];
  if (!ideas.length) {
    console.log('[performance] no ideas in research.json — writing empty file');
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'performance.json'), JSON.stringify({
      as_of: new Date().toISOString(),
      source: 'Yahoo Finance chart API (delayed) + pipeline quotes snapshot',
      count: 0, quotes_as_of: null, items: [],
    }));
    return;
  }

  // Dedupe: earliest recommendation per ticker wins.
  const byTicker = new Map();
  for (const idea of ideas) {
    const t = String(idea.ticker || '').toUpperCase();
    if (!t) continue;
    const prev = byTicker.get(t);
    if (!prev || String(idea.updated_at || '') < String(prev.updated_at || '')) {
      byTicker.set(t, idea);
    }
  }

  const quotesFile = readJson('quotes.json');
  const quotes = quotesFile?.quotes || {};
  const quotesAsOf = quotesFile?.as_of || null;

  const items = [];
  let n = 0;
  for (const [ticker, idea] of byTicker) {
    n++;
    const recDate = String(idea.updated_at || '').slice(0, 10);
    let recPrice = null;
    try {
      const j = await yahooChart(ticker, { interval: '1d', range: '3mo' });
      const bars = parseDailyBars(j);
      const bar = closeOnOrBefore(bars, recDate);
      if (bar) recPrice = Math.round(bar.close * 100) / 100;
      if (n % 5 === 0) await sleep(400);
    } catch (e) {
      console.warn(`[performance] ${ticker}: history fetch failed: ${e.message}`);
    }

    // Current price: quotes.json snapshot first, else fresh fetch.
    let curPrice = quotes[ticker]?.price ?? null;
    if (curPrice == null) {
      try {
        const j = await yahooChart(ticker, { interval: '1d', range: '5d' });
        const bars = parseDailyBars(j);
        if (bars.length) curPrice = Math.round(bars[bars.length - 1].close * 100) / 100;
        await sleep(400);
      } catch (e) {
        console.warn(`[performance] ${ticker}: current price fetch failed: ${e.message}`);
      }
    }

    const pct = recPrice != null && curPrice != null && recPrice > 0
      ? Math.round(((curPrice - recPrice) / recPrice) * 1000) / 10
      : null;

    items.push({
      ticker,
      name: idea.name || ticker,
      recommended_at: idea.updated_at || null,
      recommended_date: recDate || null,
      rec_price: recPrice,
      current_price: curPrice,
      pct_change: pct,
      p_up: idea.p_up ?? null,
      score: idea.score ?? null,
    });
  }

  // Newest recommendations first.
  items.sort((a, b) => String(b.recommended_at || '').localeCompare(String(a.recommended_at || '')));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'performance.json'), JSON.stringify({
    as_of: new Date().toISOString(),
    source: 'Yahoo Finance chart API (delayed) + pipeline quotes snapshot',
    count: items.length,
    quotes_as_of: quotesAsOf,
    items,
  }));
  const scored = items.filter((i) => i.pct_change != null);
  const avg = scored.length
    ? Math.round((scored.reduce((s, i) => s + i.pct_change, 0) / scored.length) * 10) / 10
    : null;
  console.log(`[performance] wrote ${items.length} tracked (${scored.length} with prices, avg ${avg}%)`);
}

main().catch((e) => { console.error(`[performance] FATAL: ${e.message}`); process.exit(1); });
