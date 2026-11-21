/**
 * dte-score.mjs — score for 0DTE / 1DTE option plays (spec §7.5).
 *
 * Separate from the stock score because the inputs differ. 0–100, same
 * grades as the stock score (A+ ≥ 85, A 75–84, B 60–74, C < 60).
 *
 * Hard gates regardless of score (spec §7.5): a scheduled event in the
 * next 30 minutes → gated with 'wait for the release'; data older than
 * 3 minutes → gated with 'data stale'. A gated play scores 0 and the
 * card greys out; the gate reason is returned.
 *
 * Judgment calls (spec §7.5 gives only the full-mark lines, not the
 * in-between cases):
 * - signal: full 30 needs opening RVOL ≥ 5 AND the break holding above
 *   the opening range for 5 minutes; one of the two earns half (15).
 * - gamma: dealers short → 15, neutral → 7.5, long (pinning) → 0.
 * - alignment: agrees with the VWAP side AND the daily regime → 15;
 *   one of the two → 7.5; neither → 0. Regime agreement uses the spec
 *   §6.3 rule (longs Green/Yellow, shorts Red/Yellow).
 * - pricing: ATM-straddle expected move ≤ 20-day realised daily move
 *   → 15; ≤ 1.5× → 7.5; above → 0.
 * - liquidity: spread ≤ 5% of mid → 10; ≤ 10% → 5; above → 0.
 * - time: 0DTE before 11:30 ET → 10, 11:30–13:00 → 5, after 13:00 → 0;
 *   1DTE 15:30–15:55 → 10, 15:00–15:30 → 5, otherwise → 0.
 * - event: no scheduled event later in the session → 5; an event later
 *   (but more than 30 minutes away — inside 30 minutes is a hard gate)
 *   → 0.
 */
import { PARAMS } from './params.mjs';
import { gradeFor } from './score.mjs';
import { regimeAllows } from './regime.mjs';

