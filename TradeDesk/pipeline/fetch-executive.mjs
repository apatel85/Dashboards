#!/usr/bin/env node
/**
 * fetch-executive.mjs — White House / executive-branch trade disclosures.
 *
 * Source: DisclosedCapitol's open dataset (OGE Form 278 / 278-T filings,
 * parsed from official Office of Government Ethics PDFs), refreshed nightly
 * upstream. Covers the President, Vice President, Cabinet and senior
 * appointees — the STOCK Act's periodic transaction reporting applies to
 * them just as it does to Congress (filings within ~45 days of a >$1,000
 * transaction).
 *
 * $0, keyless: pulls the published CSV straight from the public GitHub repo.
 * No API key needed for the exported files.
 *
 * Writes executive.json into $OUT_DIR (default ../public/data), normalized
 * to the same shape as congress.json so the app can share its views.
 *
 * Honest limits baked in:
 *  - Tickers are OFTEN absent upstream ('N/A' or category labels like BOND,
 *    MUNI, ETF). Rows keep the human asset description; aggregation groups
 *    by a normalized asset key instead of inventing tickers.
 *  - Upstream refresh lags OGE publication (check max filing_date in logs).
 *  - Spouse/dependent-child transactions appear on the filer's form but are
 *    not distinguished in this feed; "associates" are not covered by
 *    disclosure law at all.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const SRC = 'https://raw.githubusercontent.com/disclosedcapitol/executive-branch-trades/main/data/executive_trades.csv';

const UA = 'TradeDesk/1.0 (stock research dashboard; contact via repo) Mozilla/5.0';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Corporate suffixes stripped when matching asset descriptions to SEC names.
const SUFFIX_RE = /\b(INCORPORATED|CORPORATION|LIMITED|COMPANY)\b|\b(INC|CORP|LTD|LLC|CO|PLC|LP|LLP|SA|NV|AG|HOLDINGS|HOLDING|GROUP|INTERNATIONAL|INTL|COM)\b/g;

function normName(s) {
  return String(s || '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bCLASS\s+[A-Z]\b/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a normalized company-name → ticker index from SEC company_tickers.json
 * so filings that name "NVIDIA CORP" but carry ticker "N/A" still aggregate
 * under NVDA. First match wins on ambiguous names (e.g. GOOGL/GOOG).
 */
async function buildNameIndex() {
  const secUa = process.env.SEC_CONTACT_EMAIL
    ? `TradeDesk stock-research ${process.env.SEC_CONTACT_EMAIL}`
    : 'TradeDesk stock-research (contact email NOT configured - set SEC_CONTACT_EMAIL)';
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': secUa },
  });
  if (!res.ok) throw new Error(`SEC company_tickers HTTP ${res.status}`);
  const j = await res.json();
  const idx = new Map();
  for (const k of Object.keys(j)) {
    const row = j[k];
    const n = normName(row?.title);
    if (n && row?.ticker && !idx.has(n)) idx.set(n, String(row.ticker).toUpperCase());
  }
  console.log(`[executive] SEC name index: ${idx.size} names`);
  return idx;
}

// Category labels upstream stuffs into the ticker column — never real tickers.
const PSEUDO_TICKERS = new Set([
  'N/A', 'NA', 'MUNI', 'BOND', 'ETF', 'FUND', 'TREAS', 'TRUST', 'LP', 'THE',
  'CASH', 'GOLD', 'STOCK', 'INDEX', 'IRA', 'LLC', 'INC',
]);

function plausibleTicker(raw) {
  const t = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(t)) return null;
  if (PSEUDO_TICKERS.has(t)) return null;
  return t;
}

function normType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'buy') return 'buy';
  if (t === 'sale' || t === 'sell') return 'sell';
  if (t === 'exchange') return 'exchange';
  return null;
}

