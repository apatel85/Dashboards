#!/usr/bin/env node
/**
 * fetch-congress-quiver.mjs — Quiver second source → merge into data/congress.json.
 *
 * WHY: our primary source (congressinfor Railway API, fetch-congress.mjs)
 * lags ~1 day ingesting House Clerk filings — the Nov 10, 2026 Cisneros /
 * Julie Johnson filings were still absent at Nov 11 13:26 ET, while Quiver
 * had them by 09:19 ET the same day. This fetcher merges Quiver's fresh rows
 * into the same congress.json shape so filings show up the same day.
 *
 * Endpoint: GET https://api.quiverquant.com/beta/live/congresstrading?normalized=true
 * Auth: Authorization: Bearer <QUIVER_API_KEY>. Rate limit: 200 req/hour
 * (Live Congress Trading) — this script makes exactly ONE call per run.
 *
 * COST — READ THIS: there is NO free Quiver API tier. Verified against
 * Quiver's own docs (api.quiverquant.com/docs/plans-and-access, Nov 5, 2026):
 * Hobbyist is $30/month or $300/year and is the cheapest plan that includes
 * congressional trading. Hobbyist/Trader are personal, non-commercial use.
 * Sign up at https://api.quiverquant.com/pricing/ — the key is on
 * https://api.quiverquant.com/dashboard/ after subscribing. Do NOT ask for
 * a "free Quiver key": one does not exist.
 *
 * DATE CONVENTIONS (do not conflate them):
 * - Our canonical `disclosed_date` is the date ON the filing itself
 *   (Clerk PTR PDF). For rows already in congress.json we KEEP that date.
 * - Quiver's `ReportDate` is the date Quiver reports/indexes the trade
 *   (e.g. Kustoff WBD: Clerk PDF says 2026-11-09, Quiver says Filed
 *   Nov 10, 2026). When a Quiver row matches an existing row we record
 *   Quiver's date in `quiver_filed_date` and NEVER overwrite disclosed_date.
 * - Rows ONLY in Quiver (the fresh ones) enter with disclosed_date = the
 *   Quiver ReportDate date part, `source: "quiver"`, and
 *   `quiver_filed_date` set to the same date, so the UI/pipeline can tell
 *   them apart from congressinfor rows (`source: "congressinfor"`).
 *
 * DEDUPE KEY: normalized member (first+last name, suffixes dropped) +
 * ticker + tx_date + amount midpoint + trade type. Known name gap this
 * handles: congressinfor "Gilbert Cisneros" vs Quiver "Gilbert Ray
 * Cisneros, Jr." — both normalize to "gilbertcisneros".
 *
 * SAFETY: exits loudly (exit 1) if QUIVER_API_KEY is missing, if the base
 * congress.json is missing (run fetch-congress.mjs first), or if the API
 * returns 401/403/anything unexpected. It NEVER writes a partial or empty
 * congress.json — on failure the previous file is left untouched.
 *
 * Usage: QUIVER_API_KEY=... OUT_DIR=/path/to/public/data node fetch-congress-quiver.mjs
 * (Intended as refresh.sh step 1b, right after fetch-congress.mjs, non-fatal
 * until the key is verified live — see the wiring note in the report.)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJson } from './lib/http.mjs';
import { writeJsonAtomic, daysBetween, r2 } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const API = 'https://api.quiverquant.com';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "$1,001 - $15,000" → 8000.5 ; "$50,000" → 50000 ; garbage → null. (Same as fetch-congress.mjs.) */
function amountMid(s) {
  if (!s) return null;
  const nums = [...String(s).matchAll(/[\d,]+(?:\.\d+)?/g)]
    .map((m) => parseFloat(m[0].replace(/,/g, '')))
    .filter(Number.isFinite);
  if (nums.length >= 2) return r2((nums[0] + nums[1]) / 2);
  if (nums.length === 1) return r2(nums[0]);
  return null;
}

