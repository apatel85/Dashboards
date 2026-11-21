#!/usr/bin/env node
/**
 * data/fetch-minute.mjs — Alpaca 1-minute bars → cache/minute/<TICKER>.json.
 *
 * Intraday modules (stock_orb, and any minute-based ORB check) need these.
 * Alpaca needs ALPACA_KEY_ID / ALPACA_SECRET_KEY, which do NOT exist in
 * this workspace — so this fetcher FAILS LOUDLY per file instead of
 * silently skipping: every requested ticker gets a
 * cache/minute/<TICKER>.failed.json naming the missing env vars, and the
 * command exits NON-ZERO. Daily modules never call it.
 *
 * If the keys are ever set, the fetcher saves one file per ticker
 * ({ ticker, bars: [{ ts, o, h, l, c, v }] } in UTC seconds) via the Alpaca
 * market-data bars endpoint (IEX feed, free tier).
 *
 * Usage: ALPACA_KEY_ID=... ALPACA_SECRET_KEY=... node data/fetch-minute.mjs
 *        --from 2024-11-01 --to 2026-10-31 [--tickers AAPL,...] [--cache-dir <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchJson } from '../../../pipeline/lib/http.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export function alpacaKeys() {
  return { keyId: process.env.ALPACA_KEY_ID || null, secret: process.env.ALPACA_SECRET_KEY || null };
}

export async function fetchMinute({ tickers, from, to, cacheDir }) {
  const dir = path.join(cacheDir, 'minute');
  fs.mkdirSync(dir, { recursive: true });
  const { keyId, secret } = alpacaKeys();
  if (!keyId || !secret) {
    for (const t of tickers) {
      fs.writeFileSync(path.join(dir, `${t}.failed.json`), JSON.stringify({
        ticker: t,
        error: 'Minute fetch refused: ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set. Intraday modules (stock_orb) cannot run without minute data. Set both env vars and re-run.',
      }, null, 2));
    }
    throw new Error(`Minute fetch refused for ${tickers.length} ticker(s): ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set. Per-file failure records written to ${dir} (*.failed.json).`);
  }
  const headers = { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secret, Accept: 'application/json' };
  const failed = [];
  for (const t of tickers) {
    try {
      const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(t)}&timeframe=1Min&start=${from}T00:00:00Z&end=${to}T23:59:59Z&limit=10000&feed=iex&adjustment=split`;
      const j = await fetchJson(url, { headers, label: `alpaca minute ${t}`, minIntervalMs: 250 });
      const bars = (j?.bars?.[t] || []).map((b) => ({
        ts: Math.floor(Date.parse(b.t) / 1000),
        o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
      }));
      fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify({ ticker: t, source: 'alpaca-iex-1min', from, to, bars }));
    } catch (err) {
      failed.push({ ticker: t, error: String(err.message || err) });
    }
  }
  fs.writeFileSync(path.join(cacheDir, 'minute.failed.json'), JSON.stringify({ failed }, null, 2));
  if (failed.length) throw new Error(`Minute fetch incomplete: ${failed.length} ticker(s) failed: ${failed.map((f) => f.ticker).join(', ')}`);
  return { done: tickers.length };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cacheDir = arg(argv, '--cache-dir', path.join(ROOT, 'cache'));
  const from = arg(argv, '--from', '2024-11-01');
  const to = arg(argv, '--to', '2026-10-31');
  try {
    let tickers;
    const list = arg(argv, '--tickers', null);
    if (list) tickers = list.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    else tickers = JSON.parse(fs.readFileSync(path.join(cacheDir, 'universe.json'), 'utf8')).tickers;
    await fetchMinute({ tickers, from, to, cacheDir });
    console.log('[minute] ok');
  } catch (err) {
    console.error(`[minute] FAILED: ${err.message}`);
    process.exit(1);
  }
}
