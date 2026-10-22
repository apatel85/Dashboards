#!/usr/bin/env node
/**
 * build-fundamentals.mjs — company name, sector, sub-sector + key fundamental
 * metrics for every ticker the pipeline tracks.
 *
 * Collects tickers from research.json, signals.json, daily-brief.json
 * (breakout candidates), lotto.json, earnings.json, and congress.json,
 * then pulls Yahoo quoteSummary [price, summaryDetail, defaultKeyStatistics,
 * financialData, assetProfile] for each.
 *
 * Writes public/data/fundamentals.json:
 *   { as_of, source, count, fundamentals: { TICKER: {
 *       name, sector, subsector, market_cap,
 *       pe_trailing, pe_forward, peg, pb, ps,
 *       profit_margin, roe, debt_equity, beta, div_yield,
 *       eps_trailing, eps_forward } } }
 *
 * $0, keyless (Yahoo quoteSummary, crumb session). Non-fatal by design.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooQuoteSummary } from './lib/yahoo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

const raw = (v) => (v && typeof v === 'object' && 'raw' in v ? v.raw : v ?? null);
const r2 = (v) => {
  const n = raw(v);
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** Gather every ticker the app displays, from all data files.
 * Returns { hot: Set (display tickers, refreshed daily),
 *           warm: Set (all congress tickers, backfilled over days) }. */
function collectTickers() {
  const hot = new Set();
  const warm = new Set();
  const addHot = (t) => {
    t = String(t || '').toUpperCase().trim();
    if (t && !t.startsWith('^')) hot.add(t);
  };
  const addWarm = (t) => {
    t = String(t || '').toUpperCase().trim();
    if (t && !t.startsWith('^')) warm.add(t);
  };

  const research = readJson('research.json');
  if (Array.isArray(research)) for (const i of research) addHot(i.ticker);

  const signals = readJson('signals.json');
  const sigList = Array.isArray(signals) ? signals : signals?.signals || signals?.items || [];
  if (Array.isArray(sigList)) for (const s of sigList) addHot(s.ticker);

  const brief = readJson('daily-brief.json');
  const cands = brief?.breakout_candidates || brief?.candidates || [];
  if (Array.isArray(cands)) for (const c of cands) addHot(c.ticker || c.symbol);

  const lotto = readJson('lotto.json');
  const lcands = lotto?.candidates || lotto?.top25 || [];
  if (Array.isArray(lcands)) for (const c of lcands) addHot(c.ticker);

  const earnings = readJson('earnings.json');
  const elist = Array.isArray(earnings) ? earnings : earnings?.entries || earnings?.items || [];
  if (Array.isArray(elist)) for (const e of elist) addHot(e.ticker);

  const congress = readJson('congress.json');
  const clist = Array.isArray(congress) ? congress : congress?.trades || congress?.items || [];
  if (Array.isArray(clist)) for (const t of clist) addWarm(t.ticker || t.symbol);

  // Warm tickers already hot don't need double handling.
  for (const t of hot) warm.delete(t);
  return { hot: [...hot], warm: [...warm] };
}

// Max Yahoo calls per run to bound runtime (~1.5s each).
const MAX_FETCH_PER_RUN = 250;
// Hot tickers refresh daily; warm tickers refresh every 14 days.
const HOT_STALE_MS = 24 * 3600 * 1000;
const WARM_STALE_MS = 14 * 24 * 3600 * 1000;

const MODULES = ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile', 'incomeStatementHistory'];

function growthRates(incomeHist) {
  // incomeStatementHistory: annual statements, oldest first (usually 4).
  const revs = (incomeHist || [])
    .map((s) => raw(s.totalRevenue))
    .filter((v) => typeof v === 'number' && v > 0);
  if (revs.length < 2) return { revenue_growth_yoy: null, revenue_cagr_3y: null };
  const yoy = (revs[revs.length - 1] - revs[revs.length - 2]) / revs[revs.length - 2];
  let cagr = null;
  if (revs.length >= 4) {
    cagr = Math.pow(revs[revs.length - 1] / revs[0], 1 / (revs.length - 1)) - 1;
  }
  const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  return { revenue_growth_yoy: r2(yoy), revenue_cagr_3y: r2(cagr) };
}