function normTradeType(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (t === 'purchase' || t === 'buy' || t === 'acquire') return 'buy';
  if (t === 'sale' || t === 'sell' || t === 'dispose') return 'sell';
  if (t === 'exchange') return 'exchange';
  return null;
}

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
/** "Gilbert Ray Cisneros, Jr." and "Gilbert Cisneros" → "gilbertcisneros". */
function normMember(name) {
  const toks = String(name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NAME_SUFFIXES.has(t));
  if (toks.length === 0) return '';
  if (toks.length === 1) return toks[0];
  return `${toks[0]}${toks[toks.length - 1]}`;
}

/** Dedupe key: member + ticker + tx_date + amount + type. */
function dedupeKey(member, ticker, txDate, amountMidVal, amountRange, type) {
  const amt = amountMidVal != null ? String(amountMidVal) : String(amountRange || '').toLowerCase().replace(/\s+/g, '');
  return [normMember(member), ticker, txDate, amt, type].join('|');
}

function chamberOf(raw) {
  return String(raw || '').toLowerCase().includes('senate') ? 'Senate' : 'House';
}

function stateOf(district) {
  const m = String(district || '').match(/^([A-Z]{2})-/);
  return m ? m[1] : null;
}

async function fetchQuiverTrades(key) {
  const url = `${API}/beta/live/congresstrading?normalized=true`;
  let rows;
  try {
    rows = await fetchJson(url, {
      headers: { Authorization: `Bearer ${key}` },
      label: 'quiver live/congresstrading',
    });
  } catch (e) {
    if (e.status === 401) {
      throw new Error(
        'Quiver API returned HTTP 401 — QUIVER_API_KEY is invalid or missing. ' +
          'Get a key at https://api.quiverquant.com/pricing/ (Hobbyist $30/mo) and store it as the QUIVER_API_KEY repo secret.',
      );
    }
    if (e.status === 403) {
      throw new Error(
        'Quiver API returned HTTP 403 — this plan does not include congressional trading, or there is no active plan. ' +
          'Congressional trading is in every plan from Hobbyist ($30/mo) up; check the plan status at https://api.quiverquant.com/dashboard/.',
      );
    }
    throw e;
  }
  if (!Array.isArray(rows)) {
    throw new Error(`Quiver API returned an unexpected shape (expected a JSON array, got ${typeof rows}) — refusing to merge.`);
  }
  console.log(`[quiver] fetched ${rows.length} live trade rows`);
  if (rows.length) {
    const dates = rows.map((r) => String(r.ReportDate || '').slice(0, 10)).filter((d) => DATE_RE.test(d)).sort();
    if (dates.length) console.log(`[quiver] ReportDate range in response: ${dates[0]} .. ${dates[dates.length - 1]}`);
  }
  return rows;
}

