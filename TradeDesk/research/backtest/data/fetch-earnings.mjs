#!/usr/bin/env node
/**
 * data/fetch-earnings.mjs — Nasdaq earnings calendar → cache/earnings/<date>.json.
 *
 * One request per date (the API is single-date-per-request). Each file:
 * { date, rows: [{ symbol, name, epsActual, epsForecast, surprisePct,
 * time, marketCap, fiscalQuarterEnding }] }. `surprisePct` is the Nasdaq
 * `surprise` field when present, else (actual − forecast) / |forecast| × 100.
 * `time` is often "time-not-supplied" on past dates — the backtest matches a
 * gap day to a report on that date OR the prior session (see engine/scan.mjs).
 *
 * A failed date is recorded in cache/earnings.failed.json and the command
 * exits NON-ZERO naming it. Re-runs skip dates whose file already exists.
 *
 * Usage: node data/fetch-earnings.mjs --dates 2024-11-05,2024-11-06 [--cache-dir <dir>] [--force]
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

function parseMoney(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[$,%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function fetchEarnings({ dates, cacheDir, force = false }) {
  const dir = path.join(cacheDir, 'earnings');
  fs.mkdirSync(dir, { recursive: true });
  const failed = [];
  for (const date of dates) {
    const file = path.join(dir, `${date}.json`);
    if (!force && fs.existsSync(file)) continue;
    try {
      const j = await fetchJson(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        label: `nasdaq earnings ${date}`,
        minIntervalMs: 250,
      });
      const rows = (j?.data?.rows || []).map((r) => {
        const actual = parseMoney(r.eps);
        const forecast = parseMoney(r.epsForecast);
        let surprisePct = parseMoney(r.surprise);
        if (surprisePct == null && actual != null && forecast != null && forecast !== 0) {
          surprisePct = ((actual - forecast) / Math.abs(forecast)) * 100;
        }
        return {
          symbol: String(r.symbol || '').trim().toUpperCase(),
          name: String(r.name || '').trim(),
          epsActual: actual,
          epsForecast: forecast,
          surprisePct,
          time: r.time ?? null,
          marketCap: parseMoney(r.marketCap),
          fiscalQuarterEnding: r.fiscalQuarterEnding ?? null,
        };
      }).filter((r) => r.symbol);
      fs.writeFileSync(file, JSON.stringify({ date, source: 'nasdaq-calendar', rows }));
      console.log(`[earnings] ${date}: ${rows.length} rows`);
    } catch (err) {
      console.error(`[earnings] FAILED ${date}: ${err.message}`);
      failed.push({ date, error: String(err.message || err) });
    }
  }
  fs.writeFileSync(path.join(cacheDir, 'earnings.failed.json'), JSON.stringify({ failed }, null, 2));
  if (failed.length) {
    throw new Error(`earnings fetch incomplete: ${failed.length} date(s) failed: ${failed.map((f) => f.date).join(', ')}`);
  }
  return { dates: dates.length, failed };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cacheDir = arg(argv, '--cache-dir', path.join(ROOT, 'cache'));
  const dates = (arg(argv, '--dates', '') || '').split(',').map((d) => d.trim()).filter(Boolean);
  if (!dates.length) {
    console.error('[earnings] FAILED: pass --dates YYYY-MM-DD,... (the run derives the list from gap days)');
    process.exit(1);
  }
  try {
    await fetchEarnings({ dates, cacheDir, force: argv.includes('--force') });
  } catch (err) {
    console.error(`[earnings] FAILED: ${err.message}`);
    process.exit(1);
  }
}
