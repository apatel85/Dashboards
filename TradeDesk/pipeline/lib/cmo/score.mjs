/**
 * score.mjs — trade score and readiness score (spec §5, plan §5, spec §6.3).
 *
 * tradeScore: 0–100 across seven components (setup 30, catalyst 20,
 * growth 10, rs 15, volume 15, group 5, options 5). Grades: A+ ≥ 85,
 * A 75–84, B 60–74, C < 60. Regime is a GATE, not points (spec §6.3).
 * The score ranks candidates; it is not itself a probability.
 *
 * Units: surprise and growth inputs are FRACTIONS (0.15 = +15%), matching
 * fundamentals.mjs; gapPct and RVOLs are as returned by indicators.mjs
 * (gap in percent points, RVOL as a multiple).
 *
 * Judgment calls (plan §5 gives only the 0 / half / full rows, not the
 * in-between cases):
 * - Catalyst half (10) covers any beat that is not full (including a
 *   10–15% beat without raised guidance) or soft news; a miss is 0.
 * - Catalyst full keeps the plan's "gap ≥ 8%" row AS WRITTEN. The §8
 *   A1-gap decision (10%) applies to the A1 setup detector, not to this
 *   scoring row — a gap-day A1 (≥ 10%) always clears it anyway.
 * - Growth in-between (e.g. EPS +12%, sales +15% — neither threshold
 *   met but not both < 10%) earns 0: no partial credit is defined.
 * - RS ≥ 90 without an RS-line new high earns half (7.5).
 * - `setupQuality` is supplied by the caller ('trigger' | 'met' |
 *   'full'). The plan's "full" row reads "requirements met + base ≥ 15
 *   sessions + contraction ≤ 50% + surfing 10-day EMA" — "contraction
 *   ≤ 50%" is undefined in the plan (contraction depth is ≤ 25% in
 *   §4.3), so the nightly flow (WO-04) must define 'full' explicitly;
 *   this function only maps the label to points.
 * - Readiness sub-scales are bands (plan §5 gives only the weights):
 *   contraction depth ≤ 10% → 30, ≤ 15% → 22, ≤ 20% → 15, ≤ 25% → 8,
 *   else 0; RS ≥ 90 + line high → 25, RS ≥ 80 → 18, RS ≥ 70 → 10,
 *   else 0; distance ≤ 3% → 15, ≤ 5% → 7.5, else 0; dated catalyst
 *   ≤ 10 sessions → 15, ≤ 20 → 7.5, none → 0.
 */
import { PARAMS } from './params.mjs';

export const GRADES = [
  { min: 85, grade: 'A+' },
  { min: 75, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: -Infinity, grade: 'C' },
];

export function gradeFor(score) {
  return GRADES.find((g) => score >= g.min).grade;
}

function growthPoints(growth, params) {
  const eps = growth?.epsYoY;
  const sales = growth?.salesYoY;
  const epsOk = eps != null && eps * 100 >= params.score.growthEpsFull;
  const salesOk = sales != null && sales * 100 >= params.score.growthSalesFull;
  if (epsOk && salesOk && growth?.accelerating) return { points: params.score.weights.growth, note: 'EPS and sales both strong and accelerating' };
  if (epsOk || salesOk) return { points: params.score.weights.growth / 2, note: 'One of EPS ≥ 25% / sales ≥ 20%' };
  return { points: 0, note: 'EPS and sales growth both below the bars' };
}

/**
 * tradeScore(inputs) → { score, grade, components[] }.
 * inputs: {
 *   setupQuality: 'trigger' | 'met' | 'full',
 *   catalyst: { surprise, guidanceRaised, hardNews, softNews, gapPct },
 *   growth: { epsYoY, salesYoY, accelerating },
 *   rs, rsLineNewHigh, rvol, openingRvol, groupRankPct,
 *   options: { callVolMult, dteVolumeGtOi, insiderCluster, spreadOk } }
 */
