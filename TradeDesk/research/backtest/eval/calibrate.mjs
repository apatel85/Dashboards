/**
 * eval/calibrate.mjs — verdicts per module (spec WO-03 verdict table).
 *
 * Pure functions. One module = six checks, all on window 10 / tier 1
 * unless stated otherwise (the 10-session 5% move is the module's main
 * view; the other windows/tiers are reported in the tables):
 *   1. cases:       ≥ 300 triggered candidates (in-sample + OOS).
 *   2. calibration: pooled stated P(5% in 10) vs pooled actual OOS
 *      frequency within ±7pp (the spec's "or, equivalently" pooled test;
 *      per-bucket Wilson coverage is reported alongside, not gated).
 *   3. lift:        median bucket lift (in-sample P / base rate for the
 *      bucket's direction + ADR band) ≥ 1.3×.
 *   4. ranking:     pooled A/A+ OOS T1 frequency > pooled C frequency,
 *      each group ≥ 100 OOS cases.
 *   5. stability:   A/A+ T1 frequency above the quarter base rate in ≥ 6
 *      of the 8 OOS quarters (a quarter with < 20 A-grade cases counts
 *      as not-above).
 *   6. no-leakage:  after ablating ONE component (catalyst first), the
 *      A/A+ OOS T1 frequency moves < 15pp AND stays above the base rate.
 *      Needs the ablated evaluation; without it the check is
 *      "not-evaluated" (counts as a miss, labelled).
 * Verdict: adopt = all pass; watch = exactly one miss; reject = otherwise.
 * A check that cannot be evaluated counts as a miss.
 *
 * The 65% "high probability" buckets are reported separately: in-sample
 * P ≥ 65%, Wilson CI low ≥ 50%, lift ≥ 1.3×; each is marked on whether
 * its stated P falls inside the OOS Wilson interval (needs ≥ 20 OOS
 * cases in the bucket, else "untested").
 */
import { wilsonInterval } from '../../../pipeline/lib/cmo/index.mjs';
import { lookupFor, quarterOf } from './tables.mjs';
import { WINDOWS } from '../engine/prepare.mjs';

export const CHECKS = ['cases', 'calibration', 'lift', 'ranking', 'stability', 'no-leakage'];

function oosPool(cands, tierRows, params, useAblated = false) {
  // Returns per-candidate OOS lookups (window 10, tier 1) + aggregates.
  const lookups = [];
  for (const c of cands) {
    if (c.inSample || !c.triggered || !c.complete[10]) continue;
    const lk = lookupFor(tierRows[5][10], c, params, useAblated);
    lookups.push({ cand: c, lookup: lk });
  }
  return lookups;
}

function freq(cands, gradeSet) {
  const sel = cands.filter((c) => gradeSet.has(c.ablatedGrade ?? c.grade));
  if (!sel.length) return { cases: 0, hits: 0, freq: null };
  const hits = sel.filter((c) => c.outcomes[10].hit1).length;
  return { cases: sel.length, hits, freq: hits / sel.length };
}

/**
 * Evaluate one scoring variant (baseline or one ablation).
 * `ablation` is null for the baseline, or the component name.
 * Returns { checks: {name: {pass, detail, ...}}, verdict, highProb, fallback, ... }.
 */
