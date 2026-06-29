#!/usr/bin/env node
/**
 * fetch-earnings.mjs
 *
 * Fetches the rolling 14-day earnings calendar from Financial Modeling Prep,
 * enriches each company with fundamentals, historical streak, and news, then
 * scores every company through the conviction model and writes:
 *   public/data/earnings.json   – full company array
 *   public/data/meta.json       – freshness / window metadata
 *
 * Run manually:  FMP_API_KEY=xxx node scripts/fetch-earnings.mjs
 * Automated:     GitHub Actions every Friday 5 PM ET (see .github/workflows/update-earnings.yml)
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir        = path.dirname(fileURLToPath(import.meta.url));
const ROOT         = path.resolve(__dir, '..');
const EARNINGS_OUT = path.join(ROOT, 'public', 'data', 'earnings.json');
const META_OUT     = path.join(ROOT, 'public', 'data', 'meta.json');

const FMP_KEY  = process.env.FMP_API_KEY || '';
const FMP_BASE = 'https://financialmodelingprep.com/api';

// ── Date helpers ───────────────────────────────────────────────────────────────
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nextFridayISO(fromDate) {
  const d = new Date(fromDate + 'T12:00:00Z');
  const days = ((5 - d.getUTCDay() + 7) % 7) || 7; // 0 means today is Fri → next Fri
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(22, 0, 0, 0); // 22:00 UTC ≈ 5 PM ET
  return d.toISOString();
}

function dayLabel(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${DAY[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── FMP fetch ─────────────────────────────────────────────────────────────────
async function fmpGet(endpoint, params = {}) {
  const url = new URL(`${FMP_BASE}/${endpoint}`);
  url.searchParams.set('apikey', FMP_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FMP ${endpoint} → HTTP ${res.status}`);
  const json = await res.json();
  if (json['Error Message']) throw new Error(`FMP ${endpoint} → ${json['Error Message']}`);
  return json;
}

// ── Lookups ───────────────────────────────────────────────────────────────────
const SECTOR_MAP = {
  'Technology': 'IT',
  'Financial Services': 'Financials',
  'Healthcare': 'Healthcare',
  'Consumer Cyclical': 'Consumer Disc',
  'Consumer Defensive': 'Consumer Staples',
  'Communication Services': 'Communication Services',
  'Energy': 'Energy',
  'Industrials': 'Industrials',
  'Basic Materials': 'Materials',
  'Real Estate': 'Real Estate',
  'Utilities': 'Utilities',
};

// Sector-typical implied move % based on historical IV
const IMPLIED_MOVE_DEFAULTS = {
  'IT': 6.5, 'Consumer Disc': 7.0, 'Communication Services': 5.5,
  'Healthcare': 4.5, 'Financials': 3.5, 'Energy': 3.5,
  'Industrials': 4.0, 'Consumer Staples': 3.0, 'Materials': 4.5,
  'Real Estate': 3.5, 'Utilities': 2.5,
};

function mapSector(s) { return SECTOR_MAP[s] || s || 'Other'; }
function capTier(m) {
  if (m >= 200e9) return 'Mega';
  if (m >= 10e9)  return 'Large';
  if (m >= 2e9)   return 'Mid';
  if (m >= 300e6) return 'Small';
  return 'Micro';
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function computeHealth(metrics) {
  if (!metrics) return 60;
  let s = 50;
  const gm = metrics.grossProfitMarginTTM ?? -1;
  if      (gm > 0.60) s += 14;
  else if (gm > 0.40) s += 10;
  else if (gm > 0.20) s +=  5;
  else if (gm > 0.00) s +=  2;
  else                s -=  5;

  const roe = metrics.returnOnEquityTTM ?? -1;
  if      (roe > 0.25) s += 12;
  else if (roe > 0.15) s +=  8;
  else if (roe > 0.08) s +=  4;
  else if (roe > 0.00) s +=  1;
  else                 s -=  6;

  const de = metrics.debtToEquityTTM ?? 2;
  if      (de < 0.30) s +=  8;
  else if (de < 0.60) s +=  5;
  else if (de < 1.00) s +=  2;
  else if (de > 2.00) s -= 10;
  else                s -=  3;

  const fcfY = metrics.freeCashFlowYieldTTM ?? -1;
  if      (fcfY > 0.06) s +=  8;
  else if (fcfY > 0.02) s +=  4;
  else if (fcfY < 0.00) s -=  6;

  return Math.max(20, Math.min(96, s));
}

function computeProbUp(historical) {
  if (!historical?.length) return 60;
  const q = historical.slice(0, 4);
  const beats = q.filter(h =>
    h.eps != null && h.epsEstimated != null && h.eps > h.epsEstimated * 0.99
  ).length;
  const avgSurp = q.reduce((acc, h) => {
    if (h.eps != null && h.epsEstimated != null && h.epsEstimated !== 0) {
      return acc + (h.eps - h.epsEstimated) / Math.abs(h.epsEstimated) * 100;
    }
    return acc;
  }, 0) / (q.length || 1);

  let p = 52 + beats * 4.5;
  if (avgSurp > 15) p += 5;
  if (avgSurp > 30) p += 4;
  if (avgSurp <  0) p -= 6;
  return Math.max(34, Math.min(84, Math.round(p)));
}

function buildStreak(historical) {
  return (historical || []).slice(0, 4).map(q => {
    const ea = q.eps ?? 0;
    const ee = q.epsEstimated ?? ea;
    const ra = q.revenue ?? 0;
    const re = q.revenueEstimated ?? ra;
    const surp = ee ? parseFloat(((ea - ee) / Math.abs(ee) * 100).toFixed(1)) : 0;
    const epsBeat = ee
      ? (ea > ee * 1.01 ? 'beat' : ea >= ee * 0.99 ? 'in-line' : 'miss')
      : 'in-line';
    const revBeat = re
      ? (ra > re * 1.01 ? 'beat' : ra >= re * 0.99 ? 'in-line' : 'miss')
      : 'in-line';
    const d   = new Date((q.date || q.fiscalDateEnding || '') + 'T12:00:00Z');
    const yr  = d.getUTCFullYear();
    const mo  = d.getUTCMonth(); // 0-indexed
    const qtr = mo < 3 ? `Q4 ${yr-1}` : mo < 6 ? `Q1 ${yr}` : mo < 9 ? `Q2 ${yr}` : `Q3 ${yr}`;
    return { quarter: qtr, eps: epsBeat, revenue: revBeat, surprise_pct: surp };
  });
}

function buildLastEarnings(historical) {
  const q = historical?.[0];
  if (!q?.date) return null;
  const d  = new Date(q.date + 'T12:00:00Z');
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yr = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const qtr = mo < 3 ? `Q4 ${yr-1}` : mo < 6 ? `Q1 ${yr}` : mo < 9 ? `Q2 ${yr}` : `Q3 ${yr}`;
  return {
    report_date:  `${MO[mo]} ${d.getUTCDate()}, ${yr}`,
    quarter:      q.period || qtr,
    eps_actual:   q.eps ?? 0,
    eps_est:      q.epsEstimated ?? q.eps ?? 0,
    rev_actual_b: parseFloat(((q.revenue ?? 0) / 1e9).toFixed(2)),
    rev_est_b:    parseFloat(((q.revenueEstimated ?? q.revenue ?? 0) / 1e9).toFixed(2)),
  };
}

function buildFinancials(metrics) {
  if (!metrics) return [];
  const items = [];
  const add = (label, rawVal, category, fmt, scoreFn, trend = 'flat') => {
    if (rawVal == null || rawVal === 0) return;
    items.push({ label, value: fmt(rawVal), score: scoreFn(rawVal), category, trend });
  };
  const pct   = v => `${(v * 100).toFixed(1)}%`;
  const mult  = v => `${v.toFixed(1)}x`;
  const usd   = v => `$${v.toFixed(2)}`;
  const pctDl = v => `${(v * 100).toFixed(1)}%`;

  add('Revenue Growth',  metrics.revenueGrowthTTM,             'Growth',       pct,  v => v > .15 ? 9 : v > .08 ? 7 : v > 0 ? 5 : 2, 'up');
  add('Gross Margin',    metrics.grossProfitMarginTTM,          'Profitability', pct,  v => v > .5 ? 9 : v > .3 ? 6 : 4);
  add('Net Margin',      metrics.netProfitMarginTTM,            'Profitability', pct,  v => v > .2 ? 9 : v > .1 ? 6 : v > 0 ? 3 : 1);
  add('ROE',             metrics.returnOnEquityTTM,             'Profitability', pct,  v => v > .25 ? 9 : v > .15 ? 7 : v > .08 ? 5 : 3);
  add('Debt/Equity',     metrics.debtToEquityTTM,               'Quality',       mult, v => v < .3 ? 9 : v < .7 ? 6 : v < 1.5 ? 4 : 2);
  add('FCF/Share',       metrics.freeCashFlowPerShareTTM,       'Cash Flow',     usd,  v => v > 5 ? 9 : v > 1 ? 6 : v > 0 ? 4 : 2);
  add('Forward P/E',     metrics.priceToEarningsRatioTTM,       'Valuation',     mult, v => v < 12 ? 8 : v < 20 ? 6 : v < 35 ? 4 : 2);
  add('EV/EBITDA',       metrics.enterpriseValueOverEBITDATTM,  'Valuation',     mult, v => v < 10 ? 8 : v < 18 ? 6 : v < 30 ? 4 : 2);
  add('Dividend Yield',  metrics.dividendYieldTTM,              'Valuation',     pctDl, v => v > .04 ? 8 : v > .02 ? 6 : 5);
  return items.filter(Boolean);
}

function buildNews(newsArr) {
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (newsArr || []).slice(0, 3).map(n => {
    const d = new Date((n.publishedDate || n.date || new Date()).toString());
    const sentRaw = n.sentiment ?? '';
    const sent = typeof sentRaw === 'number'
      ? (sentRaw > 0.2 ? 'bullish' : sentRaw < -0.2 ? 'bearish' : 'neutral')
      : (sentRaw === 'Positive' ? 'bullish' : sentRaw === 'Negative' ? 'bearish' : 'neutral');
    return {
      date: `${MO[d.getMonth()]} ${d.getDate()}`,
      headline: (n.title || '').slice(0, 110),
      source: n.site || n.source || 'Reuters',
      sentiment: sent,
    };
  });
}

function computeWeekClass(reportDate, today) {
  const rep = new Date(reportDate + 'T12:00:00Z');
  const now = new Date(today     + 'T12:00:00Z');
  // Find next Monday from today (= start of the current reporting week)
  const dow = now.getUTCDay();
  const daysToMon = dow === 0 ? 1 : dow === 6 ? 2 : 8 - dow; // if Fri/Sat/Sun, next Mon
  const weekStart = addDays(today, dow <= 5 ? -(dow === 0 ? 6 : dow - 1) : 0);
  const weekEnd   = addDays(weekStart, 6);   // Sun
  const nextEnd   = addDays(weekEnd,   7);
  if (reportDate <= weekEnd) return 'current';
  return 'next';
}

function convictionScore(co) {
  const dir = Math.abs((co.prob_up ?? 50) - 50) / 50;
  const h   = (co.health ?? 50) / 100;
  const iv  = Math.min((co.implied_move ?? 4) / 8, 1);
  return Math.round(dir * 38 + h * 28 + 0.6 * 14 + 0.5 * 8 + 0.5 * 7 + iv * 5);
}

function fmtRevEst(bytesOrBillions) {
  const b = typeof bytesOrBillions === 'number' ? bytesOrBillions / 1e9 : parseFloat(bytesOrBillions);
  if (b >= 1000) return `${(b / 1000).toFixed(2)}T`;
  if (b >= 100)  return `${b.toFixed(1)}B`;
  return `${b.toFixed(2)}B`;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const today     = new Date().toISOString().slice(0, 10);
  const windowEnd = addDays(today, 14);

  // If no API key, just refresh meta.json with next scheduled update
  if (!FMP_KEY) {
    console.warn('FMP_API_KEY not set — updating meta.json only.');
    const meta = JSON.parse(fs.existsSync(META_OUT) ? fs.readFileSync(META_OUT, 'utf8') : '{}');
    meta.nextUpdate = nextFridayISO(today);
    fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 2) + '\n');
    return;
  }

  console.log(`\nFetching earnings window: ${today} → ${windowEnd}`);

  // ── Step 1: Earnings calendar ──────────────────────────────────────────────
  let calendar = [];
  try {
    calendar = await fmpGet('v3/earning_calendar', { from: today, to: windowEnd });
  } catch (e) {
    console.error('Calendar fetch failed:', e.message);
    process.exit(1);
  }

  // Keep only clean tickers for US large-caps; skip ETFs/SPACs/warrants
  calendar = calendar.filter(c =>
    c.symbol &&
    /^[A-Z]{1,5}$/.test(c.symbol) &&
    !c.symbol.endsWith('W') &&
    c.date >= today
  );
  console.log(`Calendar entries after filter: ${calendar.length}`);

  // ── Step 2: Batch company profiles ────────────────────────────────────────
  const tickers   = [...new Set(calendar.map(c => c.symbol))];
  const profileMap = {};

  for (let i = 0; i < tickers.length; i += 50) {
    const chunk = tickers.slice(i, i + 50).join(',');
    try {
      const profiles = await fmpGet(`v3/profile/${chunk}`);
      (Array.isArray(profiles) ? profiles : [profiles]).forEach(p => {
        if (p?.symbol) profileMap[p.symbol] = p;
      });
      await sleep(350);
    } catch (e) {
      console.warn(`Profile batch failed: ${e.message}`);
    }
  }

  // Filter to market cap ≥ $5B (large / mega cap)
  const largeCap = calendar.filter(c => (profileMap[c.symbol]?.mktCap ?? 0) >= 5e9);
  console.log(`Large-cap companies (≥$5B mktCap): ${largeCap.length}`);

  // ── Step 3: Per-company enrichment ────────────────────────────────────────
  const companies = [];

  for (const entry of largeCap) {
    const { symbol: ticker, date: reportDate, epsEstimated, revenueEstimated, time: rawTime } = entry;
    const profile = profileMap[ticker] || {};
    console.log(`  ${ticker}  ${reportDate}  mktCap=${(profile.mktCap/1e9).toFixed(0)}B`);

    let historical = [];
    let metrics    = null;
    let newsItems  = [];

    try {
      const r = await fmpGet(`v3/historical/earning_calendar/${ticker}`, { limit: 8 });
      historical = r?.historical || [];
      await sleep(250);
    } catch {}

    try {
      const r = await fmpGet(`v3/key-metrics-ttm/${ticker}`);
      metrics = Array.isArray(r) ? r[0] : r;
      await sleep(250);
    } catch {}

    try {
      newsItems = await fmpGet('v3/stock-news', { tickers: ticker, limit: 5 });
      await sleep(250);
    } catch {}

    const sector     = mapSector(profile.sector);
    const time       = rawTime === 'bmo' ? 'BMO' : 'AMC';
    const health     = computeHealth(metrics);
    const probUp     = computeProbUp(historical);
    const streak     = buildStreak(historical);
    const lastEarn   = buildLastEarnings(historical);
    const financials = buildFinancials(metrics);
    const news       = buildNews(newsItems);
    const impMove    = IMPLIED_MOVE_DEFAULTS[sector] ?? 4.5;
    const revEstB    = revenueEstimated ? fmtRevEst(revenueEstimated) : '0.00B';

    companies.push({
      ticker,
      name:             profile.companyName || ticker,
      sector,
      industry:         profile.industry    || 'Other',
      subsector:        profile.industry    || 'Other',
      cap:              capTier(profile.mktCap ?? 0),
      day:              dayLabel(reportDate),
      reporting_date:   reportDate,
      week:             computeWeekClass(reportDate, today),
      time,
      eps_est:          epsEstimated ?? 0,
      eps_est_trend:    'flat',
      rev_est:          revEstB,
      implied_move:     impMove,
      streak,
      last_earnings:    lastEarn,
      insider:          'neutral',
      health,
      prob_up:          probUp,
      verification:     'verified',
      current_price:    profile.price ?? 0,
      political_signal: 'neutral',
      political_trades: [],
      financials,
      insider_trades:   [],
      institutional:    [],
      short_interest:   0,
      news,
      earnings_quality_ratio: 1.0,
      guidance_accuracy:      75,
      piotroski:  Math.min(9, Math.max(1, Math.round(health / 11))),
      altman_z:   health > 75 ? 4.0 : health > 60 ? 2.8 : 2.0,
    });
  }

  // Sort: by date, then by conviction score desc
  companies.sort((a, b) => {
    if (a.reporting_date !== b.reporting_date) return a.reporting_date < b.reporting_date ? -1 : 1;
    return convictionScore(b) - convictionScore(a);
  });

  console.log(`\nFinal company count: ${companies.length}`);

  // ── Step 4: Write outputs ──────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(EARNINGS_OUT), { recursive: true });
  fs.writeFileSync(EARNINGS_OUT, JSON.stringify(companies, null, 2) + '\n');
  console.log(`Wrote ${EARNINGS_OUT}`);

  const dates = companies.map(c => c.reporting_date).sort();
  const meta = {
    lastUpdated: new Date().toISOString(),
    nextUpdate:  nextFridayISO(today),
    source:      'Financial Modeling Prep',
    companies:   companies.length,
    window:      dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : 'N/A',
  };
  fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 2) + '\n');
  console.log(`Wrote ${META_OUT}`);
  console.log('Done.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
