#!/usr/bin/env node
/**
 * lib/scoring.mjs — documented fundamental scoring from SEC EDGAR companyfacts.
 *
 * All inputs are real reported facts; formulas are deterministic heuristics
 * (labeled as such, never presented as precise models).
 */
import { companyFacts, latestQuarterlyValue, yearAgoQuarterlyValue } from './sec.mjs';
import { clamp, r2 } from './util.mjs';

export const REV_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
];

/**
 * Health score 5–98 (documented heuristic):
 *   50 + clamp(revenueYoY% × 0.75, ±15) + clamp(netMargin% × 0.6, ±15)
 *   + leverage term (D/E<0.5:+10, <1:+5, <2:0, <3:−8, else:−15)
 * Null when no usable fundamentals.
 */
export async function healthScore(ticker, cikMap) {
  const cik = cikMap[ticker];
  if (!cik) return null;
  let facts;
  try {
    facts = await companyFacts(cik);
  } catch (e) {
    console.warn(`[scoring] ${ticker}: companyfacts failed: ${e.message} — health null`);
    return null;
  }
  return healthFromFacts(facts);
}

export function healthFromFacts(facts) {
  const rev = latestQuarterlyValue(facts, REV_TAGS);
  if (!rev) return null;
  let score = 50;
  const ago = yearAgoQuarterlyValue(facts, rev.tag, rev.end);
  if (ago && ago.value) {
    const g = ((rev.value - ago.value) / Math.abs(ago.value)) * 100;
    score += clamp(g * 0.75, -15, 15);
  }
  const ni = latestQuarterlyValue(facts, ['NetIncomeLoss']);
  if (ni && rev.value) score += clamp((ni.value / Math.abs(rev.value)) * 100 * 0.6, -15, 15);
  const liab = latestQuarterlyValue(facts, ['Liabilities']);
  const eq = latestQuarterlyValue(facts, ['StockholdersEquity']);
  if (liab && eq && eq.value > 0) {
    const de = liab.value / eq.value;
    score += de < 0.5 ? 10 : de < 1 ? 5 : de < 2 ? 0 : de < 3 ? -8 : -15;
  }
  return Math.round(clamp(score, 5, 98));
}