export function evaluate({ module, candidates, tierRows, baseRates, params, ablation = null }) {
  const useAblated = ablation != null;
  const includeRegime = ablation === 'regime';
  const graded = candidates.filter((c) =>
    c.setup === module && c.triggered && (includeRegime || !c.regimeExcluded));
  const inSample = graded.filter((c) => c.inSample);
  const oos = graded.filter((c) => !c.inSample);
  const checks = {};
  const direction = module.endsWith('S') ? 'short' : 'long';
  const basePooled = baseRates.pooled[direction]?.[10]?.[5]?.p;

  // 1. cases
  checks.cases = {
    pass: graded.length >= 300,
    detail: `${graded.length} triggered candidates (in-sample ${inSample.length}, OOS ${oos.length}); needs ≥ 300`,
    value: graded.length,
  };

  // OOS lookups (window 10, tier 1) — shared by calibration + fallback.
  const lookups = oosPool(graded, tierRows, params, useAblated);
  const withLookup = lookups.filter((l) => l.lookup);
  const fallback = { full: 0, 'no-atr': 0, 'no-adr': 0, 'merged-grade': 0, none: 0 };
  for (const l of lookups) fallback[l.lookup ? l.lookup.fallback : 'none'] += 1;

  // 2. calibration (pooled ±7pp)
  if (withLookup.length >= 100) {
    const stated = withLookup.reduce((s, l) => s + l.lookup.p, 0) / withLookup.length;
    const hits = withLookup.filter((l) => l.cand.outcomes[10].hit1).length;
    const actual = hits / withLookup.length;
    const diff = actual - stated;
    checks.calibration = {
      pass: Math.abs(diff) <= 0.07,
      detail: `pooled stated P(5% in 10) ${(100 * stated).toFixed(1)}% vs actual ${(100 * actual).toFixed(1)}% on ${withLookup.length} OOS cases (diff ${(100 * diff).toFixed(1)}pp; gate ±7pp)`,
      value: { stated, actual, diff, cases: withLookup.length },
    };
  } else {
    checks.calibration = {
      pass: false, evaluable: false,
      detail: `cannot evaluate: only ${withLookup.length} OOS cases have a bucket lookup (needs ≥ 100)`,
      value: { cases: withLookup.length },
    };
  }

  // 3. lift (median bucket lift, in-sample window 10 tier 1)
  const bucketLifts = [];
  for (const row of tierRows[5][10]) {
    if (row.setup !== module || row.cases < 100) continue;
    const base = baseRates.byBand[direction]?.[row.adrBand]?.[10]?.[5]?.p;
    if (base == null || base <= 0) continue;
    bucketLifts.push({ bucket: `${row.setup}|${row.direction}|${row.grade}|${row.adrBand}|${row.atrBand}`, p: row.p, cases: row.cases, base, lift: row.p / base });
  }
  if (bucketLifts.length) {
    const sorted = [...bucketLifts].sort((a, b) => a.lift - b.lift);
    const median = sorted[Math.floor(sorted.length / 2)].lift;
    const share = bucketLifts.filter((b) => b.lift >= 1.3).length / bucketLifts.length;
    checks.lift = {
      pass: median >= 1.3,
      detail: `median bucket lift ${median.toFixed(2)}× across ${bucketLifts.length} buckets with ≥ 100 in-sample cases (${(100 * share).toFixed(0)}% of buckets ≥ 1.3×); gate ≥ 1.3×`,
      value: { median, buckets: bucketLifts },
    };
  } else {
    checks.lift = {
      pass: false, evaluable: false,
      detail: 'cannot evaluate: no bucket has ≥ 100 in-sample cases',
      value: { buckets: [] },
    };
  }

  // 4. ranking (pooled A/A+ vs C, OOS window 10 tier 1)
  const oosComplete = oos.filter((c) => c.complete[10]);
  const gradedWithGrade = (c) => ({ ...c, ablatedGrade: useAblated && c.ablated ? c.ablated.grade : c.grade });
  const aa = freq(oosComplete.map(gradedWithGrade), new Set(['A', 'A+']));
  const cc = freq(oosComplete.map(gradedWithGrade), new Set(['C']));
  if (aa.cases >= 100 && cc.cases >= 100) {
    checks.ranking = {
      pass: aa.freq > cc.freq,
      detail: `OOS T1 frequency A/A+ ${(100 * aa.freq).toFixed(1)}% (${aa.cases} cases) vs C ${(100 * cc.freq).toFixed(1)}% (${cc.cases} cases)`,
      value: { a: aa, c: cc },
    };
  } else {
    checks.ranking = {
      pass: false, evaluable: false,
      detail: `cannot evaluate: A/A+ ${aa.cases} OOS cases, C ${cc.cases} OOS cases (each needs ≥ 100)`,
      value: { a: aa, c: cc },
    };
  }

  // 5. stability (8 OOS quarters, A/A+ vs quarter base rate)
  const quarters = [...new Set(oosComplete.map((c) => quarterOf(c.date)))].sort();
  const quarterRows = [];
  for (const q of quarters) {
    const qc = oosComplete.filter((c) => quarterOf(c.date) === q);
    const qaa = freq(qc.map(gradedWithGrade), new Set(['A', 'A+']));
    const qbase = baseRates.byQuarter[q]?.[direction]?.[10]?.[5]?.p;
    const above = qaa.cases >= 20 && qbase != null && qaa.freq != null && qaa.freq > qbase;
    quarterRows.push({ quarter: q, aCases: qaa.cases, aFreq: qaa.freq, base: qbase, above });
  }
  const aboveCount = quarterRows.filter((r) => r.above).length;
  checks.stability = {
    pass: aboveCount >= 6,
    detail: `A/A+ above the quarter base rate in ${aboveCount}/${quarterRows.length} OOS quarters (needs ≥ 6/8)`,
    value: { quarters: quarterRows, aboveCount },
  };

  // 6. no-leakage — filled by calibrateModule (needs the ablated evaluation).
  checks['no-leakage'] = {
    pass: false, evaluable: false,
    detail: 'not evaluated in this pass — see the ablated evaluation',
    value: null,
  };

  // High-probability buckets (in-sample window 10 tier 1).
  const highProb = [];
  for (const row of tierRows[5][10]) {
    if (row.setup !== module || row.cases < 100) continue;
    if (row.p < params.buckets.highProbMin / 100) continue;
    if (row.ciLow < params.buckets.highProbCiLowMin / 100) continue;
    const base = baseRates.byBand[direction]?.[row.adrBand]?.[10]?.[5]?.p;
    const lift = base > 0 ? row.p / base : null;
    if (lift == null || lift < params.buckets.highProbLiftMin) continue;
    const oosBucket = oos.filter((c) => {
      const key = useAblated && c.ablated ? c.ablatedBucketKey : c.bucketKey;
      return key === `${row.setup}|${row.direction}|${row.grade}|${row.adrBand}|${row.atrBand}` && c.complete[10];
    });
    let oosCheck = 'untested';
    let oosFreq = null;
    if (oosBucket.length >= 20) {
      const hits = oosBucket.filter((c) => c.outcomes[10].hit1).length;
      oosFreq = hits / oosBucket.length;
      const { low, high } = wilsonInterval(hits, oosBucket.length, params.buckets.wilsonZ90);
      oosCheck = row.p >= low && row.p <= high ? 'pass' : 'fail';
    }
    highProb.push({
      bucket: `${row.setup}|${row.direction}|${row.grade}|${row.adrBand}|${row.atrBand}`,
      p: row.p, ciLow: row.ciLow, ciHigh: row.ciHigh, cases: row.cases,
      lift, oosCases: oosBucket.length, oosFreq, oosCheck,
    });
  }

  const misses = CHECKS.filter((k) => !checks[k].pass).length;
  const verdict = misses === 0 ? 'adopt' : misses === 1 ? 'watch' : 'reject';
  return {
    module, ablation, checks, verdict, misses,
    highProb, fallback,
    counts: { triggered: graded.length, inSample: inSample.length, oos: oos.length, withLookup: withLookup.length },
    basePooled,
  };
}

