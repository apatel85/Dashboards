/**
 * options.mjs — Black-Scholes pricing, expected move, contract choice
 * (spec §5, §3.1, §7.4).
 *
 * Reuse check (WO-01): `bsGamma` is IDENTICAL in
 * pipeline/build-lotto.mjs and pipeline/build-gex.mjs (same guard, same
 * formula) — it is moved here unchanged. `bsDelta` exists only in
 * build-lotto.mjs and is moved here unchanged (same normCDF
 * Abramowitz-Stegun approximation). `bsPrice` exists in NEITHER file
 * (both only needed delta/gamma) — it is new, using the same normCDF.
 * The two scripts keep their copies until WO-04/06 rewires them; this
 * file is the canonical copy from WO-01 on.
 *
 * `expectedMove` (§3.1): E[move] = 5% × P(5–10%) + 10% × P(10–15%) +
 * 15% × P(≥15%), with P(5–10%) = p_t1 − p_t2, P(10–15%) = p_t2 − p_t3,
 * P(≥15%) = p_t3. Probabilities in as fractions, move out in percent
 * points. Tail assumption: moves beyond 15% count as 15%. Null when
 * any tier probability is null. Inputs must satisfy p_t1 ≥ p_t2 ≥ p_t3;
 * a violated ordering is not silently clamped.
 *
 * `chooseContract` (§7.4): names the contract that expresses the call.
 * Candidates are single options in the signal's direction between 30
 * and 50 delta, 0DTE (or 1DTE). Reject contracts with no bid or with a
 * bid-ask spread wider than 10% of the mid. Pick the one nearest 40
 * delta. Also reports the strike nearest each tier level. Returns
 * { contract, reason } — `contract` is null with a plain `reason` when
 * nothing fits (null alone cannot carry a reason, so the wrapper
 * carries it; judgment call on the §7.4 shape).
 */
import { PARAMS } from './params.mjs';

/** Standard normal CDF (Abramowitz–Stegun — same as build-lotto.mjs). */
export function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function d1d2(S, K, T, r, sigma) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2 };
}

function saneBS(S, K, T, r, sigma) {
  return S > 0 && K > 0 && T > 0 && sigma > 0 && sigma < 5 && Number.isFinite(r);
}

/**
 * Black-Scholes price. isCall true = call, false = put. Returns null on
 * invalid inputs (rather than the 0 the pipeline's delta/gamma return —
 * a price of 0 would be a tradeable-looking lie).
 */
export function bsPrice(S, K, T, r, sigma, isCall) {
  if (!saneBS(S, K, T, r, sigma)) return null;
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  const disc = Math.exp(-r * T);
  return isCall ? S * normCDF(d1) - K * disc * normCDF(d2)
    : K * disc * normCDF(-d2) - S * normCDF(-d1);
}

/**
 * Black-Scholes delta (same as build-lotto.mjs): N(d1) for calls,
 * N(d1) − 1 for puts. Returns 0.5 / −0.5 when T or sigma are unusable
 * (the pipeline's fallback).
 */
export function bsDelta(S, K, T, r, sigma, isCall) {
  if (!(T > 0 && sigma > 0 && sigma < 5)) return isCall ? 0.5 : -0.5;
  const { d1 } = d1d2(S, K, T, r, sigma);
  const nd1 = normCDF(d1);
  return isCall ? nd1 : nd1 - 1;
}

/**
 * Black-Scholes gamma per $1 move (identical to build-lotto.mjs and
 * build-gex.mjs). Returns 0 on invalid inputs.
 */
export function bsGamma(S, K, T, r, sigma) {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0 && sigma < 5)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const phi = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return phi / (S * sigma * sqrtT);
}

/** Expected size of move (§3.1). Probabilities in as fractions, percent out. */
export function expectedMove(pT1, pT2, pT3) {
  if (pT1 == null || pT2 == null || pT3 == null) return null;
  return 5 * (pT1 - pT2) + 10 * (pT2 - pT3) + 15 * pT3;
}

/**
 * chooseContract(chain, opts) → { contract, reason }.
 * chain: [{ symbol, type: 'call'|'put', strike, expiry, delta, bid, ask,
 *   mid?, lastPrice? }] — delta signed (calls +, puts −) and may be a
 *   fraction (0.42) or percent (42); fractions are converted to percent
 *   for the 30–50 test, and the original value is returned untouched.
 *   opts: { direction: 'long'|'short',
 * entryPrice, tiers: [5, 10, 15], dte: 0 | 1 }.
 * Mid = (bid+ask)/2, else lastPrice (same as pipeline/lib/scoring.mjs
 * `contractMid`). Spread = (ask−bid)/mid.
 */
export function chooseContract(chain, opts, params = PARAMS) {
  const { direction, entryPrice, tiers = [5, 10, 15] } = opts || {};
  const want = direction === 'long' ? 'call' : direction === 'short' ? 'put' : null;
  if (!want) return { contract: null, reason: 'No direction given' };
  if (!chain || !chain.length) return { contract: null, reason: 'No options in the chain' };
  const tierStrikes = {};
  const signs = { t1: tiers[0], t2: tiers[1], t3: tiers[2] };
  for (const [key, pct] of Object.entries(signs)) {
    if (pct == null || entryPrice == null) { tierStrikes[key] = null; continue; }
    const level = direction === 'long' ? entryPrice * (1 + pct / 100) : entryPrice * (1 - pct / 100);
    tierStrikes[key] = Math.round(level * 100) / 100;
  }
  let inDelta = 0;
  let best = null;
  let bestDist = Infinity;
  for (const c of chain) {
    if (c.type !== want) continue;
    const adRaw = Math.abs(c.delta ?? NaN);
    if (!Number.isFinite(adRaw)) continue;
    // Chain deltas arrive as fractions (0.42); params store percent (30–50).
    const ad = adRaw <= 1 ? adRaw * 100 : adRaw;
    if (ad < params.options.deltaMin || ad > params.options.deltaMax) continue;
    inDelta++;
    const mid = c.mid ?? (c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : c.lastPrice ?? null);
    if (c.bid == null || c.bid <= 0 || mid == null || mid <= 0) continue;
    const spreadPct = c.ask != null ? ((c.ask - c.bid) / mid) * 100 : null;
    if (spreadPct == null || spreadPct > params.options.maxSpreadPct) continue;
    const dist = Math.abs(ad - params.options.deltaTarget);
    if (dist < bestDist) {
      bestDist = dist;
      best = { symbol: c.symbol, type: c.type, strike: c.strike, expiry: c.expiry, delta: c.delta, mid, spreadPct, tierStrikes };
    }
  }
  if (best) return { contract: best, reason: null };
  if (!inDelta) return { contract: null, reason: 'No contract between 30 and 50 delta' };
  return { contract: null, reason: 'No contract with a tight enough spread' };
}
