/**
 * orb.mjs — opening-range breakout, Module B (plan §6.2, spec §7.3).
 *
 * Opening range = high/low of the first 5 minutes (15 as a variant,
 * plan §4.3). Direction comes from the first 5-minute bar (plan §6.2):
 * up → long via a buy stop at its high; down → short via a sell stop
 * at its low. Stop = 10% of ATR(14) from entry. The 5R target in the
 * plan is a labelled plan variant (SOURCES.md §8 decision 8) — the ORB
 * paper exits at stop or close only; orbSignal reports the target but
 * never treats hitting it as an exit by itself.
 *
 * Minute bars are { ts, o, h, l, c, v } in session order. The opening
 * range is the first `minutes` bars of the session.
 */
import { PARAMS } from './params.mjs';

/**
 * openingRange(minuteBars, minutes) → { high, low, startTs, endTs, bars }.
 * Uses the first `minutes` bars; fewer bars are used as-is (flagged by
 * the returned `bars` count).
 */
export function openingRange(minuteBars, minutes = 5) {
  const slice = (minuteBars || []).slice(0, minutes);
  if (!slice.length) return null;
  return {
    high: Math.max(...slice.map((b) => b.h)),
    low: Math.min(...slice.map((b) => b.l)),
    startTs: slice[0].ts ?? null,
    endTs: slice[slice.length - 1].ts ?? null,
    bars: slice.length,
  };
}

/**
 * openingRvol(openVol, avgSameBarVol): opening 5-minute volume divided
 * by the 14-day average of the same bar (plan §4.3). Null without a
 * positive average.
 */
export function openingRvol(openVol, avgSameBarVol) {
  if (avgSameBarVol == null || avgSameBarVol <= 0 || openVol == null) return null;
  return openVol / avgSameBarVol;
}

/**
 * orbSignal(range, current, opts) → { signal, entry, stop, target, endCondition }.
 * `current` = { price, vwap? }. `opts.atr14` is the 14-day ATR (dollars);
 * without it the stop is null. Long when price breaks the range high,
 * short when it breaks the range low, otherwise 'none'.
 * endCondition (spec §7.3): the signal ends when price moves back
 * inside the opening range or through VWAP.
 */
export function orbSignal(range, current, opts = {}, params = PARAMS) {
  if (!range) return { signal: 'none', entry: null, stop: null, target: null, endCondition: null };
  const atr14 = opts.atr14;
  const stopDist = atr14 != null ? (params.orb.stopAtrPct / 100) * atr14 : null;
  const targetR = params.orb.targetR;
  if (current.price > range.high) {
    const entry = range.high;
    return {
      signal: 'long', entry,
      stop: stopDist != null ? entry - stopDist : null,
      target: stopDist != null ? entry + targetR * stopDist : null,
      endCondition: 'Back inside the opening range or through VWAP',
    };
  }
  if (current.price < range.low) {
    const entry = range.low;
    return {
      signal: 'short', entry,
      stop: stopDist != null ? entry + stopDist : null,
      target: stopDist != null ? entry - targetR * stopDist : null,
      endCondition: 'Back inside the opening range or through VWAP',
    };
  }
  return { signal: 'none', entry: null, stop: null, target: null, endCondition: 'No break of the opening range yet' };
}