/**
 * Full module calibration: baseline + one ablation (catalyst first, per
 * spec). The no-leakage check compares the two A/A+ OOS frequencies.
 */
export function calibrateModule({ module, candidates, tierRows, baseRates, params, ablatedTierRows = null, ablation = 'catalyst' }) {
  const baseline = evaluate({ module, candidates, tierRows, baseRates, params, ablation: null });
  if (!ablatedTierRows) {
    baseline.checks['no-leakage'] = {
      pass: false, evaluable: false,
      detail: `cannot evaluate: no ${ablation} ablation was run for this module`,
      value: null,
    };
    baseline.misses = CHECKS.filter((k) => !baseline.checks[k].pass).length;
    baseline.verdict = baseline.misses === 0 ? 'adopt' : baseline.misses === 1 ? 'watch' : 'reject';
    return { baseline, ablated: null };
  }
  const ablated = evaluate({ module, candidates, tierRows: ablatedTierRows, baseRates, params, ablation });
  // No-leakage: A/A+ OOS T1 freq moves < 15pp AND stays above base rate.
  const baseFreq = baseline.checks.ranking.value.a;
  const abFreq = ablated.checks.ranking.value.a;
  const direction = module.endsWith('S') ? 'short' : 'long';
  const baseRate = baseRates.pooled[direction]?.[10]?.[5]?.p;
  if (baseFreq.cases >= 100 && abFreq.cases >= 100 && baseRate != null) {
    const move = abFreq.freq - baseFreq.freq;
    const pass = Math.abs(move) < 0.15 && abFreq.freq > baseRate;
    baseline.checks['no-leakage'] = {
      pass,
      detail: `${ablation} ablation: A/A+ OOS T1 frequency ${(100 * baseFreq.freq).toFixed(1)}% → ${(100 * abFreq.freq).toFixed(1)}% (move ${(100 * move).toFixed(1)}pp; gate < 15pp) and ablated frequency ${(100 * abFreq.freq).toFixed(1)}% vs base rate ${(100 * baseRate).toFixed(1)}%`,
      value: { base: baseFreq, ablated: abFreq, move, baseRate },
    };
  } else {
    baseline.checks['no-leakage'] = {
      pass: false, evaluable: false,
      detail: `cannot evaluate: A/A+ OOS cases baseline ${baseFreq.cases}, ablated ${abFreq.cases} (each needs ≥ 100)`,
      value: { base: baseFreq, ablated: abFreq, baseRate },
    };
  }
  baseline.misses = CHECKS.filter((k) => !baseline.checks[k].pass).length;
  baseline.verdict = baseline.misses === 0 ? 'adopt' : baseline.misses === 1 ? 'watch' : 'reject';
  return { baseline, ablated };
}
