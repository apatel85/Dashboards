/**
 * tiers.mjs — tier outcomes, bucket keys and probability lookup
 * (spec §3.1, §6.4).
 *
 * A candidate WINS a tier when the price moves that far in the called
 * direction within the window. Breakout candidates are judged on the
 * highest high / lowest low reached (extremes); option plays are judged
 * on the CLOSE (§3.1) — pass { basis: 'close' } for those.
 *
 * bucketKey: setup × direction × grade × daily-range band × ATR-distance
 * band. ADR bands: 3–5, 5–8, over 8. ATR-distance bands: within 1 ATR,
 * 1–2 ATR, over 2 ATR.
 *
 * lookupProbability fallback order (§6.4 step 3): full key → drop the
 * ATR-distance band → drop the daily-range band → merge A+ with A.
 * Still under 100 cases → null ("not enough history"). The returned
 * object says which fallback level was used.
 */
import { PARAMS } from './params.mjs';

/** ADR band label for a daily-range percent (params.buckets.adrBands). */
export function adrBand(adrPct, params = PARAMS) {
  if (adrPct == null) return null;
  if (adrPct < 3) return 'adr<3';
  if (adrPct < 5) return 'adr3-5';
  if (adrPct < 8) return 'adr5-8';
  return 'adr8+';
}

/** ATR-distance band label for a pivot distance in ATRs. */
export function atrBand(distanceAtr, params = PARAMS) {
  if (distanceAtr == null) return null;
  if (distanceAtr <= 1) return 'atr0-1';
  if (distanceAtr <= 2) return 'atr1-2';
  return 'atr2+';
}

/** Full bucket key: setup|direction|grade|adrBand|atrBand. */
export function bucketKey(candidate, params = PARAMS) {
  return [candidate.setup, candidate.direction, candidate.grade,
    adrBand(candidate.adrPct, params), atrBand(candidate.atrDistance, params)].join('|');
}