function extract(ticker, qs) {
  if (!qs) return null;
  const price = qs.price || {};
  const sd = qs.summaryDetail || {};
  const ks = qs.defaultKeyStatistics || {};
  const fd = qs.financialData || {};
  const ap = qs.assetProfile || {};
  const px = raw(price.regularMarketPrice);
  const epsT = raw(ks.trailingEps);
  const epsF = raw(ks.forwardEps);
  const bv = raw(ks.bookValue);
  const { revenue_growth_yoy, revenue_cagr_3y } = growthRates(qs.incomeStatementHistory?.incomeStatementHistory);

  // Expected EPS growth from trailing -> forward estimates.
  let eps_growth_exp = null;
  if (typeof epsT === 'number' && typeof epsF === 'number' && epsT > 0) {
    eps_growth_exp = Math.round(((epsF - epsT) / epsT) * 1000) / 1000;
  }

  // Graham number: sqrt(22.5 * EPS * book value) — a conservative deep-value
  // floor, not a price target. Only meaningful when EPS and BV are positive.
  let graham = null;
  if (typeof epsT === 'number' && epsT > 0 && typeof bv === 'number' && bv > 0) {
    graham = Math.round(Math.sqrt(22.5 * epsT * bv) * 100) / 100;
  }

  return {
    name: price.longName || price.shortName || ticker,
    sector: ap.sector || null,
    subsector: ap.industry || null,
    market_cap: raw(price.marketCap),
    price: typeof px === 'number' ? Math.round(px * 100) / 100 : null,
    pe_trailing: r2(sd.trailingPE),
    pe_forward: r2(sd.forwardPE),
    peg: r2(ks.pegRatio),
    pb: r2(ks.priceToBook),
    ps: r2(sd.priceToSalesTrailing12Months),
    profit_margin: r2(ks.profitMargins ?? fd.profitMargins),
    roe: r2(fd.returnOnEquity),
    debt_equity: r2(fd.debtToEquity),
    beta: r2(ks.beta),
    div_yield: r2(sd.trailingAnnualDividendYield ?? sd.dividendYield),
    eps_trailing: r2(epsT),
    eps_forward: r2(epsF),
    book_value: r2(bv),
    revenue_growth_yoy,
    revenue_cagr_3y,
    eps_growth_expected: eps_growth_exp,
    graham_number: graham,
    // graham_upside_pct + peer fair value computed in second pass below
  };
}

/** Second pass: peer-relative fair value + Graham upside (needs full map). */
function enrichWithPeers(fundamentals) {
  // Sector median forward P/E per sector.
  const bySector = new Map();
  for (const [t, f] of Object.entries(fundamentals)) {
    if (!f.sector) continue;
    if (!bySector.has(f.sector)) bySector.set(f.sector, []);
    if (typeof f.pe_forward === 'number' && f.pe_forward > 0 && f.pe_forward < 200) {
      bySector.get(f.sector).push(f.pe_forward);
    }
  }
  const medFwdPE = new Map();
  for (const [sec, vals] of bySector) {
    if (!vals.length) continue;
    const s = [...vals].sort((a, b) => a - b);
    medFwdPE.set(sec, s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2);
  }
  for (const f of Object.values(fundamentals)) {
    // Peer-implied fair value: what it'd be worth at the sector's median multiple.
    const medPE = f.sector ? medFwdPE.get(f.sector) : null;
    if (medPE != null && typeof f.eps_forward === 'number' && f.eps_forward > 0) {
      f.peer_fair_value = Math.round(f.eps_forward * medPE * 100) / 100;
      f.sector_median_fwd_pe = Math.round(medPE * 100) / 100;
    } else {
      f.peer_fair_value = null;
      f.sector_median_fwd_pe = null;
    }
    if (typeof f.price === 'number' && f.price > 0) {
      f.peer_upside_pct = f.peer_fair_value != null
        ? Math.round(((f.peer_fair_value - f.price) / f.price) * 1000) / 10 : null;
      f.graham_upside_pct = f.graham_number != null
        ? Math.round(((f.graham_number - f.price) / f.price) * 1000) / 10 : null;
    } else {
      f.peer_upside_pct = null;
      f.graham_upside_pct = null;
    }
  }
}

async function main() {
  const { hot, warm } = collectTickers();
  const prev = readJson('fundamentals.json');
  const fundamentals = prev?.fundamentals || {};
  const nowMs = Date.now();

  // Decide what to (re)fetch: hot tickers stale >24h, warm tickers missing or
  // stale >14d. Hot first, then missing warm, then stale warm — capped.
  const isStale = (t, staleMs) => {
    const f = fundamentals[t];
    if (!f?.fetched_at) return true;
    return nowMs - new Date(f.fetched_at).getTime() > staleMs;
  };
  const queue = [
    ...hot.filter((t) => isStale(t, HOT_STALE_MS)),
    ...warm.filter((t) => !fundamentals[t]),
    ...warm.filter((t) => fundamentals[t] && isStale(t, WARM_STALE_MS)),
  ].slice(0, MAX_FETCH_PER_RUN);

  console.log(`[fundamentals] hot=${hot.length} warm=${warm.length} cached=${Object.keys(fundamentals).length} to_fetch=${queue.length}`);
  let ok = 0, fail = 0;
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    try {
      const qs = await yahooQuoteSummary(t, MODULES);
      const f = extract(t, qs);
      if (f) { f.fetched_at = new Date().toISOString(); fundamentals[t] = f; ok++; }
      else fail++;
    } catch (e) {
      fail++;
      console.warn(`[fundamentals] ${t}: ${e.message}`);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`[fundamentals] ${i + 1}/${queue.length} (ok=${ok} fail=${fail})`);
      await sleep(500);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  enrichWithPeers(fundamentals);
  writeFileSync(join(OUT_DIR, 'fundamentals.json'), JSON.stringify({
    as_of: new Date().toISOString(),
    source: 'Yahoo Finance quoteSummary (delayed)',
    count: Object.keys(fundamentals).length,
    fundamentals,
  }));
  console.log(`[fundamentals] total=${Object.keys(fundamentals).length} (fetched ${ok}, failed ${fail} this run)`);
}

main().catch((e) => { console.error(`[fundamentals] FATAL: ${e.message}`); process.exit(1); });
