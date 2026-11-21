#!/usr/bin/env node
/**
 * data/fetch-daily.mjs — Yahoo daily bars → cache/daily/<TICKER>.json.
 *
 * One v8 chart request per ticker (browser UA, no crumb — verified live).
 * Bars are split-adjusted, dividend-unadjusted Yahoo closes, exactly what
 * plan §7.4 wants. Each file: { ticker, source, from, to, bars, splits,
 * dropped }. Bars are { ts, o, h, l, c, v } with ts = unix seconds, the
 * shape pipeline/lib/cmo/ expects. Cleaning (plan §7.4): a bar is dropped
 * when volume is zero or the high-low range exceeds 50% of the low; every
 * drop is recorded in the file (never silently dropped).
 *
 * This is a FETCH step: network + file writes. The scan never calls it.
 * A failed ticker is retried by politeFetch, then recorded in
 * cache/daily.failed.json and the command exits NON-ZERO naming every
 * missing ticker — a run never tests on half-downloaded data.
 *
 * Usage: node data/fetch-daily.mjs [--from 2019-01-01] [--to 2026-10-31]
 *        [--tickers AAPL,MSFT,...] [--cache-dir <dir>] [--concurrency 4]
 * Defaults: universe from cache/universe.json (run fetch-universe first);
 * SPY and ^VIX are always added (regime + context).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchJson } from '../../../pipeline/lib/http.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function dateToUnix(dateStr) {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 1000);
}

function unixToDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function fileName(ticker) {
  return `${ticker.replace('^', '').replace(/[^A-Z0-9-]/g, '_')}.json`;
}

async function fetchTicker(ticker, fromUnix, toUnix) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${fromUnix}&period2=${toUnix}`;
  const j = await fetchJson(url, {
    headers: { 'User-Agent': UA },
    label: `yahoo chart ${ticker}`,
    minIntervalMs: 250,
  });
  const result = j?.chart?.result?.[0];
  if (!result) {
    const err = j?.chart?.error;
    throw new Error(err ? `${err.code}: ${err.description || ''}`.trim() : 'empty chart result');
  }
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const bars = [];
  const dropped = [];
  // Index tickers (^VIX etc.) carry no volume — the zero-volume rule
  // cannot apply to them (it would drop every bar).
  const isIndex = ticker.startsWith('^');
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const v = q.volume?.[i];
    if (c == null || o == null || h == null || l == null) continue; // missing quote row
    const date = unixToDate(ts[i]);
    if (!isIndex && (v == null || v === 0)) { dropped.push({ date, reason: 'zero-volume' }); continue; }
    if (l > 0 && (h - l) / l > 0.5) { dropped.push({ date, reason: `range ${(100 * (h - l) / l).toFixed(1)}% > 50%` }); continue; }
    bars.push({ ts: ts[i], o, h, l, c, v: v ?? 0 });
  }
  const splits = [];
  for (const s of result.events?.split ? Object.values(result.events.split) : []) {
    splits.push({ date: unixToDate(s.date), numerator: s.numerator, denominator: s.denominator });
  }
  return { ticker, source: 'yahoo-chart-v8', bars, splits, dropped };
}

export async function fetchDaily({ from, to, tickers, cacheDir, concurrency = 4 }) {
  const dailyDir = path.join(cacheDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  const fromUnix = dateToUnix(from);
  const toUnix = dateToUnix(to) + 86400; // period2 is exclusive; include `to`
  const failed = [];
  let done = 0;
  const queue = [...tickers];
  async function worker() {
    while (queue.length) {
      const ticker = queue.shift();
      try {
        const data = await fetchTicker(ticker, fromUnix, toUnix);
        data.from = from;
        data.to = to;
        fs.writeFileSync(path.join(dailyDir, fileName(ticker)), JSON.stringify(data));
        done += 1;
        if (done % 50 === 0) console.log(`[daily] ${done}/${tickers.length} tickers fetched`);
      } catch (err) {
        console.error(`[daily] FAILED ${ticker}: ${err.message}`);
        failed.push({ ticker, error: String(err.message || err) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tickers.length) }, () => worker()));
  fs.writeFileSync(path.join(cacheDir, 'daily.failed.json'), JSON.stringify({ from, to, failed }, null, 2));
  console.log(`[daily] ${done}/${tickers.length} tickers ok, ${failed.length} failed → ${path.join(dailyDir)}`);
  if (failed.length) {
    throw new Error(`daily fetch incomplete: ${failed.length} ticker(s) failed: ${failed.map((f) => f.ticker).join(', ')} — re-run to retry; the scan will not run on partial data`);
  }
  return { done, failed };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cacheDir = arg(argv, '--cache-dir', path.join(ROOT, 'cache'));
  const from = arg(argv, '--from', '2019-01-01');
  const to = arg(argv, '--to', '2026-10-31');
  const concurrency = Number(arg(argv, '--concurrency', '4')) || 4;
  try {
    let tickers;
    const list = arg(argv, '--tickers', null);
    if (list) {
      tickers = list.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    } else {
      const uni = JSON.parse(fs.readFileSync(path.join(cacheDir, 'universe.json'), 'utf8'));
      tickers = uni.tickers;
    }
    // Regime + context symbols are always fetched (SPY for regime/RS-line,
    // ^VIX as context only). They are not universe members.
    for (const extra of ['SPY', '^VIX']) if (!tickers.includes(extra)) tickers = [...tickers, extra];
    await fetchDaily({ from, to, tickers, cacheDir, concurrency });
  } catch (err) {
    console.error(`[daily] FAILED: ${err.message}`);
    process.exit(1);
  }
}