/** 90% Wilson score interval for hits/cases. Returns { p, low, high } as fractions. */
export function wilsonInterval(hits, cases, z = 1.645) {
  if (!cases) return { p: null, low: null, high: null };
  const p = hits / cases;
  const denom = 1 + (z * z) / cases;
  const centre = (p + (z * z) / (2 * cases)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / cases + (z * z) / (4 * cases * cases))) / denom;
  return { p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function aggregate(rows) {
  let cases = 0;
  let hits = 0;
  for (const r of rows) { cases += r.cases; hits += r.hits; }
  return { cases, hits };
}

function toResult(agg, fallback, params) {
  if (agg.cases < params.buckets.minCases) return null;
  const { p, low, high } = wilsonInterval(agg.hits, agg.cases, params.buckets.wilsonZ90);
  return { p, cases: agg.cases, hits: agg.hits, ciLow: low, ciHigh: high, fallback };
}

/**
 * lookupProbability(rows, candidate, params) → the bucket's probability
 * or null. `rows` is an array of { setup, direction, grade, adrBand,
 * atrBand, cases, hits } — one row per bucket × tier is NOT assumed;
 * rows carry the tier implicitly (call once per tier table).
 * Fallback levels, in order: 'full' → 'no-atr' → 'no-adr' →
 * 'merged-grade'. A level only counts if its aggregated cases reach
 * `minCases` (100). The merge step applies only to A/A+ candidates.
 */
export function lookupProbability(rows, candidate, params = PARAMS) {
  const ab = adrBand(candidate.adrPct, params);
  const tb = atrBand(candidate.atrDistance, params);
  const match = (pred) => rows.filter(pred);

  const full = match((r) => r.setup === candidate.setup && r.direction === candidate.direction &&
    r.grade === candidate.grade && r.adrBand === ab && r.atrBand === tb);
  const r1 = toResult(aggregate(full), 'full', params);
  if (r1) return r1;

  const noAtr = match((r) => r.setup === candidate.setup && r.direction === candidate.direction &&
    r.grade === candidate.grade && r.adrBand === ab);
  const r2 = toResult(aggregate(noAtr), 'no-atr', params);
  if (r2) return r2;

  const noAdr = match((r) => r.setup === candidate.setup && r.direction === candidate.direction &&
    r.grade === candidate.grade);
  const r3 = toResult(aggregate(noAdr), 'no-adr', params);
  if (r3) return r3;

  if (candidate.grade === 'A' || candidate.grade === 'A+') {
    const merged = match((r) => r.setup === candidate.setup && r.direction === candidate.direction &&
      (r.grade === 'A' || r.grade === 'A+'));
    const r4 = toResult(aggregate(merged), 'merged-grade', params);
    if (r4) return r4;
  }
  return null;
}

/**
 * tierOutcome(bars, entryIndex, entryPrice, direction, window, tiers, opts)
 * → { hit, sessionsTo, bestMovePct, worstAgainstPct, windowSessions }.
 * Looks at the `window` sessions AFTER entryIndex (entryIndex+1 ..
 * entryIndex+window). `tiers` is an array of percents, default [5, 10, 15].
 * `hit[t]` is true when the tier was reached; `sessionsTo[t]` is how many
 * sessions it took (1-based), null when never reached.
 * `bestMovePct` is the furthest the price went in the called direction;
 * `worstAgainstPct` is the worst move against the call, measured up to
 * the session where the highest tier was first reached (or the window
 * end when no tier was reached) — judgment call, §3.1 says "before the
 * tier was reached" without fixing which tier when several are reached.
 * `opts.basis`: 'extremes' (default — intraday high/low) or 'close'
 * (option plays, §3.1 — judged on the close only).
 */
export function tierOutcome(bars, entryIndex, entryPrice, direction, window, tiers = [5, 10, 15], opts = {}) {
  const basis = opts.basis || 'extremes';
  const long = direction === 'long';
  const end = Math.min(entryIndex + window, bars.length - 1);
  const hit = {};
  const sessionsTo = {};
  for (const t of tiers) { hit[String(t)] = false; sessionsTo[String(t)] = null; }
  let bestMovePct = 0;
  let highestTierSession = null;
  // First pass: find tier hits and the best move.
  for (let i = entryIndex + 1; i <= end; i++) {
    const b = bars[i];
    const favourable = basis === 'close'
      ? (long ? (b.c / entryPrice - 1) * 100 : (entryPrice / b.c - 1) * 100)
      : (long ? (b.h / entryPrice - 1) * 100 : (entryPrice / b.l - 1) * 100);
    if (favourable > bestMovePct) bestMovePct = favourable;
    for (const t of tiers) {
      if (!hit[String(t)] && favourable >= t) {
        hit[String(t)] = true;
        sessionsTo[String(t)] = i - entryIndex;
      }
    }
  }
  const reachedTiers = tiers.filter((t) => hit[String(t)]);
  if (reachedTiers.length) {
    const top = Math.max(...reachedTiers);
    highestTierSession = entryIndex + sessionsTo[String(top)];
  }
  // Worst move against: up to the session the highest tier was reached, else the window end.
  // Long: the lowest low relative to entry (most negative). Short: the
  // highest high relative to entry (most positive). 0 when the price
  // never moved against the call.
  const worstEnd = highestTierSession != null ? highestTierSession : end;
  let worstAgainstPct = 0;
  for (let i = entryIndex + 1; i <= worstEnd; i++) {
    const b = bars[i];
    const adverse = long ? (b.l / entryPrice - 1) * 100 : (b.h / entryPrice - 1) * 100;
    if (long ? adverse < worstAgainstPct : adverse > worstAgainstPct) worstAgainstPct = adverse;
  }
  return {
    hit, sessionsTo, bestMovePct,
    worstAgainstPct,
    windowSessions: Math.max(0, end - entryIndex),
  };
}
