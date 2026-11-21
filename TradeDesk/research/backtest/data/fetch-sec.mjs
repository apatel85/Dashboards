#!/usr/bin/env node
/**
 * data/fetch-sec.mjs — SEC EDGAR companyfacts → cache/sec/<TICKER>.json.
 *
 * Growth / SUE / margin-trend inputs need point-in-time SEC facts, keyed by
 * each filing's `filed` date (plan §4.3). SEC requires a User-Agent with a
 * contact email. There is NO usable contact email in this workspace
 * (SEC_CONTACT_EMAIL is an unreadable placeholder), so this fetcher FAILS
 * LOUDLY per file instead of silently skipping: every attempted ticker
 * gets a cache/sec/<TICKER>.failed.json naming the missing env var, and the
 * command exits NON-ZERO.
 *
 * The run does NOT call this by default: it proceeds with growth = null
 * (0 points) and records "SEC skipped: no SEC_CONTACT_EMAIL" in
 * DATA_AUDIT.md. If a contact email is ever set, run this first, then the
 * run with --with-sec to use the facts.
 *
 * Usage: SEC_CONTACT_EMAIL=you@example.com node data/fetch-sec.mjs
 *        [--tickers AAPL,MSFT,...] [--cache-dir <dir>]
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

export function secEmail() {
  return process.env.SEC_CONTACT_EMAIL || null;
}

export async function fetchSec({ tickers, cacheDir }) {
  const dir = path.join(cacheDir, 'sec');
  fs.mkdirSync(dir, { recursive: true });
  const email = secEmail();
  if (!email || /placeholder|not configured|example\.com/i.test(email)) {
    for (const t of tickers) {
      fs.writeFileSync(path.join(dir, `${t}.failed.json`), JSON.stringify({
        ticker: t,
        error: 'SEC fetch refused: SEC_CONTACT_EMAIL is not set to a real contact email (SEC requires a User-Agent with a contact address). Set SEC_CONTACT_EMAIL and re-run. Growth/SUE/margin inputs stay unavailable until then.',
      }, null, 2));
    }
    throw new Error(`SEC fetch refused for ${tickers.length} ticker(s): SEC_CONTACT_EMAIL is not set to a real contact email. Per-file failure records written to ${dir} (*.failed.json).`);
  }
  const ua = `TradeDesk backtest research ${email}`;
  const map = await fetchJson('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': ua },
    label: 'sec company_tickers',
  });
  const byTicker = {};
  for (const row of Object.values(map)) byTicker[String(row.ticker).toUpperCase()] = String(row.cik_str).padStart(10, '0');
  const failed = [];
  for (const t of tickers) {
    const cik = byTicker[t];
    if (!cik) { failed.push({ ticker: t, error: 'no CIK in company_tickers.json' }); continue; }
    try {
      const j = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers: { 'User-Agent': ua, Accept: 'application/json' },
        label: `sec companyfacts ${t}`,
        minIntervalMs: 120,
      });
      fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify({ ticker: t, cik, facts: j?.facts ?? {} }));
    } catch (err) {
      failed.push({ ticker: t, error: String(err.message || err) });
    }
  }
  fs.writeFileSync(path.join(cacheDir, 'sec.failed.json'), JSON.stringify({ failed }, null, 2));
  if (failed.length) throw new Error(`SEC fetch incomplete: ${failed.length} ticker(s) failed: ${failed.map((f) => f.ticker).join(', ')}`);
  return { done: tickers.length };
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
    await fetchSec({ tickers, cacheDir });
    console.log('[sec] ok');
  } catch (err) {
    console.error(`[sec] FAILED: ${err.message}`);
    process.exit(1);
  }
}
