#!/usr/bin/env node
/**
 * fetch-earnings.mjs — Nasdaq earnings calendar + Yahoo/SEC enrichment
 * → data/earnings.json (TradeDesk EarningsEntry[] contract).
 *
 * Keyless sources only (all verified live 2026-10-14):
 *  - Nasdaq unofficial calendar API: 14 single-date requests (loop; the API
 *    ignores range params). Fields: symbol, name, marketCap ("$…"), 
 *    epsForecast ("$4.45"), time (time-pre-market / time-after-hours).
 *    NOTE: no revenue-forecast field exists → rev_est_b is null (honest).
 *  - PAST 60 days (same Nasdaq calendar, looped backwards): rows carry
 *    the ACTUAL reported EPS in `eps` and the surprise % in `surprise`
 *    (verified: (eps - epsForecast) / epsForecast == surprise). 60 days,
 *    not 30: a 30-day window can never show a 30-trading-day move (only
 *    ~22 trading days elapse in 30 calendar days), so the window is 60
 *    days and the 30d figure populates for reports older than ~42 days.
 *    Past entries get status 'reported' plus post-earnings performance vs
 *    the close on the report date: perf_1d/7d/30d = closes 1/7/30 trading
 *    days after the report; perf_to_date = latest close. Null where the
 *    window hasn't elapsed yet. Past entries are lean (no options chain,
 *    no SEC health, no news — the point is the price reaction, and the
 *    full enrichment would triple the runtime); capped at 100 by market
 *    cap. Sector comes from the previous run's fundamentals.json sidecar
 *    when available, else 'Unknown'.
 *  - Yahoo v8 chart: current price + price timestamp + 52w high/low.
 *  - Yahoo v7 options: REAL implied_move_pct from the ATM straddle of the
 *    first expiration AFTER the earnings date (never a sector table).
 *    iv_rank: null — true IV rank needs historical IV, which no free keyless
 *    source provides. Documented; not faked.
 *  - Yahoo quoteSummary [assetProfile, earningsHistory]: sector/industry +
 *    last-4-quarter EPS streak (beat/in-line/miss vs estimate, real).
 *    revenue_result in the streak: null — no keyless source carries
 *    historical revenue *estimates* (flagged contract deviation, see README).
 *  - SEC EDGAR companyfacts (official): health_score from real fundamentals.
 *  - Yahoo search: dated news headlines + deterministic lexicon sentiment.
 *  - insider_signal / political_signal: computed from data/insiders.json and
 *    data/congress.json when those files exist and are fresh; else 'neutral'
 *    (="no signal detected", the contract's Signal type has no null).
 *
 * Scoring formulas (documented, deterministic, real inputs only):
 *  - health_score (5–98): 50 + clamp(revYoY% × 0.75, ±15)
 *      + clamp(netMargin% × 0.6, ±15) + leverage term
 *      (D/E<0.5:+10, <1:+5, <2:0, <3:−8, else:−15). Null if no fundamentals.
 *  - prob_up_pct (25–90): 50 + 7×beats + 2×in-lines − 8×misses (last 4 Qs).
 *  - conviction: round(0.5×prob_up + 0.5×health); null if either is null.
 *
 * Filters: US common-stock symbols, marketCap ≥ $2B, top 60 by market cap.
 * Every quote carries price_ts; data older than 2 trading days is dropped.
 *
 * Usage: OUT_DIR=/path/to/public/data [SEC_CONTACT_EMAIL=you@x.com] node fetch-earnings.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJson } from './lib/http.mjs';
import { yahooChart, yahooOptions, yahooQuoteSummary, yahooNews } from './lib/yahoo.mjs';
import { tickerToCikMap } from './lib/sec.mjs';
import {
  healthScore, buildStreak, probUpFromStreak, contractMid, REV_TAGS,
} from './lib/scoring.mjs';
import {
  isoDate, addDays, parseMoney, unixToDate, msToIso,
  writeJsonAtomic, headlineSentiment, r2,
} from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const WINDOW_DAYS = 14;
const PAST_DAYS = 60;
const MAX_PAST = 100;
const MIN_MKTCAP = 2e9;
const MAX_TICKERS = 60;
// Quotes older than this many calendar days are dropped, never scored.
// 4 days covers a normal weekend (Fri close → Mon morning = ~2.7d).
const STALE_DAYS = 4;

function capTier(m) {
  if (m >= 200e9) return 'Mega';
  if (m >= 10e9) return 'Large';
  if (m >= 2e9) return 'Mid';
  if (m >= 300e6) return 'Small';
  return 'Micro';
}

function midOf(c) {
  return contractMid(c);
}

/** Real implied move % from the ATM straddle of the first expiry after reportDate. */
async function impliedMovePct(ticker, reportDate) {
  let root;
  try {
    root = await yahooOptions(ticker);
  } catch (e) {
    if (e.status === 404) { console.warn(`[earnings] ${ticker}: no listed options (404) — implied_move null`); return null; }
    throw e;
  }
  if (!root) return null;
  const underlying = parseMoney(root?.quote?.regularMarketPrice);
  const exps = (root?.expirationDates || []).map(Number).filter(Number.isFinite);
  if (!underlying || !exps.length) return null;
  const reportTs = new Date(reportDate + 'T16:00:00Z').getTime() / 1000;
  const target = exps.find((x) => x > reportTs) || exps[0];
  let chain;
  try {
    chain = await yahooOptions(ticker, { date: target });
  } catch (e) {
    console.warn(`[earnings] ${ticker}: chain fetch failed for exp ${unixToDate(target)}: ${e.message}`);
    return null;
  }
  const calls = chain?.options?.[0]?.calls || [];
  const puts = chain?.options?.[0]?.puts || [];
  if (!calls.length || !puts.length) return null;
  const atmCall = calls.reduce((a, b) => (Math.abs(b.strike - underlying) < Math.abs(a.strike - underlying) ? b : a));
  const atmPut = puts.reduce((a, b) => (Math.abs(b.strike - underlying) < Math.abs(a.strike - underlying) ? b : a));
  const cMid = midOf(atmCall), pMid = midOf(atmPut);
  if (cMid == null || pMid == null) return null;
  return r2(((cMid + pMid) / underlying) * 100);
}

