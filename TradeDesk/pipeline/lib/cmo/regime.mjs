/**
 * regime.mjs — market regime gate (plan §4.1, spec §6.3).
 *
 * Green: SPY > 50-day SMA AND 21-day EMA > 50-day SMA AND ≥ 50% of the
 * universe above its 50-day SMA.
 * Red: SPY < 200-day SMA OR breadth < 30%.
 * Yellow: neither.
 *
 * The spec's regime rule (Rev 4, §6.3): longs only in Green/Yellow,
 * shorts only in Red/Yellow, both in Yellow. Regime is a gate, not
 * points — the score never adds regime points.
 *
 * `spy` carries PRECOMPUTED values ({ close, sma50, ema21, sma200 }) so
 * this function needs no bars and no clock. VIX is context only (plan
 * §4.1: "recorded daily as context, not as gates") — it is reported in
 * the reasons, never in the decision.
 */
import { PARAMS } from './params.mjs';

export function regimeState({ spy, breadthPct, vix } = {}, params = PARAMS) {
  const reasons = [];
  const green = spy.close > spy.sma50 && spy.ema21 > spy.sma50 && breadthPct >= params.regime.breadthGreenPct;
  const red = spy.close < spy.sma200 || breadthPct < params.regime.breadthRedPct;
  if (spy.close > spy.sma50) reasons.push(`SPY ${spy.close} above 50-day SMA ${spy.sma50}`);
  else reasons.push(`SPY ${spy.close} below 50-day SMA ${spy.sma50}`);
  if (spy.ema21 > spy.sma50) reasons.push(`21-day EMA ${spy.ema21} above 50-day SMA ${spy.sma50}`);
  else reasons.push(`21-day EMA ${spy.ema21} below 50-day SMA ${spy.sma50}`);
  reasons.push(`Breadth ${breadthPct}% of universe above 50-day SMA (Green ≥ ${params.regime.breadthGreenPct}%, Red < ${params.regime.breadthRedPct}%)`);
  if (spy.close < spy.sma200) reasons.push(`SPY ${spy.close} below 200-day SMA ${spy.sma200}`);
  if (vix != null) reasons.push(`VIX ${vix} (context only — not a gate)`);
  const state = green ? 'Green' : red ? 'Red' : 'Yellow';
  return { state, reasons };
}

/** Which directions the regime rule allows: longs in Green/Yellow, shorts in Red/Yellow. */
export function regimeAllows(state) {
  return { long: state === 'Green' || state === 'Yellow', short: state === 'Red' || state === 'Yellow' };
}