/** "$1,001 - $15,000" → midpoint. Returns null when unparseable. */
function amountMid(range) {
  const nums = String(range || '').replace(/[$,]/g, '').match(/[\d.]+/g);
  if (!nums || nums.length === 0) return null;
  const vals = nums.map(Number).filter(isFinite);
  if (vals.length === 0) return null;
  return (vals[0] + vals[vals.length - 1]) / 2;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function parseCsv(text) {
  // Minimal CSV parser handling quoted fields with commas.
  const rows = [];
  let cur = [''];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; }
        else inQ = false;
      } else cur[cur.length - 1] += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') cur.push('');
    else if (ch === '\n') { rows.push(cur); cur = ['']; }
    else if (ch !== '\r') cur[cur.length - 1] += ch;
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

async function main() {
  console.log('[executive] downloading DisclosedCapitol dataset…');
  const res = await fetch(SRC, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`dataset HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  console.log(`[executive] ${rows.length} raw rows`);

  let nameIndex = null;
  try {
    nameIndex = await buildNameIndex();
  } catch (e) {
    console.warn(`[executive] SEC name index unavailable (${e.message}) — N/A tickers will aggregate by description`);
  }
  let resolved = 0;

  const trades = [];
  let skipped = 0;
  let noFilingDate = 0;
  for (const r of rows) {
    const tx = String(r.transaction_date || '').slice(0, 10);
    const filedRaw = String(r.filing_date || '').slice(0, 10);
    const filed = DATE_RE.test(filedRaw) ? filedRaw : null;
    const type = normType(r.transaction_type);
    const asset = String(r.asset_description || '').trim();
    if (!DATE_RE.test(tx) || !type || !asset) {
      skipped++;
      continue;
    }
    if (!filed) noFilingDate++;
    let ticker = plausibleTicker(r.ticker);
    if (!ticker && nameIndex) {
      const hit = nameIndex.get(normName(asset));
      if (hit) {
        ticker = hit;
        resolved++;
      }
    }
    const aggKey = ticker ?? `DESC:${asset.toUpperCase().replace(/\s+/g, ' ')}`;
    trades.push({
      member: String(r.filer_name || '').trim() || 'Unknown official',
      role: String(r.role_title || '').trim() || null,
      agency: String(r.agency || '').trim() || null,
      chamber: 'Executive',
      // party/state/committee are always null for executive rows — omitted
      // to keep the 37k-row file lean; the app branches on chamber instead.
      ticker,
      agg_key: aggKey,
      asset_name: asset,
      trade_type: type,
      amount_range: String(r.amount_range || '').trim(),
      amount_mid: amountMid(r.amount_range),
      tx_date: tx,
      disclosed_date: filed, // null when upstream lacks it (common on annual-278 rows)
      lag_days: filed ? daysBetween(tx, filed) : null,
      doc_url: String(r.disclosedcapitol_url || '').trim() || null,
      cluster: false, // computed below
    });
  }
  console.log(`[executive] normalized ${trades.length} trades, skipped ${skipped} malformed rows (${noFilingDate} lack a filing date, ${resolved} tickers resolved via SEC names)`);

  // Cluster detection: 2+ distinct officials buying the same asset within 7 days.
  const buysByKey = new Map();
  for (const t of trades) {
    if (t.trade_type !== 'buy') continue;
    if (!buysByKey.has(t.agg_key)) buysByKey.set(t.agg_key, []);
    buysByKey.get(t.agg_key).push(t);
  }
  let clustered = 0;
  for (const buys of buysByKey.values()) {
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
      clustered++;
      for (const b of buys) b.cluster = true;
    }
  }
  console.log(`[executive] ${clustered} assets flagged as official-buy clusters`);

  // Newest first by publication date, falling back to trade date when the
  // filing date is unknown upstream (common on annual-278 rows).
  const sortKey = (t) => t.disclosed_date || t.tx_date;
  trades.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));

  const filers = new Set(trades.map((t) => t.member)).size;
  const maxFiled = trades.find((t) => t.disclosed_date)?.disclosed_date ?? null;
  console.log(`[executive] ${filers} officials · latest filing ${maxFiled}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, 'executive.json');
  writeFileSync(out, JSON.stringify(trades));
  console.log(`[write] ${out} (${trades.length} trades)`);
}

main().catch((e) => {
  console.error('[executive] FATAL', e.message);
  process.exit(1);
});
