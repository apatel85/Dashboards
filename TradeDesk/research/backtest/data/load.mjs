/**
 * data/load.mjs — the ONLY way the scan/eval read data: plain file reads.
 *
 * No network, no clock. A missing cache file throws an error NAMING the
 * file — a run never tests on half-downloaded data.
 */
import fs from 'node:fs';
import path from 'node:path';

export function unixToDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function dateToIndex(dates, date) {
  return dates.indexOf(date);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`missing cache file: ${file} (${label}) — fetch it first; the run stops here rather than testing on partial data`);
    throw new Error(`cannot read cache file ${file}: ${err.message}`);
  }
}

export function loadUniverse(cacheDir) {
  return readJson(path.join(cacheDir, 'universe.json'), 'universe (run data/fetch-universe.mjs)');
}

export function dailyFile(cacheDir, ticker) {
  return path.join(cacheDir, 'daily', `${ticker.replace('^', '').replace(/[^A-Z0-9-]/g, '_')}.json`);
}

export function loadDaily(cacheDir, ticker) {
  return readJson(dailyFile(cacheDir, ticker), `daily bars for ${ticker} (run data/fetch-daily.mjs)`);
}

export function listDailyTickers(cacheDir) {
  const dir = path.join(cacheDir, 'daily');
  if (!fs.existsSync(dir)) throw new Error(`missing cache directory: ${dir} — run data/fetch-daily.mjs first`);
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.includes('.failed'))
    .map((f) => f.slice(0, -5));
}

export function loadMeta(cacheDir, ticker) {
  // Meta is best-effort per ticker: null means "sector/cap unknown" and the
  // scan records that gap explicitly (group = null, A3S cap = null).
  const file = path.join(cacheDir, 'meta', `${ticker.replace(/[^A-Z0-9-]/g, '_')}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadEarnings(cacheDir, date) {
  return readJson(path.join(cacheDir, 'earnings', `${date}.json`), `earnings calendar for ${date} (run data/fetch-earnings.mjs --dates ${date})`);
}

export function earningsFileExists(cacheDir, date) {
  return fs.existsSync(path.join(cacheDir, 'earnings', `${date}.json`));
}

export function loadSec(cacheDir, ticker) {
  const file = path.join(cacheDir, 'sec', `${ticker}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
