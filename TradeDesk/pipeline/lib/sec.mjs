#!/usr/bin/env node
/**
 * lib/sec.mjs — SEC EDGAR official sources (no key; contact-email UA required).
 *
 * Verified live 2026-10-14:
 *  - data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json — full us-gaap facts.
 *    REQUIREMENTS: User-Agent MUST contain a contact email (SEC blocks generic
 *    UAs), Accept-Encoding: gzip. CIK zero-padded to 10 digits.
 *    Fair-access: max 10 req/sec. Quirk: legacy "Revenues" tag is stale for
 *    many filers (e.g. Apple last used it FY2018) — try a tag priority list.
 *  - EFTS JSON search for Form 4 discovery:
 *    https://efts.sec.gov/LATEST/search-index?q=%224%22&dateRange=custom
 *      &startdt=YYYY-MM-DD&enddt=YYYY-MM-DD&forms=4
 *    Headers: contact-email UA + Accept: application/json + Host: efts.sec.gov.
 *  - Filing XML:
 *    https://www.sec.gov/Archives/edgar/data/{cikNoZeros}/{adshNoDashes}/{xmlFile}
 *    Values nest one level deep: <transactionDate><value>2026-09-29</value></…>
 *
 * Contact email: set SEC_CONTACT_EMAIL in the environment (a GitHub Actions
 * *variable*, not a secret — it's just an email). If unset we send a UA that
 * says so LOUDLY; SEC may 403 it, which will surface as a loud failure.
 */
import { fetchJson, fetchText, sleep } from './http.mjs';

const CONTACT = process.env.SEC_CONTACT_EMAIL || '';
if (!CONTACT) {
  console.error(
    '[sec] WARNING: SEC_CONTACT_EMAIL is not set. SEC requires a contact email in the User-Agent; ' +
    'requests may be blocked (HTTP 403). Set SEC_CONTACT_EMAIL env to a real contact address.'
  );
}
export const SEC_UA = CONTACT
  ? `TradeDesk stock-research ${CONTACT}`
  : 'TradeDesk stock-research (contact email NOT configured - set SEC_CONTACT_EMAIL)';

const SEC_HEADERS = { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip' };
// SEC fair access: ≤10 req/s → 150ms spacing is comfortably inside the limit.
const SEC_INTERVAL_MS = 150;

let tickerCikCache = null;

/** Fetch + cache the SEC ticker→CIK map (one request). Returns {TICKER: cik10}. */
export async function tickerToCikMap() {
  if (tickerCikCache) return tickerCikCache;
  const j = await fetchJson('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_UA },
    label: 'SEC company_tickers.json',
  });
  const map = {};
  for (const k of Object.keys(j)) {
    const row = j[k];
    if (row?.ticker && row?.cik_str != null) {
      map[String(row.ticker).toUpperCase()] = String(row.cik_str).padStart(10, '0');
    }
  }
  tickerCikCache = map;
  console.log(`[sec] ticker→CIK map loaded (${Object.keys(map).length} tickers)`);
  return map;
}

/** Full companyfacts JSON for a 10-digit CIK. */
export async function companyFacts(cik10) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
  return fetchJson(url, {
    headers: SEC_HEADERS,
    minIntervalMs: SEC_INTERVAL_MS,
    label: `SEC companyfacts CIK${cik10}`,
  });
}

/**
 * Resolve a tag reference to { taxonomy, tag }. Supports 'us-gaap:Tag' and
 * 'ifrs-full:Tag' prefixes; bare tags default to us-gaap.
 * Foreign filers (e.g. TSM, ASML) report under ifrs-full — without this,
 * their fundamentals silently come back empty.
 */
function resolveTag(facts, ref) {
  let taxonomy = 'us-gaap', tag = ref;
  const m = String(ref).match(/^([a-z-]+):(.+)$/);
  if (m) { taxonomy = m[1]; tag = m[2]; }
  const node = facts?.facts?.[taxonomy]?.[tag];
  return node ? { taxonomy, tag, node } : null;
}

/** us-gaap tag → ifrs-full equivalents tried when the us-gaap tag is absent. */
const IFRS_ALIASES = {
  RevenueFromContractWithCustomerExcludingAssessedTax: ['ifrs-full:Revenue'],
  Revenues: ['ifrs-full:Revenue'],
  SalesRevenueNet: ['ifrs-full:Revenue'],
  NetIncomeLoss: ['ifrs-full:ProfitLoss'],
  Assets: ['ifrs-full:Assets'],
  Liabilities: ['ifrs-full:Liabilities'],
  StockholdersEquity: ['ifrs-full:Equity'],
  GrossProfit: ['ifrs-full:GrossProfit'],
  NetCashProvidedByUsedInOperatingActivities: ['ifrs-full:CashFlowsFromUsedInOperatingActivities'],
  AssetsCurrent: ['ifrs-full:CurrentAssets'],
  LiabilitiesCurrent: ['ifrs-full:CurrentLiabilities'],
  RetainedEarningsAccumulatedDeficit: ['ifrs-full:RetainedEarnings'],
  OperatingIncomeLoss: ['ifrs-full:ProfitLossBeforeTax'],
};

