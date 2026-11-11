#!/usr/bin/env node
/**
 * fetch-congress-quantgress.mjs — Quantgress second source → merge into data/congress.json.
 *
 * WHY: our primary source (congressinfor Railway API, fetch-congress.mjs)
 * lags ~1 day ingesting House Clerk filings — the Nov 10, 2026 Cisneros /
 * Julie Johnson filings were still absent at Nov 11 13:26 ET. Quantgress
 * scrapes the same primary sources (House Clerk PTR PDFs, Senate eFD)
 * directly and serves them over a free hosted API, so it is the $0 second
 * source. (Quiver was evaluated first and rejected: no free API tier —
 * Hobbyist is $30/mo. See fetch-congress-quiver.mjs, built but unwired.)
 *
 * COST — FREE, verified against Quantgress's own code, not just its blog:
 * - https://api.quantgress.dhruvmulajkar.me/api.html — "Free tier: sign up
 *   with an email, get a key. Capped request volume." (paid tier pricing
 *   "not finalized yet" — no paid tier exists to graduate into).
 * - api.py in github.com/DMulajkar/Quantgress: RATE_LIMIT = "500/day",
 *   "one limit for everyone, no tier differentiation". This script makes
 *   exactly ONE call per run.
 * - Signup: POST https://api.quantgress.dhruvmulajkar.me/signup with
 *   {"email": "..."} → {"api_key": "..."} in the response. Free, no card,
 *   instant (no email confirmation in the code). One active key per email;
 *   keys are shown once and never re-displayed — if lost, contact support
 *   (dhruvmulajkar@vt.edu). Signup is rate-limited to 5/day per IP.
 *
 * Endpoint: GET https://api.quantgress.dhruvmulajkar.me/trades?limit=1000
 * Auth: X-API-Key header. Response: bare JSON array of the `trades` view
 * (api.py: SELECT * FROM trades ORDER BY txn_date DESC LIMIT ? OFFSET ?).
 * Fields per row: chamber ('S'/'H'), last_name, first_name, tkr, asset_name,
 * tx_type ("Purchase" / "Sale" / "Sale (Full)" / "Sale (Partial)" /
 * "Exchange"), amount_low, amount_high, txn_date, filed_date, lag_days,
 * asset_type, owner, tkr_recovered, office, link (filing PDF URL).
 *
 * DATE CONVENTIONS (do not conflate them):
 * - Our canonical `disclosed_date` is the date ON the filing itself
 *   (Clerk PTR PDF). Quantgress's `filed_date` is parsed from the same
 *   filing, so for matched rows it should EQUAL disclosed_date in most
 *   cases. When it differs we record it in `quantgress_filed_date` and
 *   NEVER overwrite disclosed_date.
 * - Rows ONLY in Quantgress (the fresh ones) enter with disclosed_date =
 *   filed_date, `source: "quantgress"`, and `quantgress_filed_date` set.
 *   Base rows are backfilled with `source: "congressinfor"`.
 *
 * COVERAGE LIMIT (honest): /trades orders by TRANSACTION date, not filing
 * date, and offers no filed-date filter or ordering — so one call with
 * limit=1000 returns the 1000 most recently TRANSACTED trades. A filing
 * made today for a trade months old would be missed. In practice the
 * window is wide (our 3,982-row file has only 318 trades with tx_date
 * >= 2026-09-01, so 1000 rows reach back to ~early 2026) and the Nov 10
 * filings' trades are Oct 7–Nov 2, well inside. The script logs the
 * filed_date range in the response on every run so coverage is visible.
 *
 * DEDUPE KEY: normalized member (first+last name, suffixes dropped) +
 * ticker + tx_date + amount midpoint + trade type. Same as
 * fetch-congress-quiver.mjs.
 *
 * SAFETY: exits loudly (exit 1) if QUANTGRESS_API_KEY is missing, if the
 * base congress.json is missing (run fetch-congress.mjs first), or if the
 * API returns 401/403/429/anything unexpected. It NEVER writes a partial
 * or empty congress.json — on failure the previous file is left untouched.
 *
 * Usage: QUANTGRESS_API_KEY=... OUT_DIR=/path/to/public/data node fetch-congress-quantgress.mjs
 * (Intended as refresh.sh step 1b, right after fetch-congress.mjs, non-fatal
 * until the key is verified live. QUANTGRESS_API_URL overrides the API base
 * — used by the offline fixture test, not in production.)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJson } from './lib/http.mjs';
import { writeJsonAtomic, daysBetween, r2 } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const API = (process.env.QUANTGRESS_API_URL || 'https://api.quantgress.dhruvmulajkar.me').replace(/\/$/, '');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format amount bounds the way congress.json does: "$1,001 - $15,000". */
function amountRange(low, high) {
  const fmt = (n) => `$${Number(n).toLocaleString('en-US')}`;
  if (low == null) return '';
  if (high == null) return fmt(low);
  return `${fmt(low)} - ${fmt(high)}`;
}

