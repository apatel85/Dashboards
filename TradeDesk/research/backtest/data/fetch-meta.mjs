#!/usr/bin/env node
/**
 * data/fetch-meta.mjs — Yahoo quoteSummary assetProfile + price → cache/meta/.
 *
 * One file per ticker: { ticker, sector, industry, marketCap }.
 * Used for the group-strength score component (sector median RS) and the
 * A3S large/small-cap bar. Market cap is CURRENT (2026), not point-in-time:
 * free sources do not give historical caps, so A3S classifications carry
 * that approximation — DATA_AUDIT.md says so.
 *
 * Needs the Yahoo crumb session (pipeline/lib/yahoo.mjs). A failed ticker
 * is recorded in cache/meta.failed.json and the command exits NON-ZERO.
 * Re-runs skip tickers whose file already exists (unless --force).
 *
 * Usage: node data/fetch-meta.mjs [--tickers AAPL,MSFT,...] [--cache-dir <dir>] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchJson } from '../../../pipeline/lib/http.mjs';
import { yahooSession } from '../../../pipeline/lib/yahoo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export async function fetchMeta({ tickers, cacheDir, force = false }) {
  const metaDir = path.join(cacheDir, 'meta');
  fs.mkdirSync(metaDir, { recursive: true });
  const s = await yahooSession();
  const failed = [];
  let done = 0;
  const queue = [...tickers];
  async function worker() {
    while (queue.length) {
      const ticker = queue.shift();
      const file = path.join(metaDir, `${ticker.replace(/[^A-Z0-9-]/g, '_')}.json`);
      if (!force && fs.existsSync(file)) { done += 1; continue; }
      try {
        const j = await fetchJson(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,price&crumb=${encodeURIComponent(s.crumb)}`,
          { headers: { 'User-Agent': UA, Cookie: s.cookie }, label: `quoteSummary ${ticker}`, minIntervalMs: 250 },
        );
        const r = j?.quoteSummary?.result?.[0];
        if (!r) throw new Error('empty quoteSummary result');
        fs.writeFileSync(file, JSON.stringify({
          ticker,
          sector: r.assetProfile?.sector ?? null,
          industry: r.assetProfile?.industry ?? null,
          marketCap: r.price?.marketCap?.raw ?? null,
        }));
        done += 1;
        if (done % 100 === 0) console.log(`[meta] ${done}/${tickers.length}`);
      } catch (err) {
        console.error(`[meta] FAILED ${ticker}: ${err.message}`);
        failed.push({ ticker, error: String(err.message || err) });
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  fs.writeFileSync(path.join(cacheDir, 'meta.failed.json'), JSON.stringify({ failed }, null, 2));
  console.log(`[meta] ${done}/${tickers.length} ok, ${failed.length} failed`);
  if (failed.length) {
    throw new Error(`meta fetch incomplete: ${failed.length} ticker(s) failed: ${failed.map((f) => f.ticker).join(', ')}`);
  }
  return { done, failed };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cacheDir = arg(argv, '--cache-dir', path.join(ROOT, 'cache'));
  try {
    let tickers;
    const list = arg(argv, '--tickers', null);
    if (list) tickers = list.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    else tickers = JSON.parse(fs.readFileSync(path.join(cacheDir, 'universe.json'), 'utf8')).tickers;
    await fetchMeta({ tickers, cacheDir, force: argv.includes('--force') });
  } catch (err) {
    console.error(`[meta] FAILED: ${err.message}`);
    process.exit(1);
  }
}
