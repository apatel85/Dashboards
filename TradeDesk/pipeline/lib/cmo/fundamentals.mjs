/**
 * fundamentals.mjs — point-in-time fundamental inputs (plan §4.4, spec §5).
 *
 * Every function takes an `asOf` date ('YYYY-MM-DD') and IGNORES anything
 * filed after it — a number may be used only from the date it was filed
 * or announced. Comparison is by date string (ISO dates sort
 * lexicographically), so no clock is read anywhere.
 *
 * EPS surprise matches the pipeline's existing definition
 * (pipeline/lib/scoring.mjs `buildStreak`): (actual − consensus) ÷
 * |consensus| — returned here as a fraction (0.10 = +10%); the pipeline
 * helper returns the same number × 100 (percent).
 *
 * Quarters are arrays of { filed, eps, sales, opMargin } sorted by
 * `filed` ascending; functions filter to filed <= asOf themselves.
 */
import { mean, stdev } from './util.mjs';

/** Filings on or before asOf, in filed order. */
function asOfQuarters(quarters, asOf) {
  return (quarters || []).filter((q) => q.filed && q.filed <= asOf);
}

/**
 * EPS surprise (plan §4.4): (actual − consensus) ÷ |consensus|.
 * Returns a fraction, or null when consensus is missing or zero.
 */
export function epsSurprise(actual, consensus) {
  if (actual == null || consensus == null || consensus === 0) return null;
  return (actual - consensus) / Math.abs(consensus);
}

/**
 * Standardised surprise, SUE fallback (plan §4.4): the latest year-over-year
 * EPS change divided by the standard deviation of that change over the
 * last 8 quarters. Needs 9 quarters on/before asOf (8 YoY changes).
 * Returns null when there is not enough history or the stddev is 0.
 */
export function sue(quarters, asOf) {
  const qs = asOfQuarters(quarters, asOf).filter((q) => q.eps != null);
  if (qs.length < 9) return null;
  const changes = [];
  for (let i = 4; i < qs.length; i++) changes.push(qs[i].eps - qs[i - 4].eps);
  if (changes.length < 8) return null;
  const last8 = changes.slice(-8);
  const sd = stdev(last8);
  if (!sd) return null;
  return last8[last8.length - 1] / sd;
}

/**
 * Quarterly growth YoY (plan §4.4): latest quarter vs the same quarter
 * last year, for EPS and sales. Returns { epsYoY, salesYoY } as
 * fractions, each null when the year-ago value is missing or zero.
 */
export function growthYoY(quarters, asOf) {
  const qs = asOfQuarters(quarters, asOf);
  if (qs.length < 5) return { epsYoY: null, salesYoY: null };
  const cur = qs[qs.length - 1];
  const ago = qs[qs.length - 5];
  const yoy = (a, b) => (a != null && b != null && b !== 0 ? (a - b) / Math.abs(b) : null);
  return { epsYoY: yoy(cur.eps, ago.eps), salesYoY: yoy(cur.sales, ago.sales) };
}

/**
 * Acceleration (plan §4.4): YoY growth for the last three quarters
 * (oldest → newest) and whether it is rising each quarter.
 * Returns { eps: [g1, g2, g3], sales: [g1, g2, g3], accelerating }.
 * `accelerating` is true only when all three EPS growths exist and rise.
 */
export function acceleration(quarters, asOf) {
  const qs = asOfQuarters(quarters, asOf);
  const yoyAt = (i) => {
    if (i < 4) return { eps: null, sales: null };
    const cur = qs[i];
    const ago = qs[i - 4];
    const yoy = (a, b) => (a != null && b != null && b !== 0 ? (a - b) / Math.abs(b) : null);
    return { eps: yoy(cur.eps, ago.eps), sales: yoy(cur.sales, ago.sales) };
  };
  const last3 = [qs.length - 3, qs.length - 2, qs.length - 1].map(yoyAt);
  const eps = last3.map((g) => g.eps);
  const sales = last3.map((g) => g.sales);
  const accelerating = eps.every((g) => g != null) && eps[2] > eps[1] && eps[1] > eps[0];
  return { eps, sales, accelerating };
}

/**
 * Margin trend (plan §4.4): operating margin of the latest quarter vs
 * the same quarter last year. Returns { margin, marginYoY, trend } with
 * marginYoY in percentage points and trend 'up' | 'down' | 'flat'.
 */
export function marginTrend(quarters, asOf) {
  const qs = asOfQuarters(quarters, asOf).filter((q) => q.opMargin != null);
  if (qs.length < 5) return { margin: null, marginYoY: null, trend: null };
  const cur = qs[qs.length - 1].opMargin;
  const ago = qs[qs.length - 5].opMargin;
  const diff = (cur - ago) * 100;
  return { margin: cur, marginYoY: diff, trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}