function amountMid(low, high) {
  if (low == null) return null;
  if (high == null) return r2(low);
  return r2((Number(low) + Number(high)) / 2);
}

function normTradeType(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (t === 'purchase' || t === 'buy' || t === 'acquire') return 'buy';
  if (t.startsWith('sale') || t === 'sell' || t === 'dispose') return 'sell';
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
function dedupeKey(member, ticker, txDate, amountMidVal, amountRangeStr, type) {
  const amt = amountMidVal != null ? String(amountMidVal) : String(amountRangeStr || '').toLowerCase().replace(/\s+/g, '');
  return [normMember(member), ticker, txDate, amt, type].join('|');
}

function chamberOf(raw) {
  return String(raw || '').toUpperCase() === 'S' ? 'Senate' : 'House';
}

function stateOf(office) {
  // House office is usually "CA12" / "CA-12" style; Senate office is the
  // state name. Best effort only — null when it doesn't parse.
  const m = String(office || '').match(/^([A-Z]{2})[\s-]*\d/);
  return m ? m[1] : null;
}

async function fetchQuantgressTrades(key) {
  const url = `${API}/trades?limit=1000`;
  let rows;
  try {
    rows = await fetchJson(url, {
      headers: { 'X-API-Key': key },
      label: 'quantgress /trades',
    });
  } catch (e) {
    if (e.status === 401) {
      throw new Error(
        'Quantgress API returned HTTP 401 — QUANTGRESS_API_KEY is invalid or revoked. ' +
          'Sign up free at https://quantgress.dhruvmulajkar.me/api.html (POST /signup, email only, no card) and store the key as the QUANTGRESS_API_KEY repo secret.',
      );
    }
    if (e.status === 403) {
      throw new Error('Quantgress API returned HTTP 403 — the key is not authorized for this dataset.');
    }
    if (e.status === 429) {
      throw new Error('Quantgress API returned HTTP 429 — free-tier limit is 500 requests/day; this script makes 1 call/run, so a 429 means the key is shared or the limit was hit elsewhere.');
    }
    throw e;
  }
  if (!Array.isArray(rows)) {
    throw new Error(`Quantgress API returned an unexpected shape (expected a JSON array, got ${typeof rows}) — refusing to merge.`);
  }
  console.log(`[quantgress] fetched ${rows.length} trade rows (limit=1000, ordered by txn_date DESC)`);
  if (rows.length) {
    const filed = rows.map((r) => String(r.filed_date || '').slice(0, 10)).filter((d) => DATE_RE.test(d)).sort();
    const txn = rows.map((r) => String(r.txn_date || '').slice(0, 10)).filter((d) => DATE_RE.test(d)).sort();
    if (filed.length) console.log(`[quantgress] filed_date range in response: ${filed[0]} .. ${filed[filed.length - 1]}`);
    if (txn.length) console.log(`[quantgress] txn_date range in response: ${txn[0]} .. ${txn[txn.length - 1]}`);
  }
  return rows;
}

async function main() {
  const key = (process.env.QUANTGRESS_API_KEY || '').trim();
  if (!key) {
    console.error(
      '[quantgress] FATAL: QUANTGRESS_API_KEY is not set. The key is FREE — sign up at ' +
        'https://quantgress.dhruvmulajkar.me/api.html (POST /signup with an email, no card, instant; key is returned in the response) ' +
        'and add it as the QUANTGRESS_API_KEY repo secret. Refusing to run with no key.',
    );
    process.exit(1);
  }

  const congressPath = path.join(OUT_DIR, 'congress.json');
  if (!fs.existsSync(congressPath)) {
    console.error(`[quantgress] FATAL: base file missing: ${congressPath} — run fetch-congress.mjs first (refresh.sh step 1). Refusing to write a Quantgress-only file.`);
    process.exit(1);
  }
  const trades = JSON.parse(fs.readFileSync(congressPath, 'utf8'));
  if (!Array.isArray(trades)) {
    console.error('[quantgress] FATAL: congress.json is not a JSON array — refusing to merge.');
    process.exit(1);
  }
  console.log(`[quantgress] base congress.json: ${trades.length} rows`);

  const raw = await fetchQuantgressTrades(key);

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
    const ticker = String(r.tkr || '').trim().toUpperCase();
    const tx = String(r.txn_date || '').slice(0, 10);
    const filed = String(r.filed_date || '').slice(0, 10);
    const type = normTradeType(r.tx_type);
    if (!ticker || !DATE_RE.test(tx) || !DATE_RE.test(filed) || !type) {
      skipped++;
      continue;
    }
    const first = String(r.first_name || '').trim();
    const last = String(r.last_name || '').trim();
    const member = [first, last].filter(Boolean).join(' ') || 'Unknown member';
    const low = r.amount_low != null ? Number(r.amount_low) : null;
    const high = r.amount_high != null ? Number(r.amount_high) : null;
    const range = amountRange(low, high);
    const mid = amountMid(low, high);
    const keyStr = dedupeKey(member, ticker, tx, mid, range, type);
    const existing = byKey.get(keyStr);
    if (existing) {
      matched++;
      // Enrich, never overwrite the canonical disclosed_date.
      if (existing.quantgress_filed_date == null && filed !== existing.disclosed_date) {
        existing.quantgress_filed_date = filed;
        enriched++;
      }
      if (existing.doc_url == null && r.link) existing.doc_url = String(r.link).trim();
      if (existing.state == null) {
        const st = stateOf(r.office);
        if (st) existing.state = st;
      }
      continue;
    }
    trades.push({
      member,
      chamber: chamberOf(r.chamber),
      party: null, // Quantgress does not provide party
      state: stateOf(r.office),
      committee: null, // Quantgress does not provide committee assignments
      ticker,
      asset_name: String(r.asset_name || '').trim() || ticker,
      trade_type: type,
      amount_range: range,
      amount_mid: mid,
      tx_date: tx,
      // Quantgress-only row: filed_date is parsed from the filing itself,
      // the same convention as our canonical disclosed_date. Flagged by source.
      disclosed_date: filed,
      lag_days: daysBetween(tx, filed),
      doc_url: r.link ? String(r.link).trim() : null,
      cluster: false, // computed below across the merged set
      source: 'quantgress',
      quantgress_filed_date: filed,
    });
    byKey.set(keyStr, trades[trades.length - 1]);
    added++;
  }
  console.log(`[quantgress] matched ${matched} existing rows (enriched ${enriched} with a differing quantgress_filed_date), added ${added} Quantgress-only rows, skipped ${skipped} malformed/unresolvable rows`);

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
  console.log(`[quantgress] ${clusteredTickers} tickers flagged as member-buy clusters (merged set)`);

  trades.sort((a, b) => (a.disclosed_date < b.disclosed_date ? 1 : -1));
  writeJsonAtomic(congressPath, trades);
  console.log(`[quantgress] merged congress.json written: ${trades.length} rows (${added} new from Quantgress)`);
}

main().catch((e) => {
  console.error(`[quantgress] FATAL: ${e.message}`);
  process.exit(1);
});