export function tradeScore(inputs, params = PARAMS) {
  const w = params.score.weights;
  const c = [];

  const setupPts = inputs.setupQuality === 'full' ? w.setup : inputs.setupQuality === 'met' ? w.setup / 2 : 0;
  c.push({ key: 'setup', label: 'Setup quality', points: setupPts, max: w.setup,
    value: inputs.setupQuality ?? null,
    note: inputs.setupQuality === 'full' ? 'Requirements met, base ≥ 15 sessions, tight contraction, surfing the 10-day EMA'
      : inputs.setupQuality === 'met' ? 'Setup requirements met' : 'Trigger only' });

  const cat = inputs.catalyst || {};
  const surprisePct = cat.surprise != null ? cat.surprise * 100 : null;
  let catPts = 0;
  let catNote = 'No catalyst';
  if ((surprisePct != null && surprisePct >= params.score.catalystFullSurprisePct && cat.guidanceRaised) ||
      cat.hardNews || (cat.gapPct != null && cat.gapPct >= params.score.catalystFullGapPct)) {
    catPts = w.catalyst;
    catNote = 'Surprise ≥ 15% with raised guidance, hard news, or gap ≥ 8%';
  } else if ((surprisePct != null && surprisePct > 0) || cat.softNews) {
    catPts = w.catalyst / 2;
    catNote = 'Earnings beat or soft news';
  }
  c.push({ key: 'catalyst', label: 'Catalyst', points: catPts, max: w.catalyst, value: surprisePct, note: catNote });

  const g = growthPoints(inputs.growth, params);
  c.push({ key: 'growth', label: 'Growth quality', points: g.points, max: w.growth,
    value: inputs.growth ? { epsYoY: inputs.growth.epsYoY, salesYoY: inputs.growth.salesYoY } : null, note: g.note });

  const rs = inputs.rs;
  let rsPts = 0;
  let rsNote = 'RS below 70';
  if (rs != null && rs >= params.rs.scoreFullMin && inputs.rsLineNewHigh) { rsPts = w.rs; rsNote = 'RS ≥ 90 and RS line at a new high'; }
  else if (rs != null && rs >= params.rs.scoreHalfMin) { rsPts = w.rs / 2; rsNote = 'RS 70–89'; }
  c.push({ key: 'rs', label: 'Relative strength', points: rsPts, max: w.rs, value: rs ?? null, note: rsNote });

  const rv = inputs.rvol;
  let volPts = 0;
  let volNote = 'RVOL below 1.5';
  if ((rv != null && rv >= params.score.volumeFullRvol) ||
      (inputs.openingRvol != null && inputs.openingRvol >= params.score.volumeFullOpeningRvol)) {
    volPts = w.volume; volNote = 'RVOL ≥ 3 or opening-bar RVOL ≥ 5';
  } else if (rv != null && rv >= params.score.volumeHalfRvol) { volPts = w.volume / 2; volNote = 'RVOL 1.5–3'; }
  c.push({ key: 'volume', label: 'Volume / attention', points: volPts, max: w.volume, value: rv ?? null, note: volNote });

  const grp = inputs.groupRankPct;
  let grpPts = 0;
  let grpNote = 'Group below the median';
  if (grp != null && grp >= 100 - params.score.groupTopPct) { grpPts = w.group; grpNote = 'Group in the top 20%'; }
  else if (grp != null && grp >= 50) { grpPts = w.group / 2; grpNote = 'Group in the top half'; }
  c.push({ key: 'group', label: 'Group strength', points: grpPts, max: w.group, value: grp ?? null, note: grpNote });

  const opt = inputs.options || {};
  let optPts = 0;
  let optNote = 'Nothing unusual / wide spreads';
  if (opt.spreadOk === false) { optPts = 0; optNote = 'Spreads too wide'; }
  else if (opt.callVolMult != null && opt.callVolMult >= 3 && opt.dteVolumeGtOi && opt.insiderCluster) {
    optPts = w.options; optNote = 'Call volume ≥ 3× average, 0–1 DTE volume above open interest, insider cluster';
  } else if (opt.callVolMult != null && opt.callVolMult >= 3) {
    optPts = w.options / 2; optNote = 'Call volume ≥ 3× its 20-day average';
  }
  c.push({ key: 'options', label: 'Options & positioning', points: optPts, max: w.options,
    value: opt.callVolMult ?? null, note: optNote });

  const score = c.reduce((s, k) => s + k.points, 0);
  return { score, grade: gradeFor(score), components: c };
}