/** Build last-4-quarter EPS streak from Yahoo earningsHistory rows. */
export function buildStreak(history) {
  return (history || []).slice(0, 4).map((q) => {
    const actual = q?.epsActual?.raw ?? null;
    const est = q?.epsEstimate?.raw ?? null;
    // endDate is present for most US filers; some (e.g. foreign ADRs) only
    // carry quarter.raw (a timestamp) — fall back to it.
    const endRaw = q?.endDate?.raw ?? q?.quarter?.raw ?? null;
    let quarter = 'Unknown';
    if (endRaw) {
      const d = new Date(endRaw * 1000);
      quarter = `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    }
    let eps_result = 'in-line';
    let surprise_pct = null;
    if (actual != null && est != null && est !== 0) {
      surprise_pct = r2(((actual - est) / Math.abs(est)) * 100, 1);
      eps_result = actual > est * 1.01 ? 'beat' : actual >= est * 0.99 ? 'in-line' : 'miss';
    }
    return { quarter, eps_result, surprise_pct };
  });
}

/** 50 + 7×beats + 2×in-lines − 8×misses, clamped 25–90. Null on empty streak. */
export function probUpFromStreak(streak) {
  if (!streak.length) return null;
  let s = 50;
  for (const q of streak) {
    if (q.eps_result === 'beat') s += 7;
    else if (q.eps_result === 'in-line') s += 2;
    else s -= 8;
  }
  return Math.round(clamp(s, 25, 90));
}

/**
 * Piotroski F-score 0–9 from companyfacts (real accounting criteria):
 * profitability (ROA>0, OCF>0, ROA improving, OCF>ROA), leverage/liquidity
 * (leverage falling, current ratio rising, no new shares), operating
 * efficiency (gross margin rising, asset turnover rising). Each = 1 point.
 * Comparisons use the latest vs year-ago quarter. Null when data insufficient.
 */
export function piotroskiFromFacts(facts) {
  const v = (tags) => latestQuarterlyValue(facts, tags);
  const yoy = (tags, refEnd) => {
    const cur = v(tags);
    if (!cur) return null;
    const ago = yearAgoQuarterlyValue(facts, cur.tag, refEnd || cur.end);
    if (!ago) return null;
    return { cur: cur.value, ago: ago.value, tag: cur.tag, end: cur.end };
  };
  try {
    const ni = v(['NetIncomeLoss']);
    const ocf = v(['NetCashProvidedByUsedInOperatingActivities']);
    const assets = v(['Assets']);
    const rev = v(REV_TAGS);
    if (!ni || !assets || !assets.value) return null;
    const refEnd = ni.end;
    let score = 0;
    const roa = ni.value / assets.value;
    if (roa > 0) score++;
    if (ocf && ocf.value > 0) score++;
    const niAgo = yearAgoQuarterlyValue(facts, 'NetIncomeLoss', refEnd);
    const aAgo = yearAgoQuarterlyValue(facts, 'Assets', refEnd);
    if (niAgo && aAgo && aAgo.value && ni.value / assets.value > niAgo.value / aAgo.value) score++;
    if (ocf && ocf.value / assets.value > roa) score++;
    const liab = v(['Liabilities']);
    const liabAgo = liab ? yearAgoQuarterlyValue(facts, liab.tag, refEnd) : null;
    if (liab && liabAgo && assets.value && aAgo && aAgo.value &&
        liab.value / assets.value < liabAgo.value / aAgo.value) score++;
    const ca = v(['AssetsCurrent']), cl = v(['LiabilitiesCurrent']);
    const caAgo = ca ? yearAgoQuarterlyValue(facts, ca.tag, refEnd) : null;
    const clAgo = cl ? yearAgoQuarterlyValue(facts, cl.tag, refEnd) : null;
    if (ca && cl && cl.value && caAgo && clAgo && clAgo.value &&
        ca.value / cl.value > caAgo.value / clAgo.value) score++;
    const shares = v(['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic']);
    const sharesAgo = shares ? yearAgoQuarterlyValue(facts, shares.tag, refEnd) : null;
    if (shares && sharesAgo && shares.value <= sharesAgo.value) score++;
    const gp = v(['GrossProfit']);
    if (gp && rev && rev.value && gp.value != null) {
      const gpAgo = yearAgoQuarterlyValue(facts, gp.tag, refEnd);
      const revAgo = yearAgoQuarterlyValue(facts, rev.tag, refEnd);
      if (gpAgo && revAgo && revAgo.value && gp.value / rev.value > gpAgo.value / revAgo.value) score++;
    }
    if (rev && rev.value && aAgo && aAgo.value && assets.value) {
      const revAgo = yearAgoQuarterlyValue(facts, rev.tag, refEnd);
      if (revAgo && revAgo.value && rev.value / assets.value > revAgo.value / aAgo.value) score++;
    }
    return score;
  } catch (e) {
    console.warn(`[scoring] piotroski computation failed: ${e.message}`);
    return null;
  }
}

/**
 * Altman Z-score (public-firm model) from companyfacts + market cap:
 *   1.2×(WC/TA) + 1.4×(RE/TA) + 3.3×(EBIT/TA) + 0.6×(MVE/TL) + 1.0×(Sales/TA)
 * Null when inputs are missing.
 */
export function altmanZFromFacts(facts, marketCap) {
  try {
    const v = (tags) => latestQuarterlyValue(facts, tags)?.value ?? null;
    const wc = v(['AssetsCurrent']);
    const cl = v(['LiabilitiesCurrent']);
    const ta = v(['Assets']);
    const re = v(['RetainedEarningsAccumulatedDeficit']);
    const ebit = v(['OperatingIncomeLoss']);
    const tl = v(['Liabilities']);
    const sales = v(REV_TAGS);
    if (ta == null || !ta || wc == null || cl == null || re == null ||
        ebit == null || tl == null || !tl || sales == null || marketCap == null || !marketCap) {
      return null;
    }
    const z = 1.2 * ((wc - cl) / ta) + 1.4 * (re / ta) + 3.3 * (ebit / ta) +
              0.6 * (marketCap / tl) + 1.0 * (sales / ta);
    return r2(z);
  } catch (e) {
    console.warn(`[scoring] altman-z computation failed: ${e.message}`);
    return null;
  }
}

/**
 * Earnings quality ratio = operating cash flow / net income (latest quarter).
 * >1 with consistency is healthy; <1 flags accruals. Null when missing.
 */
export function earningsQualityFromFacts(facts) {
  const ocf = latestQuarterlyValue(facts, ['NetCashProvidedByUsedInOperatingActivities']);
  const ni = latestQuarterlyValue(facts, ['NetIncomeLoss']);
  if (!ocf || !ni || !ni.value) return null;
  return r2(ocf.value / ni.value);
}

/** Mid price of an option contract: (bid+ask)/2, else lastPrice. Null if none. */
export function contractMid(c) {
  if (c == null) return null;
  const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) && n > 0 ? n : null; };
  const bid = num(c.bid), ask = num(c.ask);
  if (bid != null && ask != null) return (bid + ask) / 2;
  return num(c.lastPrice);
}