function resolveAny(facts, ref) {
  return resolveTag(facts, ref)
    || (IFRS_ALIASES[ref] || []).map((a) => resolveTag(facts, a)).find(Boolean)
    || null;
}

// SEC form types carrying XBRL financials: US quarterly/annual + foreign annual.
const FACT_FORMS = new Set(['10-Q', '10-K', '20-F', '40-F']);

/**
 * Frame-aware ranking (added 2026-10-15 after finding a real bug: AAPL
 * revenue YoY computed as -65% because the year-ago matcher grabbed a
 * YEAR-TO-DATE unit (313.7B, 9-month 2025) instead of the quarterly unit
 * (94.0B, Q3 2025) — both share the same period-end date).
 * SEC companyfacts mixes three things in one units array: quarterly frames
 * (CY2026Q2), annual frames (CY2025), and unframed values (usually YTD).
 * Quarter-over-quarter math must compare like with like.
 */
function frameRank(u, quarterlyIntent = true) {
  const f = u.frame || '';
  if (quarterlyIntent) {
    if (/^CY\d{4}Q[1-4]$/.test(f)) return 0; // true quarterly value
    if (!f) return 1;                         // unframed — usually YTD, ambiguous
    return 2;                                 // annual / other frame
  }
  if (/^CY\d{4}$/.test(f)) return 0;
  if (!f) return 1;
  return 2;
}

/**
 * Latest quarterly value for a us-gaap tag, trying tags in priority order
 * (with ifrs-full fallback for foreign filers).
 * Returns { value, end, filed, tag } or null.
 */
export function latestQuarterlyValue(facts, tagPriority) {
  for (const ref of tagPriority) {
    const hit = resolveAny(facts, ref);
    if (!hit) continue;
    const units = hit.node?.units?.USD;
    if (!Array.isArray(units) || !units.length) continue;
    const q = units
      .filter((u) => FACT_FORMS.has(u.form) && u.end && u.val != null)
      .map((u) => ({ u, r: frameRank(u) }))
      .sort((a, b) => (a.r - b.r) || (a.u.end < b.u.end ? 1 : -1));
    if (q.length) {
      const u = q[0].u;
      return { value: u.val, end: u.end, filed: u.filed, tag: `${hit.taxonomy}:${hit.tag}` };
    }
  }
  return null;
}

/**
 * Year-ago value for the same resolved tag (period end ~365 days earlier).
 * `tag` here is the resolved "taxonomy:Tag" string from latestQuarterlyValue.
 * Returns { value, end } or null.
 */
export function yearAgoQuarterlyValue(facts, tag, refEnd) {
  const hit = resolveAny(facts, tag);
  if (!hit) return null;
  const units = hit.node?.units?.USD;
  if (!Array.isArray(units)) return null;
  const ref = new Date(refEnd + 'T12:00:00Z').getTime();
  let best = null;
  for (const u of units) {
    if (!FACT_FORMS.has(u.form) || !u.end || u.val == null) continue;
    const t = new Date(u.end + 'T12:00:00Z').getTime();
    const diffDays = Math.abs(t - ref) / 86400000;
    const r = frameRank(u); // prefer same frame type as the latest unit
    if (diffDays >= 300 && diffDays <= 430 &&
        (!best || r < best.r || (r === best.r && diffDays < best.diffDays))) {
      best = { value: u.val, end: u.end, diffDays, r };
    }
  }
  return best;
}

/**
 * EFTS JSON search for Form 4 filings in a date window.
 * Returns { total, hits: [{ adsh, xmlFile, ciks, file_date, display_names }] }.
 * Best-effort pagination via from/size; logs loudly if the server ignores them.
 */