/* buildStreak / probUpFromStreak / healthScore live in lib/scoring.mjs
 * (shared with the EarningAnalysis repair script). */

/** Read a fresh JSON sidecar (insiders.json / congress.json) or null. */
function readFreshSidecar(name, maxAgeDays) {
  const p = path.join(OUT_DIR, name);
  try {
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > maxAgeDays * 86400000) {
      console.warn(`[earnings] sidecar ${name} is stale (> ${maxAgeDays}d) — signals default to neutral`);
      return null;
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const today = isoDate();
  console.log(`[earnings] rolling ${WINDOW_DAYS}-day window from ${today}`);

  // ── Step 1: Nasdaq calendar loop ──────────────────────────────────────────
  const rows = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = addDays(today, i);
    try {
      const j = await fetchJson(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, {
        label: `nasdaq earnings calendar ${d}`,
      });
      const rws = j?.data?.rows || [];
      console.log(`[earnings] ${d}: ${rws.length} rows`);
      for (const r of rws) rows.push({ ...r, _date: d });
    } catch (e) {
      console.error(`[earnings] calendar fetch FAILED for ${d}: ${e.message} — continuing with other dates`);
    }
  }
  console.log(`[earnings] ${rows.length} raw calendar rows`);

  // ── Step 2: filter + dedupe ──────────────────────────────────────────────
  const seen = new Map();
  for (const r of rows) {
    const symbol = String(r.symbol || '').trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
    const mktCap = parseMoney(r.marketCap);
    if (mktCap == null || mktCap < MIN_MKTCAP) continue;
    if (seen.has(symbol)) continue;
    seen.set(symbol, {
      ticker: symbol,
      name: String(r.name || '').trim() || symbol,
      marketCap: mktCap,
      reporting_date: r._date,
      eps_est: parseMoney(r.epsForecast),
      report_time: r.time === 'time-pre-market' ? 'BMO' : r.time === 'time-after-hours' ? 'AMC' : 'UNKNOWN',
    });
  }
  const universe = [...seen.values()].sort((a, b) => b.marketCap - a.marketCap).slice(0, MAX_TICKERS);
  console.log(`[earnings] ${universe.length} tickers after filter (≥$${MIN_MKTCAP / 1e9}B mktcap, top ${MAX_TICKERS})`);

  const cikMap = await tickerToCikMap().catch((e) => {
    console.error(`[earnings] ticker→CIK map failed: ${e.message} — health scores will be null`);
    return {};
  });
  const insiders = readFreshSidecar('insiders.json', 3);
  const congress = readFreshSidecar('congress.json', 2);

  // ── Step 3: enrich ───────────────────────────────────────────────────────
  const entries = [];
  let staleDropped = 0;
  for (const u of universe) {
    console.log(`[earnings] enriching ${u.ticker} (${u.reporting_date} ${u.report_time})`);

    // Price
    let price = null, priceTs = null;
    try {
      const ch = await yahooChart(u.ticker, { interval: '1d', range: '5d' });
      const meta = ch?.chart?.result?.[0]?.meta || {};
      const ts = ch?.chart?.result?.[0]?.timestamp || [];
      const closes = ch?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const lastClose = [...closes].reverse().find((c) => c != null);
      price = parseMoney(meta.regularMarketPrice) ?? (lastClose != null ? r2(lastClose) : null);
      if (ts.length) priceTs = msToIso(ts[ts.length - 1] * 1000);
      if (priceTs && (Date.now() - new Date(priceTs).getTime()) / 86400000 > STALE_DAYS) {
        console.warn(`[earnings] ${u.ticker}: quote older than ${STALE_DAYS}d (${priceTs}) — dropping ticker`);
        staleDropped++;
        continue;
      }
    } catch (e) {
      console.error(`[earnings] ${u.ticker}: chart fetch failed: ${e.message} — price will be null`);
    }

    // Options-implied move (real chain math)
    let impliedMove = null;
    try {
      impliedMove = await impliedMovePct(u.ticker, u.reporting_date);
    } catch (e) {
      console.error(`[earnings] ${u.ticker}: implied-move computation failed: ${e.message}`);
    }

    // Sector + EPS streak
    let sector = null, industry = null, streak = [];
    try {
      const qs = await yahooQuoteSummary(u.ticker, ['assetProfile', 'earningsHistory']);
      sector = qs?.assetProfile?.sector || null;
      industry = qs?.assetProfile?.industry || null;
      streak = buildStreak(qs?.earningsHistory?.history).map((q) => ({
        ...q,
        // CONTRACT DEVIATION (documented in PIPELINE_README): no keyless
        // source provides historical revenue *estimates*, so revenue
        // beat/miss cannot be computed honestly — null, never filler.
        revenue_result: null,
      }));
    } catch (e) {
      console.error(`[earnings] ${u.ticker}: quoteSummary failed: ${e.message} — sector/streak null`);
    }

    // Fundamentals → health
    const health = await healthScore(u.ticker, cikMap);
    const probUp = probUpFromStreak(streak);
    const conviction = probUp != null && health != null ? Math.round(0.5 * probUp + 0.5 * health) : null;

    // News
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
      console.error(`[earnings] ${u.ticker}: news fetch failed: ${e.message}`);
    }

    // Signals from sidecars
    let insiderSignal = 'neutral';
    if (insiders) {
      const recent = insiders.filter(
        (t) => t.ticker === u.ticker && t.transaction_date && Math.abs(daysBetweenSafe(t.transaction_date, today)) <= 7
      );
      const buyers = new Set(recent.filter((t) => t.transaction_code === 'P').map((t) => t.owner_name));
      const sellers = new Set(recent.filter((t) => t.transaction_code === 'S').map((t) => t.owner_name));
      if (buyers.size >= 2) insiderSignal = 'bullish';
      else if (sellers.size >= 3) insiderSignal = 'bearish';
    }
    let politicalSignal = 'neutral';
    if (congress) {
      const recent = congress.filter(
        (t) => t.ticker === u.ticker && t.disclosed_date && daysBetweenSafe(t.disclosed_date, today) <= 14 && daysBetweenSafe(t.disclosed_date, today) >= 0
      );
      const buyers = new Set(recent.filter((t) => t.trade_type === 'buy').map((t) => t.member));
      const sellers = new Set(recent.filter((t) => t.trade_type === 'sell').map((t) => t.member));
      if (buyers.size >= 2) politicalSignal = 'bullish';
      else if (sellers.size >= 2) politicalSignal = 'bearish';
    }

    entries.push({
      ticker: u.ticker,
      name: u.name,
      sector: sector || 'Unknown',
      industry: industry || 'Unknown',
      cap_tier: capTier(u.marketCap),
      reporting_date: u.reporting_date,
      report_time: u.report_time,
      status: 'upcoming',
      eps_est: u.eps_est,
      eps_actual: null, // reports in the future in a forward calendar
      surprise_pct: null,
      rev_est_b: null, // Nasdaq calendar carries no revenue forecast (documented)
      rev_actual_b: null,
      current_price: price,
      price_ts: priceTs,
      implied_move_pct: impliedMove,
      iv_rank: null, // true IV rank needs historical IV — no free keyless source (documented)
      health_score: health,
      prob_up_pct: probUp,
      conviction,
      streak,
      insider_signal: insiderSignal,
      political_signal: politicalSignal,
      news,
      // Post-earnings performance: upcoming rows have none yet.
      baseline_price: null,
      baseline_date: null,
      perf_1d_pct: null,
      perf_1d_date: null,
      perf_7d_pct: null,
      perf_7d_date: null,
      perf_30d_pct: null,
      perf_30d_date: null,
      perf_to_date_pct: null,
      perf_as_of: null,
    });
  }

  // ── Step 4: past 60 days — reported earnings + price reaction ──────────
  // Nasdaq past-date rows carry the actual EPS (`eps`) and surprise %.
  // Performance is measured from the close on the report date (or the last
  // close before it when the report fell on a non-trading day).
  const pastRows = [];
  for (let i = 1; i <= PAST_DAYS; i++) {
    const d = addDays(today, -i);
    try {
      const j = await fetchJson(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, {
        label: `nasdaq earnings calendar (past) ${d}`,
      });
      const rws = j?.data?.rows || [];
      console.log(`[earnings] past ${d}: ${rws.length} rows`);
      for (const r of rws) pastRows.push({ ...r, _date: d });
    } catch (e) {
      console.error(`[earnings] past calendar fetch FAILED for ${d}: ${e.message} — continuing`);
    }
  }
  const pastSeen = new Map();
  for (const r of pastRows) {
    const symbol = String(r.symbol || '').trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
    const mktCap = parseMoney(r.marketCap);
    if (mktCap == null || mktCap < MIN_MKTCAP) continue;
    const epsActual = parseMoney(r.eps);
    if (epsActual == null) continue; // not actually reported yet in the feed
    if (pastSeen.has(symbol)) continue;
    pastSeen.set(symbol, {
      ticker: symbol,
      name: String(r.name || '').trim() || symbol,
      marketCap: mktCap,
      reporting_date: r._date,
      eps_est: parseMoney(r.epsForecast),
      eps_actual: epsActual,
      surprise_pct: parseMoney(r.surprise),
      report_time: r.time === 'time-pre-market' ? 'BMO' : r.time === 'time-after-hours' ? 'AMC' : 'UNKNOWN',
    });
  }
  const pastUniverse = [...pastSeen.values()]
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, MAX_PAST);
  console.log(`[earnings] ${pastUniverse.length} past tickers (≥$${MIN_MKTCAP / 1e9}B mktcap, top ${MAX_PAST})`);

  // Sector / industry from the previous run's fundamentals (fresh ≤7d).
  let fundMap = {};
  try {
    const f = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fundamentals.json'), 'utf8'));
    const ageDays = f?.as_of ? (Date.now() - new Date(f.as_of).getTime()) / 86400000 : 999;
    if (ageDays <= 7 && f?.fundamentals) fundMap = f.fundamentals;
  } catch {
    // No usable fundamentals sidecar — sectors stay 'Unknown'.
  }

  for (const u of pastUniverse) {
    console.log(`[earnings] past ${u.ticker} (reported ${u.reporting_date})`);
    let bars = [];
    try {
      const ch = await yahooChart(u.ticker, { interval: '1d', range: '6mo' });
      const ts = ch?.chart?.result?.[0]?.timestamp || [];
      const closes = ch?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      for (let i = 0; i < ts.length; i++) {
        if (closes[i] == null) continue;
        bars.push({ date: unixToDate(ts[i]), close: r2(closes[i]), ts: ts[i] });
      }
    } catch (e) {
      console.error(`[earnings] past ${u.ticker}: chart fetch failed: ${e.message} — perf null`);
    }
    // Baseline: last close on or before the report date.
    let baseIdx = -1;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].date <= u.reporting_date) baseIdx = i;
      else break;
    }
    const base = baseIdx >= 0 ? bars[baseIdx] : null;
    const closeAt = (n) => {
      if (!base || baseIdx + n >= bars.length) return null;
      return bars[baseIdx + n];
    };
    const pct = (b) => (base && b && base.close > 0 ? r2(((b.close / base.close) - 1) * 100, 1) : null);
    const d1 = closeAt(1), d7 = closeAt(7), d30 = closeAt(30);
    const last = bars.length ? bars[bars.length - 1] : null;
    const fund = fundMap[u.ticker] || {};
    entries.push({
      ticker: u.ticker,
      name: fund.name || u.name,
      sector: fund.sector || 'Unknown',
      industry: fund.industry || 'Unknown',
      cap_tier: capTier(u.marketCap),
      reporting_date: u.reporting_date,
      report_time: u.report_time,
      status: 'reported',
      eps_est: u.eps_est,
      eps_actual: u.eps_actual,
      surprise_pct: u.surprise_pct,
      rev_est_b: null,
      rev_actual_b: null,
      current_price: last ? last.close : null,
      price_ts: last ? msToIso(last.ts * 1000) : null,
      implied_move_pct: null, // post-report: the options-implied move is meaningless
      iv_rank: null,
      health_score: null, // lean past rows: no SEC enrichment (see header)
      prob_up_pct: null,
      conviction: null,
      streak: [],
      insider_signal: 'neutral',
      political_signal: 'neutral',
      news: [],
      baseline_price: base ? base.close : null,
      baseline_date: base ? base.date : null,
      perf_1d_pct: pct(d1),
      perf_1d_date: d1 ? d1.date : null,
      perf_7d_pct: pct(d7),
      perf_7d_date: d7 ? d7.date : null,
      perf_30d_pct: pct(d30),
      perf_30d_date: d30 ? d30.date : null,
      perf_to_date_pct: pct(last),
      perf_as_of: last ? last.date : null,
    });
  }
  console.log(`[earnings] past entries added: ${pastUniverse.length}`);

  entries.sort((a, b) =>
    a.reporting_date !== b.reporting_date
      ? a.reporting_date < b.reporting_date ? -1 : 1
      : 0
  );
  console.log(`[earnings] wrote ${entries.length} entries (dropped ${staleDropped} stale)`);
  writeJsonAtomic(path.join(OUT_DIR, 'earnings.json'), entries);
}

function daysBetweenSafe(a, b) {
  try {
    return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
  } catch {
    return 9999;
  }
}

main().catch((e) => {
  console.error(`[earnings] FATAL: ${e.message}`);
  process.exit(1);
});