function minutesOf(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * dteScore(inputs) → { score, grade, components[], gated, gateReason }.
 * inputs: {
 *   openingRvol, breakHeldMinutes, gamma: 'short'|'long'|'neutral',
 *   signalDirection: 'long'|'short', priceVsVwap: 'above'|'below'|null,
 *   regime: 'Green'|'Yellow'|'Red',
 *   expectedMovePct, realisedDailyMovePct, spreadPct,
 *   signalTimeET: 'HH:MM', dte: 0 | 1,
 *   eventLater: bool, eventMinutes: number|null,
 *   dataAgeMinutes: number|null }
 * expectedMovePct / realisedDailyMovePct are percents (e.g. 2.5 = 2.5%).
 */
export function dteScore(inputs, params = PARAMS) {
  const p = params.dte;
  const c = [];

  let gated = false;
  let gateReason = null;
  if (inputs.eventMinutes != null && inputs.eventMinutes <= p.eventGateMinutes) {
    gated = true;
    gateReason = 'wait for the release';
  } else if (inputs.dataAgeMinutes != null && inputs.dataAgeMinutes > p.staleMinutes) {
    gated = true;
    gateReason = 'data stale';
  }

  const sigFull = inputs.openingRvol != null && inputs.openingRvol >= p.signalRvolMin &&
    inputs.breakHeldMinutes != null && inputs.breakHeldMinutes >= p.signalHoldMinutes;
  const sigHalf = (inputs.openingRvol != null && inputs.openingRvol >= p.signalRvolMin) ||
    (inputs.breakHeldMinutes != null && inputs.breakHeldMinutes >= p.signalHoldMinutes);
  const sigPts = sigFull ? 30 : sigHalf ? 15 : 0;
  c.push({ key: 'signal', label: 'Signal strength', points: sigPts, max: 30,
    value: inputs.openingRvol ?? null,
    note: sigFull ? 'Opening RVOL ≥ 5 and the break held for 5 minutes' : sigHalf ? 'One of RVOL / hold confirmed' : 'Weak opening signal' });

  const gammaPts = inputs.gamma === 'short' ? 15 : inputs.gamma === 'neutral' ? 7.5 : 0;
  c.push({ key: 'gamma', label: 'Dealer gamma', points: gammaPts, max: 15, value: inputs.gamma ?? null,
    note: inputs.gamma === 'short' ? 'Dealers short gamma — moves extend' : inputs.gamma === 'long' ? 'Dealers long gamma — pinning' : 'Gamma state neutral or unknown' });

  const vwapAgrees = inputs.signalDirection === 'long' ? inputs.priceVsVwap === 'above'
    : inputs.signalDirection === 'short' ? inputs.priceVsVwap === 'below' : false;
  const allows = regimeAllows(inputs.regime || 'Yellow');
  const regimeAgrees = inputs.signalDirection === 'long' ? allows.long : allows.short;
  const alignPts = vwapAgrees && regimeAgrees ? 15 : vwapAgrees || regimeAgrees ? 7.5 : 0;
  c.push({ key: 'alignment', label: 'Alignment', points: alignPts, max: 15,
    value: { vwap: inputs.priceVsVwap ?? null, regime: inputs.regime ?? null },
    note: vwapAgrees && regimeAgrees ? 'Signal agrees with VWAP side and daily regime'
      : vwapAgrees || regimeAgrees ? 'Agrees with one of VWAP side / regime' : 'Against VWAP side and regime' });

  const exp = inputs.expectedMovePct;
  const real = inputs.realisedDailyMovePct;
  let pricePts = 0;
  let priceNote = 'Expected move unknown';
  if (exp != null && real != null && real > 0) {
    const ratio = exp / real;
    pricePts = ratio <= p.pricingMaxMult ? 15 : ratio <= p.pricingHalfMult ? 7.5 : 0;
    priceNote = ratio <= 1 ? 'ATM straddle move within the usual daily move' : ratio <= 1.5 ? 'Straddle move up to 1.5× the usual daily move' : 'Straddle move far above the usual daily move';
  }
  c.push({ key: 'pricing', label: 'Pricing', points: pricePts, max: 15,
    value: exp ?? null, note: priceNote });

  const sp = inputs.spreadPct;
  const liqPts = sp == null ? 0 : sp <= p.liquidityFullSpreadPct ? 10 : sp <= p.liquidityHalfSpreadPct ? 5 : 0;
  c.push({ key: 'liquidity', label: 'Liquidity', points: liqPts, max: 10, value: sp ?? null,
    note: sp == null ? 'Spread unknown' : `Spread ${sp.toFixed(1)}% of mid` });

  const t = minutesOf(inputs.signalTimeET);
  let timePts = 0;
  if (t != null) {
    if (inputs.dte === 0) {
      const cut = minutesOf(p.time0dteCutoffET);
      const mid = minutesOf('13:00');
      timePts = t < cut ? 10 : t < mid ? 5 : 0;
    } else {
      const start = minutesOf(p.time1dteStartET);
      const end = minutesOf(p.time1dteEndET);
      const early = minutesOf('15:00');
      timePts = t >= start && t <= end ? 10 : t >= early && t < start ? 5 : 0;
    }
  }
  c.push({ key: 'time', label: 'Time of day', points: timePts, max: 10,
    value: inputs.signalTimeET ?? null,
    note: inputs.dte === 0 ? 'Signal before 11:30 ET scores full (0DTE)' : 'Signal 15:30–15:55 ET scores full (1DTE)' });

  const evtPts = inputs.eventLater ? 0 : 5;
  c.push({ key: 'event', label: 'Events', points: evtPts, max: 5, value: inputs.eventLater ? true : false,
    note: inputs.eventLater ? 'A scheduled event comes later in the session' : 'No scheduled event later in the session' });

  const score = gated ? 0 : c.reduce((s, k) => s + k.points, 0);
  return { score, grade: gradeFor(score), components: c, gated, gateReason };
}