export async function eftsForm4Search(startDate, endDate, { maxHits = 400 } = {}) {
  const base =
    `https://efts.sec.gov/LATEST/search-index?q=%224%22&dateRange=custom` +
    `&startdt=${startDate}&enddt=${endDate}&forms=4`;
  const first = await fetchJson(base, {
    headers: {
      'User-Agent': SEC_UA,
      Accept: 'application/json',
      Host: 'efts.sec.gov',
    },
    label: `EFTS Form 4 search ${startDate}→${endDate}`,
  });
  const total = first?.hits?.total?.value ?? first?.hits?.total ?? 0;
  let hits = first?.hits?.hits || [];
  console.log(`[sec] EFTS: ${total} Form 4 hits in window, first page returned ${hits.length}`);

  // Best-effort pagination if the server honors from/size.
  let from = hits.length;
  while (hits.length < Math.min(total, maxHits)) {
    const page = await fetchJson(`${base}&from=${from}&size=${Math.min(200, maxHits - hits.length)}`, {
      headers: { 'User-Agent': SEC_UA, Accept: 'application/json', Host: 'efts.sec.gov' },
      label: `EFTS Form 4 search page from=${from}`,
    });
    const batch = page?.hits?.hits || [];
    if (!batch.length) {
      console.warn(`[sec] EFTS pagination stopped: empty page at from=${from} (total claimed ${total})`);
      break;
    }
    if (batch[0]?._id === hits[hits.length - 1]?._id) {
      console.warn('[sec] EFTS ignores from/size pagination — using first page only');
      break;
    }
    hits = hits.concat(batch);
    from += batch.length;
  }

  return {
    total,
    hits: hits.slice(0, maxHits).map((h) => {
      const src = h?._source || h || {};
      const id = h?._id || '';
      // _id formats observed: "wk-form4_1790884669.xml" OR
      // "0001193125-26-421726:ownership.xml" (real filename is after the colon).
      const m = String(id).match(/:?([^/:]+\.xml)$/);
      return {
        adsh: src.adsh || '',
        xmlFile: m ? m[1] : '',
        ciks: src.ciks || [],
        file_date: src.file_date || '',
        display_names: src.display_names || [],
      };
    }),
  };
}

/** Fetch a Form 4 filing XML. accession like "0001628280-26-064214". */
export async function form4Xml(cikNoZeros, accession, xmlFile) {
  const adshPath = String(accession).replace(/-/g, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${adshPath}/${xmlFile}`;
  return fetchText(url, {
    headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip' },
    minIntervalMs: SEC_INTERVAL_MS,
    label: `SEC Form 4 XML ${accession}/${xmlFile}`,
  });
}

/* ── Targeted ownershipDocument XML extraction (no deps) ───────────────
 * Form 4 XML schema is stable; values nest one level deep in <value>.
 * We extract with anchored regexes rather than a full DOM parser.
 * Every extractor returns null (never throws) when the tag is absent.
 */

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function xv(block, tag) {
  const m = block.match(new RegExp(`<${tag}>\\s*<value>([^<]*)<\\/value>`, 'i'));
  return m ? m[1].trim() : null;
}
function xt(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}
function blocks(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/**
 * Parse a Form 4 ownershipDocument XML string.
 * Returns { ticker, ownerName, role, transactions: [{date, code, shares, price, acquiredDisposed}] }
 * or { error } on structural failure (caller logs).
 */
export function parseForm4(xml) {
  try {
    const ticker = xt(xml, 'issuerTradingSymbol');
    // Owner name is DIRECT text in most filings (<rptOwnerName>Name</…>),
    // <value>-nested in some older ones — try both. Decode HTML entities
    // (filings contain e.g. "Chairperson &amp; CEO").
    const ownerName = decodeEntities(xt(xml, 'rptOwnerName') || xv(xml, 'rptOwnerName'));
    if (!ticker || !ownerName) return { error: 'missing issuerTradingSymbol or rptOwnerName' };

    const flag = (tag) => {
      const v = (xv(xml, tag) || xt(xml, tag) || '').toLowerCase();
      return v === '1' || v === 'true';
    };
    const officerTitle = decodeEntities(xv(xml, 'officerTitle') || xt(xml, 'officerTitle'));
    const role = officerTitle || (flag('isOfficer') ? 'Officer' : null) || (flag('isDirector') ? 'Director' : null) || (flag('isTenPercentOwner') ? '10% Owner' : null) || 'Insider';

    const transactions = [];
    for (const t of blocks(xml, 'nonDerivativeTransaction')) {
      const date = xv(t, 'transactionDate');
      // Code lives at transactionCoding/transactionCode as DIRECT text
      // (e.g. <transactionCode>M</transactionCode>), not <value>-nested.
      const code = xt(t, 'transactionCode');
      const sharesRaw = xv(t, 'transactionShares');
      const priceRaw = xv(t, 'transactionPricePerShare');
      const ad = xv(t, 'transactionAcquiredDisposedCode');
      if (!date || !code) continue; // skip malformed rows, don't fail the filing
      transactions.push({
        date,
        code: code.toUpperCase(),
        shares: sharesRaw != null && sharesRaw !== '' ? parseFloat(sharesRaw) : null,
        price: priceRaw != null && priceRaw !== '' ? parseFloat(priceRaw) : null,
        acquiredDisposed: ad ? ad.toUpperCase() : null,
      });
    }
    return { ticker: ticker.toUpperCase(), ownerName, role, transactions };
  } catch (e) {
    return { error: `parse exception: ${e.message}` };
  }
}
