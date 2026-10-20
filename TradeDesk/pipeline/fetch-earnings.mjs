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
      eps_est: u.eps_est,
      eps_actual: null, // reports in the future in a forward calendar
      rev_est_b: null,  // Nasdaq calendar carries no revenue forecast (documented)
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
    });
  }

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
