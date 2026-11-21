#!/usr/bin/env node
/**
 * data/fetch-universe.mjs — S&P 500 + Nasdaq-100 constituents from Wikipedia.
 *
 * Same source and parser as the nightly pipeline (pipeline/build-brief.mjs):
 * the constituents table on each list article, BRK.B → BRK-B (Yahoo format).
 * Saves the raw HTML plus cache/universe.json. This is a FETCH step: it
 * uses the network and writes files. The scan never calls it.
 *
 * Usage: node data/fetch-universe.mjs [--cache-dir <dir>]
 * Exit non-zero (naming the list) when a list cannot be fetched or parses
 * below its minimum expected count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchText } from '../../../pipeline/lib/http.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function cacheDir(argv) {
  const i = argv.indexOf('--cache-dir');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : path.join(ROOT, 'cache');
}

/** Parse the constituents table: the table whose header mentions Symbol/Ticker. */
function parseWikiSymbols(html, minExpected, label) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
  const table = tables.find((t) => /Symbol|Ticker/i.test(t.slice(0, 2000)));
  if (!table) throw new Error(`${label}: no constituents table found in page`);
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const syms = [];
  for (const r of rows.slice(1)) {
    const cells = [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)];
    if (!cells.length) continue;
    let s = cells[0][1].replace(/<[^>]+>/g, '').replace(/\[.*?\]/g, '').trim().toUpperCase();
    s = s.replace(/\./g, '-'); // BRK.B → BRK-B (Yahoo format)
    if (/^[A-Z0-9-]{1,7}$/.test(s)) syms.push(s);
  }
  const uniq = [...new Set(syms)];
  console.log(`[universe] ${label}: parsed ${uniq.length} symbols`);
  if (uniq.length < minExpected) {
    throw new Error(`${label}: only ${uniq.length} symbols (expected ≥${minExpected}) — page format may have changed`);
  }
  return uniq;
}

export async function fetchUniverse(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const sp = await fetchText('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', { label: 'wikipedia SP500' });
  fs.writeFileSync(path.join(dir, 'universe-sp500.html'), sp);
  const sp500 = parseWikiSymbols(sp, 400, 'S&P 500');
  const ndx = await fetchText('https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies', { label: 'wikipedia Nasdaq-100 list' });
  fs.writeFileSync(path.join(dir, 'universe-nasdaq100.html'), ndx);
  const nasdaq100 = parseWikiSymbols(ndx, 80, 'Nasdaq-100');
  const tickers = [...new Set([...sp500, ...nasdaq100])].sort();
  const out = {
    fetchedAt: new Date().toISOString(),
    sources: [
      'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
      'https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies',
    ],
    sp500Count: sp500.length,
    nasdaq100Count: nasdaq100.length,
    sp500,
    nasdaq100,
    tickers,
  };
  fs.writeFileSync(path.join(dir, 'universe.json'), JSON.stringify(out, null, 2));
  console.log(`[universe] ${tickers.length} unique tickers (S&P 500 ${sp500.length} + Nasdaq-100 ${nasdaq100.length}) → ${path.join(dir, 'universe.json')}`);
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    await fetchUniverse(cacheDir(process.argv.slice(2)));
  } catch (err) {
    console.error(`[universe] FAILED: ${err.message}`);
    process.exit(1);
  }
}