/**
 * readinessScore(inputs) → { score, grade, components[], watchlist }.
 * inputs: { contractionDepthPct, rs, rsLineNewHigh, distToPivotPct,
 *   catalystSessions (sessions to a dated catalyst, null if none),
 *   growth: { epsYoY, salesYoY, accelerating }, optionsActive }.
 * Watchlist at ≥ 70 (plan §5).
 */
export function readinessScore(inputs, params = PARAMS) {
  const w = params.readiness.weights;
  const c = [];

  const d = inputs.contractionDepthPct;
  let conPts = 0;
  if (d != null) conPts = d <= 10 ? w.contraction : d <= 15 ? 22 : d <= 20 ? 15 : d <= 25 ? 8 : 0;
  c.push({ key: 'contraction', label: 'Contraction tightness', points: conPts, max: w.contraction,
    value: d ?? null, note: d == null ? 'No base measured' : `Base depth ${d.toFixed(1)}%` });

  const rs = inputs.rs;
  let rsPts = 0;
  if (rs != null && rs >= 90 && inputs.rsLineNewHigh) rsPts = w.rs;
  else if (rs != null && rs >= 80) rsPts = 18;
  else if (rs != null && rs >= 70) rsPts = 10;
  c.push({ key: 'rs', label: 'RS and RS-line high', points: rsPts, max: w.rs, value: rs ?? null,
    note: rs == null ? 'RS unknown' : `RS ${rs}${inputs.rsLineNewHigh ? ', RS line at a new high' : ''}` });

  const dist = inputs.distToPivotPct;
  const distPts = dist == null ? 0 : dist <= params.readiness.distanceFullPct ? w.distance
    : dist <= params.readiness.distanceHalfPct ? w.distance / 2 : 0;
  c.push({ key: 'distance', label: 'Distance to pivot', points: distPts, max: w.distance,
    value: dist ?? null, note: dist == null ? 'No pivot' : `${dist.toFixed(1)}% from the pivot` });

  const cs = inputs.catalystSessions;
  const catPts = cs == null ? 0 : cs <= params.readiness.catalystFullSessions ? w.catalyst
    : cs <= params.readiness.catalystHalfSessions ? w.catalyst / 2 : 0;
  c.push({ key: 'catalyst', label: 'Dated catalyst', points: catPts, max: w.catalyst,
    value: cs ?? null, note: cs == null ? 'No dated catalyst' : `Catalyst in ${cs} sessions` });

  const g = growthPoints(inputs.growth, params);
  c.push({ key: 'growth', label: 'Growth quality', points: g.points, max: w.growth,
    value: inputs.growth ? { epsYoY: inputs.growth.epsYoY, salesYoY: inputs.growth.salesYoY } : null, note: g.note });

  const optPts = inputs.optionsActive ? w.options : 0;
  c.push({ key: 'options', label: 'Options / insider activity', points: optPts, max: w.options,
    value: inputs.optionsActive ? true : false, note: inputs.optionsActive ? 'Unusual options or insider activity' : 'None' });

  const score = c.reduce((s, k) => s + k.points, 0);
  return { score, grade: gradeFor(score), components: c, watchlist: score >= params.readiness.watchlistMin };
}
