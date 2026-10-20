#!/usr/bin/env node
/**
 * build-quotes.mjs — delayed price snapshot for the app's quote fallback.
 *
 * Why this exists: no free quote API sends CORS headers, so the browser
 * cannot fetch live quotes directly (Stooq/Yahoo/Nasdaq all fail from the
 * app). Instead the pipeline snapshots ~15-min-delayed Yahoo prices into
 * quotes.json; the app's quote store reads it (and the refresh button
 * re-reads it). Honest by construction: every price carries its as_of time.
 *
 * Universe: top signals + gex watchlist + daily-brief tickers (deduped).
 * $0, keyless (Yahoo chart API, browser UA).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooChart } from './lib/yahoo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const MAX_TICKERS = parseInt(process.env.QUOTES_MAX || '150', 10) || 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

function buildUniverse() {
  const set = new Set();
  const signals = readJson('signals.json');
  for (const t of (signals?.tickers || []).slice(0, 80)) set.add(t.ticker);
  const gex = readJson('gex.json');
  for (const t of gex?.watchlist || []) set.add(t); // keep ^SPX form for Yahoo
  const brief = readJson('daily-brief.json');
  const b = brief?.breakout_candidates || brief?.breakouts || brief?.candidates || [];
  for (const c of b) if (c.ticker) set.add(c.ticker);
  const sectors = brief?.sectors || [];
  const sectorList = Array.isArray(sectors) ? sectors : Object.values(sectors);
  for (const s of sectorList) for (const t of s.tickers || s.symbols || []) set.add(t);
  return [...set].filter((t) => /^\^?[A-Z]{1,6}$/.test(t)).slice(0, MAX_TICKERS);
}

async function quoteFor(ticker) {
  const j = await yahooChart(ticker, { interval: '1d', range: '5d' });
  const result = j?.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  if (!(price > 0)) throw new Error('no price');
  // prev close from actual daily bars — meta.chartPreviousClose is unreliable
  let prev = null;
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const done = closes.filter((c) => c > 0);
  if (done.length >= 2) prev = done[done.length - 2];
  else if (meta?.chartPreviousClose > 0) prev = meta.chartPreviousClose;
  return {
    price: Math.round(price * 100) / 100,
    prev_close: prev && prev > 0 ? Math.round(prev * 100) / 100 : null,
    change_pct: prev && prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : null,
  };
}

async function main() {
  const universe = buildUniverse();
  console.log(`[quotes] universe: ${universe.length} tickers`);
  const quotes = {};
  let ok = 0, fail = 0;
  for (const t of universe) {
    try {
      quotes[t] = await quoteFor(t);
      ok++;
    } catch (e) {
      fail++;
      if (fail < 5) console.warn(`[quotes] ${t}: ${e.message}`);
    }
    await sleep(120);
  }
  if (ok === 0) throw new Error('no quotes fetched — aborting');
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'quotes.json'), JSON.stringify({
    as_of: new Date().toISOString(),
    source: 'Yahoo Finance chart API (~15-min delayed)',
    count: ok,
    quotes,
  }));
  console.log(`[quotes] wrote quotes.json (${ok} ok, ${fail} failed)`);
}

main().catch((e) => {
  console.error('[quotes] FATAL', e.message);
  process.exit(1);
});
