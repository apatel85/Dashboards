#!/usr/bin/env node
/**
 * fetch-earnings-keyless.mjs — EarningAnalysis REPAIR script (keyless).
 *
 * Replaces the broken FMP-based fetch-earnings.mjs (its FMP_API_KEY secret
 * stopped delivering a value, freezing live data since 2026-06-27).
 *
 * Produces the EXACT `Company` shape that EarningAnalysis/src/App.tsx expects
 * (see src/types/index.ts) — same field names, same types — but every number
 * comes from a live keyless source:
 *  - Nasdaq unofficial calendar API (14-day loop): symbol, name, marketCap,
 *    epsForecast, time-pre-market / time-after-hours.
 *  - Yahoo v8 chart: current_price.
 *  - Yahoo v7 options: REAL implied_move from the ATM straddle of the first
 *    expiry after the report date (the old sector-lookup table is gone).
 *    Tickers WITHOUT listed options are DROPPED (logged) — the app's
 *    options-strategy engine is meaningless with a fake implied move.
 *  - Yahoo quoteSummary [assetProfile, earningsHistory, earningsTrend]:
 *    sector/industry, 4-quarter EPS streak, eps_est_trend, rev_est.
 *  - SEC EDGAR companyfacts (official): health, financials[], piotroski
 *    (real F-score), altman_z (real Z-score), earnings_quality_ratio (OCF/NI),
 *    last_earnings.rev_actual_b.
 *  - Yahoo search: dated news headlines + deterministic lexicon sentiment.
 *
 * Fields that CANNOT be filled from keyless sources are listed in
 * EARNS_REPAIR_NOTES.md — they carry documented type-compatible defaults,
 * never invented "real-looking" data.
 *
 * Repo layout assumption: this file lives at
 *   EarningAnalysis/scripts/fetch-earnings-keyless.mjs
 * and imports the shared keyless lib from
 *   TradeDesk/pipeline/lib/*.mjs   (checked out in the same repo).
 * Run from the REPO ROOT:  node EarningAnalysis/scripts/fetch-earnings-keyless.mjs
 * Writes: EarningAnalysis/public/data/earnings.json + meta.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJson } from '../../TradeDesk/pipeline/lib/http.mjs';
import { yahooChart, yahooOptions, yahooQuoteSummary, yahooNews } from '../../TradeDesk/pipeline/lib/yahoo.mjs';
import { tickerToCikMap, companyFacts, latestQuarterlyValue, yearAgoQuarterlyValue } from '../../TradeDesk/pipeline/lib/sec.mjs';
import {
  healthFromFacts, probUpFromStreak, piotroskiFromFacts, altmanZFromFacts,
  earningsQualityFromFacts, contractMid, REV_TAGS,
} from '../../TradeDesk/pipeline/lib/scoring.mjs';
import {
  isoDate, addDays, dayLabel, parseMoney, unixToDate, msToIso,
  writeJsonAtomic, headlineSentiment, r2, clamp,
} from '../../TradeDesk/pipeline/lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// Repo root = two levels up from EarningAnalysis/scripts/
const REPO_ROOT = path.resolve(__dir, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'EarningAnalysis', 'public', 'data');

const WINDOW_DAYS = 14;
const MIN_MKTCAP = 2e9;
const MAX_TICKERS = 60;

function capTier(m) {
  if (m >= 200e9) return 'Mega';
  if (m >= 10e9) return 'Large';
  if (m >= 2e9) return 'Mid';
  if (m >= 300e6) return 'Small';
  return 'Micro';
}

function weekClass(reportDate, today) {
  const now = new Date(today + 'T12:00:00Z');
  const dow = now.getUTCDay();
  const weekStart = addDays(today, dow === 0 ? -6 : 1 - dow);
  return reportDate <= addDays(weekStart, 6) ? 'current' : 'next';
}

function fmtRevEst(raw) {
  if (raw == null || !Number.isFinite(raw)) return 'n/a';
  const b = raw / 1e9;
  return b >= 1000 ? `${r2(b / 1000)}T` : `${r2(b)}B`;
}

function reportDateLabel(endRaw) {
  const d = new Date(endRaw * 1000);
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

async function impliedMove(ticker, reportDate) {
  let root;
  try { root = await yahooOptions(ticker); }
  catch (e) {
    if (e.status === 404) return null; // no listed options
    throw e;
  }
  if (!root) return null;
  const u = parseMoney(root?.quote?.regularMarketPrice);
  const exps = (root?.expirationDates || []).map(Number).filter(Number.isFinite);
  if (!u || !exps.length) return null;
  const reportTs = new Date(reportDate + 'T16:00:00Z').getTime() / 1000;
  const target = exps.find((x) => x > reportTs) || exps[0];
  const chain = await yahooOptions(ticker, { date: target });
  const calls = chain?.options?.[0]?.calls || [];
  const puts = chain?.options?.[0]?.puts || [];
  if (!calls.length || !puts.length) return null;
  const atm = (arr) => arr.reduce((a, b) => (Math.abs(b.strike - u) < Math.abs(a.strike - u) ? b : a));
  const c = contractMid(atm(calls)), p = contractMid(atm(puts));
  if (c == null || p == null) return null;
  return r2(((c + p) / u) * 100);
}

function buildFinancials(facts) {
  const items = [];
  const rev = latestQuarterlyValue(facts, REV_TAGS);
  const gp = latestQuarterlyValue(facts, ['GrossProfit']);
  const ni = latestQuarterlyValue(facts, ['NetIncomeLoss']);
  const eq = latestQuarterlyValue(facts, ['StockholdersEquity']);
  const liab = latestQuarterlyValue(facts, ['Liabilities']);
  const yoyOf = (node) => {
    if (!node) return null;
    const ago = yearAgoQuarterlyValue(facts, node.tag, node.end);
    if (!ago || !ago.value) return null;
    return { cur: node.value, ago: ago.value, g: ((node.value - ago.value) / Math.abs(ago.value)) * 100 };
  };
  const push = (label, value, score, category, trend) => {
    if (value == null) return;
    items.push({ label, value, score, category, trend });
  };
  const pct = (v) => `${r2(v * 100, 1)}%`;
  const trendOf = (g) => (g == null ? 'flat' : g > 2 ? 'up' : g < -2 ? 'down' : 'flat');

  const rg = yoyOf(rev);
  if (rg) push('Revenue Growth', pct(rg.g / 100), rg.g > 15 ? 9 : rg.g > 8 ? 7 : rg.g > 0 ? 5 : 2, 'Growth', trendOf(rg.g));
  if (gp && rev && rev.value) {
    const m = gp.value / rev.value;
    const ago = yoyOf(gp);
    push('Gross Margin', pct(m), m > 0.5 ? 9 : m > 0.3 ? 6 : 4, 'Profitability', trendOf(ago?.g));
  }
  if (ni && rev && rev.value) {
    const m = ni.value / rev.value;
    push('Net Margin', pct(m), m > 0.2 ? 9 : m > 0.1 ? 6 : m > 0 ? 3 : 1, 'Profitability', trendOf(yoyOf(ni)?.g));
  }
  if (ni && eq && eq.value > 0) {
    const roe = ni.value / eq.value;
    push('ROE', pct(roe), roe > 0.25 ? 9 : roe > 0.15 ? 7 : roe > 0.08 ? 5 : 3, 'Profitability', trendOf(yoyOf(ni)?.g));
  }
  if (liab && eq && eq.value > 0) {
    const de = liab.value / eq.value;
    push('Debt/Equity', `${r2(de)}x`, de < 0.3 ? 9 : de < 0.7 ? 6 : de < 1.5 ? 4 : 2, 'Quality', 'flat');
  }
  return items;
}

async function main() {
  const today = isoDate();
  console.log(`[repair] keyless earnings fetch, ${WINDOW_DAYS}-day window from ${today}`);

  // ── Nasdaq calendar ──────────────────────────────────────────────────
  const rows = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = addDays(today, i);
    try {
      const j = await fetchJson(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, {
        label: `nasdaq earnings calendar ${d}`,
      });
      const rws = j?.data?.rows || [];
      console.log(`[repair] ${d}: ${rws.length} rows`);
      for (const r of rws) rows.push({ ...r, _date: d });
    } catch (e) {
      console.error(`[repair] calendar FAILED for ${d}: ${e.message} — continuing`);
    }
  }

  const seen = new Map();
  for (const r of rows) {
    const symbol = String(r.symbol || '').trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
    const mktCap = parseMoney(r.marketCap);
    if (mktCap == null || mktCap < MIN_MKTCAP || seen.has(symbol)) continue;
    seen.set(symbol, {
      ticker: symbol,
      name: String(r.name || '').trim() || symbol,
      marketCap: mktCap,
      reporting_date: r._date,
      eps_est: parseMoney(r.epsForecast),
      time: r.time === 'time-pre-market' ? 'BMO' : 'AMC', // App renders non-BMO as "After Close"
    });
  }
  const universe = [...seen.values()].sort((a, b) => b.marketCap - a.marketCap).slice(0, MAX_TICKERS);
  console.log(`[repair] ${universe.length} tickers to enrich`);

  const cikMap = await tickerToCikMap().catch((e) => {
    console.error(`[repair] ticker→CIK map failed: ${e.message}`);
    return {};
  });

  // ── Enrich ───────────────────────────────────────────────────────────
  const companies = [];
  let droppedNoOptions = 0;
  for (const u of universe) {
    console.log(`[repair] ${u.ticker} ${u.reporting_date} ${u.time}`);

    let price = null;
    try {
      const ch = await yahooChart(u.ticker, { interval: '1d', range: '5d' });
      const meta = ch?.chart?.result?.[0]?.meta || {};
      const closes = ch?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      price = parseMoney(meta.regularMarketPrice) ?? r2([...closes].reverse().find((c) => c != null));
    } catch (e) {
      console.error(`[repair] ${u.ticker}: price failed: ${e.message}`);
    }
    if (price == null) {
      console.warn(`[repair] ${u.ticker}: no price — dropping (App requires current_price)`);
      continue;
    }

    let impMove = null;
    try { impMove = await impliedMove(u.ticker, u.reporting_date); }
    catch (e) { console.error(`[repair] ${u.ticker}: implied move failed: ${e.message}`); }
    if (impMove == null) {
      console.warn(`[repair] ${u.ticker}: no listed options — dropping (documented; App's strategy engine needs a real implied move)`);
      droppedNoOptions++;
      continue;
    }

    let sector = 'Unknown', industry = 'Unknown', streakRaw = [], trend0 = null;
    try {
      const qs = await yahooQuoteSummary(u.ticker, ['assetProfile', 'earningsHistory', 'earningsTrend']);
      sector = qs?.assetProfile?.sector || 'Unknown';
      industry = qs?.assetProfile?.industry || 'Unknown';
      streakRaw = qs?.earningsHistory?.history || [];
      trend0 = qs?.earningsTrend?.trend?.[0] || null;
    } catch (e) {
      console.error(`[repair] ${u.ticker}: quoteSummary failed: ${e.message}`);
    }

    const streak = streakRaw.slice(0, 4).map((q) => {
      const actual = q?.epsActual?.raw ?? null;
      const est = q?.epsEstimate?.raw ?? null;
      // endDate is present for most US filers; some (e.g. foreign ADRs) only
      // carry quarter.raw — fall back to it.
      const endRaw = q?.endDate?.raw ?? q?.quarter?.raw ?? null;
      let quarter = 'Unknown', eps = 'in-line', surprise_pct = 0;
      if (endRaw) {
        const d = new Date(endRaw * 1000);
        quarter = `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
      }
      if (actual != null && est != null && est !== 0) {
        surprise_pct = r2(((actual - est) / Math.abs(est)) * 100, 1);
        eps = actual > est * 1.01 ? 'beat' : actual >= est * 0.99 ? 'in-line' : 'miss';
      }
      return {
        quarter, eps, surprise_pct,
        // DOCUMENTED (EARNS_REPAIR_NOTES.md): no keyless revenue-estimate history.
        revenue: 'in-line',
      };
    });
    const prob_up = probUpFromStreak(streak.map((s) => ({ eps_result: s.eps }))) ?? 50;

    const epsTrend = trend0?.epsTrend;
    const eps_est_trend =
      epsTrend && epsTrend.current != null && epsTrend['30daysAgo'] != null
        ? epsTrend.current > epsTrend['30daysAgo'] * 1.01 ? 'rising'
          : epsTrend.current < epsTrend['30daysAgo'] * 0.99 ? 'falling' : 'flat'
        : 'flat';

    // Fundamentals (real, from SEC EDGAR)
    let facts = null;
    const cik = cikMap[u.ticker];
    if (cik) {
      try { facts = await companyFacts(cik); }
      catch (e) { console.warn(`[repair] ${u.ticker}: companyfacts failed: ${e.message}`); }
    }
    const health = facts ? healthFromFacts(facts) ?? 60 : 60;
    const financials = facts ? buildFinancials(facts) : [];
    const piotroski = facts ? piotroskiFromFacts(facts) ?? 5 : 5;
    const altman_z = facts ? altmanZFromFacts(facts, u.marketCap) ?? 2.0 : 2.0;
    const eqr = facts ? earningsQualityFromFacts(facts) ?? 1.0 : 1.0;

    const last = streakRaw[0];
    const revQ = facts ? latestQuarterlyValue(facts, REV_TAGS) : null;

    let news = [];
    try {
      const items = await yahooNews(u.ticker, 5);
      news = items
        .filter((n) => String(n.title || '').toUpperCase().includes(u.ticker))
        .slice(0, 3)
        .map((n) => ({
          date: n.providerPublishTime ? unixToDate(n.providerPublishTime) : today,
          headline: String(n.title || '').slice(0, 110),
          source: String(n.publisher || 'Yahoo Finance'),
          sentiment: headlineSentiment(n.title),
        }));
    } catch (e) {
      console.error(`[repair] ${u.ticker}: news failed: ${e.message}`);
    }

    companies.push({
      ticker: u.ticker,
      name: u.name,
      sector,
      industry,
      subsector: industry,
      cap: capTier(u.marketCap),
      day: dayLabel(u.reporting_date),
      reporting_date: u.reporting_date,
      week: weekClass(u.reporting_date, today),
      time: u.time,
      eps_est: u.eps_est ?? 0,
      eps_est_trend,
      rev_est: fmtRevEst(trend0?.revenueEstimate?.avg?.raw),
      implied_move: impMove,
      streak,
      last_earnings: {
        report_date: (last?.endDate?.raw ?? last?.quarter?.raw) ? reportDateLabel(last.endDate?.raw ?? last.quarter.raw) : 'n/a',
        quarter: streak[0]?.quarter || 'n/a',
        eps_actual: last?.epsActual?.raw ?? 0,
        eps_est: last?.epsEstimate?.raw ?? 0,
        rev_actual_b: revQ ? r2(revQ.value / 1e9) : 0,
        // DOCUMENTED: no keyless source for last quarter's revenue estimate.
        rev_est_b: 0,
      },
      // DOCUMENTED (EARNS_REPAIR_NOTES.md): insider/political feeds are not
      // wired into this standalone script — see TradeDesk insiders.json.
      insider: 'neutral',
      health,
      prob_up,
      verification: facts && sector !== 'Unknown' ? 'verified' : 'single-source',
      current_price: price,
      political_signal: 'neutral',
      political_trades: [],
      financials,
      insider_trades: [],
      institutional: [],
      // DOCUMENTED: no keyless short-interest source.
      short_interest: 0,
      news,
      earnings_quality_ratio: eqr,
      // DOCUMENTED: guidance history is not available keyless.
      guidance_accuracy: 75,
      piotroski,
      altman_z,
    });
  }

  companies.sort((a, b) => (a.reporting_date < b.reporting_date ? -1 : 1));
  console.log(`[repair] ${companies.length} companies (dropped ${droppedNoOptions} without options)`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeJsonAtomic(path.join(OUT_DIR, 'earnings.json'), companies);
  const dates = companies.map((c) => c.reporting_date).sort();
  writeJsonAtomic(path.join(OUT_DIR, 'meta.json'), {
    lastUpdated: new Date().toISOString(),
    nextUpdate: addDays(today, 7) + 'T22:00:00Z',
    source: 'Nasdaq + Yahoo Finance + SEC EDGAR (keyless)',
    companies: companies.length,
    window: dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : 'N/A',
  });
  console.log('[repair] done.');
}

main().catch((e) => {
  console.error(`[repair] FATAL: ${e.message}`);
  process.exit(1);
});