async function main() {
  const key = (process.env.QUIVER_API_KEY || '').trim();
  if (!key) {
    console.error(
      '[quiver] FATAL: QUIVER_API_KEY is not set. There is NO free Quiver API tier — ' +
        'subscribe to Hobbyist ($30/mo) at https://api.quiverquant.com/pricing/, copy the key from ' +
        'https://api.quiverquant.com/dashboard/, and add it as the QUIVER_API_KEY repo secret. Refusing to run with no key.',
    );
    process.exit(1);
  }

  const congressPath = path.join(OUT_DIR, 'congress.json');
  if (!fs.existsSync(congressPath)) {
    console.error(`[quiver] FATAL: base file missing: ${congressPath} — run fetch-congress.mjs first (refresh.sh step 1). Refusing to write a Quiver-only file.`);
    process.exit(1);
  }
  const trades = JSON.parse(fs.readFileSync(congressPath, 'utf8'));
  if (!Array.isArray(trades)) {
    console.error('[quiver] FATAL: congress.json is not a JSON array — refusing to merge.');
    process.exit(1);
  }
  console.log(`[quiver] base congress.json: ${trades.length} rows`);

  const raw = await fetchQuiverTrades(key);

  // Index existing rows by dedupe key.
  const byKey = new Map();
  for (const t of trades) {
    if (t.source == null) t.source = 'congressinfor'; // backfill provenance on base rows
    byKey.set(dedupeKey(t.member, t.ticker, t.tx_date, t.amount_mid, t.amount_range, t.trade_type), t);
  }

  let matched = 0;
  let enriched = 0;
  let added = 0;
  let skipped = 0;
  for (const r of raw) {
    const ticker = String(r.Ticker || '').trim().toUpperCase();
    const tx = String(r.TransactionDate || '').slice(0, 10);
    const filed = String(r.ReportDate || '').slice(0, 10);
    const type = normTradeType(r.Transaction);
    if (!ticker || !DATE_RE.test(tx) || !DATE_RE.test(filed) || !type) {
      skipped++;
      continue;
    }
    const member = String(r.Representative || '').trim() || 'Unknown member';
    const range = String(r.Range || '').trim();
    const mid = amountMid(range);
    const keyStr = dedupeKey(member, ticker, tx, mid, range, type);
    const existing = byKey.get(keyStr);
    if (existing) {
      matched++;
      // Enrich, never overwrite the canonical disclosed_date.
      if (existing.quiver_filed_date == null && filed !== existing.disclosed_date) {
        existing.quiver_filed_date = filed;
        enriched++;
      }
      if (existing.party == null && r.Party) existing.party = String(r.Party).trim();
      if (existing.state == null) {
        const st = stateOf(r.District);
        if (st) existing.state = st;
      }
      continue;
    }
    trades.push({
      member,
      chamber: chamberOf(r.House),
      party: String(r.Party || '').trim() || null,
      state: stateOf(r.District),
      committee: null, // Quiver does not provide committee assignments
      ticker,
      asset_name: String(r.Description || '').trim() || ticker,
      trade_type: type,
      amount_range: range,
      amount_mid: mid,
      tx_date: tx,
      // Quiver-only row: no congressinfor date exists, so the Quiver
      // ReportDate is the best disclosed date we have. Flagged by source.
      disclosed_date: filed,
      lag_days: daysBetween(tx, filed),
      doc_url: null, // Quiver provides no filing link
      cluster: false, // computed below across the merged set
      source: 'quiver',
      quiver_filed_date: filed,
    });
    byKey.set(keyStr, trades[trades.length - 1]);
    added++;
  }
  console.log(`[quiver] matched ${matched} existing rows (enriched ${enriched} with a differing quiver_filed_date), added ${added} Quiver-only rows, skipped ${skipped} malformed rows`);

  // Recompute clusters across the merged set (same rule as fetch-congress.mjs:
  // 2+ distinct members buying the same ticker with trade dates within 7 days).
  for (const t of trades) t.cluster = false;
  const buysByTicker = new Map();
  for (const t of trades) {
    if (t.trade_type !== 'buy') continue;
    if (!buysByTicker.has(t.ticker)) buysByTicker.set(t.ticker, []);
    buysByTicker.get(t.ticker).push(t);
  }
  let clusteredTickers = 0;
  for (const [ticker, buys] of buysByTicker) {
    let hit = false;
    for (let i = 0; i < buys.length && !hit; i++) {
      for (let j = i + 1; j < buys.length; j++) {
        if (buys[i].member !== buys[j].member && Math.abs(daysBetween(buys[i].tx_date, buys[j].tx_date)) <= 7) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      clusteredTickers++;
      for (const b of buys) b.cluster = true;
    }
  }
  console.log(`[quiver] ${clusteredTickers} tickers flagged as member-buy clusters (merged set)`);

  trades.sort((a, b) => (a.disclosed_date < b.disclosed_date ? 1 : -1));
  writeJsonAtomic(congressPath, trades);
  console.log(`[quiver] merged congress.json written: ${trades.length} rows (${added} new from Quiver)`);
}

main().catch((e) => {
  console.error(`[quiver] FATAL: ${e.message}`);
  process.exit(1);
});
