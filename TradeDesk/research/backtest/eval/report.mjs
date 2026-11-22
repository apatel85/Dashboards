/**
 * eval/report.mjs — write per-module outputs, the final report, and
 * build the --publish rows (dry-run only; run.mjs refuses a live publish).
 *
 * Pure except for the file writes. The publish rows match
 * TradeDesk/supabase/01-cmo-schema.sql exactly:
 *   cmo_backtest_runs   (run_id PK; module; args; params_version; git_sha; summary)
 *   cmo_backtest_cases  (PK run_id/session_date/ticker/direction/setup;
 *                        10-session window view: hit_t1/t2/t3, sessions_to_t1)
 *   cmo_validation      (PK module/run_id; verdict; table_version;
 *                        oos_from/to; data_quality 'real' for daily bars)
 *   cmo_prob_tables     (PK table_version/kind/bucket_key/tier; the
 *                        10-session table — the schema has no window column)
 */
import fs from 'node:fs';
import path from 'node:path';
import { wilsonInterval } from '../../../pipeline/lib/cmo/index.mjs';
import { WINDOWS } from '../engine/prepare.mjs';
import { TIERS } from '../engine/scan.mjs';
import { CHECKS } from './calibrate.mjs';

const pct = (x, digits = 1) => (x == null ? '—' : `${(100 * x).toFixed(digits)}%`);
const num = (x, digits = 1) => (x == null ? '—' : Number(x).toFixed(digits));

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function casesCsv(candidates) {
  const head = [
    'ticker', 'date', 'setup', 'direction', 'score', 'grade', 'ablated_score', 'ablated_grade',
    'bucket_key', 'triggered', 'entry_date', 'entry_price',
    'tradeable', 'stop_dist_pct', 'position_pct', 'risk_pct', 'tier_r1', 'tier_r2', 'tier_r3', 'size_binding',
    'regime', 'regime_excluded',
    'in_sample', 'adr_pct', 'atr_distance', 'rs', 'rvol', 'group_rank_pct',
    'catalyst_surprise', 'catalyst_gap_pct', 'earnings_matched_date',
    ...WINDOWS.flatMap((w) => [`w${w}_hit1`, `w${w}_hit2`, `w${w}_hit3`, `w${w}_sessions_to_1`, `w${w}_best_move_pct`, `w${w}_worst_against_pct`, `w${w}_complete`]),
  ];
  const lines = [head.join(',')];
  for (const c of candidates) {
    const row = [
      c.ticker, c.date, c.setup, c.direction, c.score, c.grade,
      c.ablated?.score ?? '', c.ablated?.grade ?? '', c.bucketKey,
      c.triggered, c.entryDate ?? '', c.entryPrice ?? '',
      c.tradeable, c.stopDist ?? '', c.positionPct ?? '', c.riskPct ?? '',
      c.tierR1 ?? '', c.tierR2 ?? '', c.tierR3 ?? '', c.sizeBinding ?? '',
      c.regime ?? '', c.regimeExcluded,
      c.inSample, c.adrPct ?? '', c.atrDistance ?? '', c.rs ?? '', c.rvol ?? '',
      c.groupRankPct ?? '', c.catalystSurprise ?? '', c.catalystGapPct ?? '',
      c.earningsMatchedDate ?? '',
    ];
    for (const w of WINDOWS) {
      const o = c.outcomes[w];
      if (!o) row.push('', '', '', '', '', '', c.complete[w] ?? '');
      else row.push(o.hit1, o.hit2, o.hit3, o.sessionsTo1 ?? '', o.bestMovePct ?? '', o.worstAgainstPct ?? '', c.complete[w]);
    }
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

export function writeModuleOutputs(dir, module, runId, { candidates, tierRows, baseRates, evaluation, summaryMeta }) {
  fs.mkdirSync(dir, { recursive: true });
  const graded = candidates.filter((c) => c.setup === module);
  fs.writeFileSync(path.join(dir, 'cases.csv'), casesCsv(graded));
  fs.writeFileSync(path.join(dir, 'prob-tables.json'), JSON.stringify({
    module, runId, tiers: tierRows,
    baseRates: { pooled: baseRates.pooled, byBand: baseRates.byBand },
  }, null, 2));
  const summary = {
    runId, module,
    ...summaryMeta,
    verdict: evaluation.verdict,
    misses: evaluation.misses,
    checks: Object.fromEntries(Object.entries(evaluation.checks).map(([k, v]) => [k, { pass: v.pass, evaluable: v.evaluable !== false, detail: v.detail }])),
    highProbBuckets: evaluation.highProb,
    fallbackDistribution: evaluation.fallback,
    counts: evaluation.counts,
    baseRatePooledT1W10: evaluation.basePooled,
  };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  const lines = [];
  lines.push(`# Backtest — ${module} (${runId})`, '');
  lines.push(`**Verdict: ${evaluation.verdict.toUpperCase()}** — ${evaluation.misses} of ${CHECKS.length} checks missed.`, '');
  lines.push(`Triggered candidates: ${evaluation.counts.triggered} (in-sample ${evaluation.counts.inSample}, OOS ${evaluation.counts.oos}); ${evaluation.counts.withLookup} OOS cases have a bucket lookup.`, '');
  lines.push('## Checks (window 10, tier 1 unless stated)', '');
  for (const k of CHECKS) {
    const c = evaluation.checks[k];
    lines.push(`- **${k}**: ${c.pass ? 'PASS' : 'MISS'} — ${c.detail}`);
  }
  lines.push('', '## High-probability buckets (in-sample P ≥ 65%, CI low ≥ 50%, lift ≥ 1.3×)', '');
  if (!evaluation.highProb.length) lines.push('None.');
  for (const b of evaluation.highProb) {
    lines.push(`- \`${b.bucket}\` — P ${pct(b.p)} (CI ${pct(b.ciLow)}–${pct(b.ciHigh)}), ${b.cases} cases, lift ${num(b.lift, 2)}×, OOS ${b.oosCases} cases ${b.oosFreq != null ? `freq ${pct(b.oosFreq)}` : ''} → ${b.oosCheck}`);
  }
  lines.push('', '## Fallback distribution (OOS lookups)', '');
  lines.push(`\`${JSON.stringify(evaluation.fallback)}\` — full = exact bucket (setup|direction|grade|ADR|ATR); no-atr / no-adr drop one band; merged-grade pools A/A+; none = no level reached 100 in-sample cases.`, '');
  lines.push('## Data', '');
  lines.push(`Cache files and row counts are in summary.json. SEC facts: ${summaryMeta.secNote}. Minute data: ${summaryMeta.minuteNote}.`);
  fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n'));
  return summary;
}

/**
 * Build the four publish row sets for one module (10-session view).
 * `oos` is the module's OOS graded candidates (for oos_cases/oos_p).
 */
export function buildPublishRows(runId, module, evaluation, tierRows, baseRates, candidates, { paramsVersion, gitSha, oosFrom, oosTo, args }) {
  const direction = module.endsWith('S') ? 'short' : 'long';
  const runs = [{
    run_id: runId,
    module,
    args: args ?? {},
    params_version: paramsVersion,
    git_sha: gitSha ?? null,
    summary: {
      verdict: evaluation.verdict,
      misses: evaluation.misses,
      counts: evaluation.counts,
      checks: Object.fromEntries(Object.entries(evaluation.checks).map(([k, v]) => [k, v.pass])),
    },
  }];
  const graded = candidates.filter((c) =>
    c.setup === module && c.triggered && !c.regimeExcluded && c.complete[10]);
  const cases = graded.map((c) => ({
    run_id: runId,
    session_date: c.date,
    ticker: c.ticker,
    direction: c.direction,
    setup: c.setup,
    score: c.score,
    grade: c.grade,
    bucket_key: c.bucketKey,
    hit_t1: c.outcomes[10].hit1,
    hit_t2: c.outcomes[10].hit2,
    hit_t3: c.outcomes[10].hit3,
    sessions_to_t1: c.outcomes[10].sessionsTo1,
    worst_against_pct: c.outcomes[10].worstAgainstPct,
    in_sample: c.inSample,
  }));
  const validation = [{
    module,
    verdict: evaluation.verdict,
    run_id: runId,
    table_version: paramsVersion,
    oos_from: oosFrom,
    oos_to: oosTo,
    summary: {
      checks: Object.fromEntries(Object.entries(evaluation.checks).map(([k, v]) => [k, { pass: v.pass, detail: v.detail }])),
      highProbBuckets: evaluation.highProb,
      fallbackDistribution: evaluation.fallback,
    },
    data_quality: 'real',
  }];
  const probTables = [];
  const oos = graded.filter((c) => !c.inSample);
  for (let ti = 0; ti < TIERS.length; ti++) {
    const tier = TIERS[ti];
    for (const row of tierRows[tier][10]) {
      if (row.setup !== module) continue;
      const base = baseRates.byBand[direction]?.[row.adrBand]?.[10]?.[5]?.p ?? null;
      const lift = base > 0 ? row.p / base : null;
      const bucketKey = `${row.setup}|${row.direction}|${row.grade}|${row.adrBand}|${row.atrBand}`;
      const oosBucket = oos.filter((c) => c.bucketKey === bucketKey);
      const oosHits = oosBucket.filter((c) => c.outcomes[10][`hit${ti + 1}`]).length;
      let passed = null;
      if (oosBucket.length >= 20) {
        const { low, high } = wilsonInterval(oosHits, oosBucket.length, 1.645);
        passed = row.p >= low && row.p <= high;
      }
      probTables.push({
        table_version: paramsVersion,
        kind: 'stock',
        bucket_key: bucketKey,
        tier: ti + 1,
        cases: row.cases,
        hits: row.hits,
        p: row.p,
        ci_low: row.ciLow,
        ci_high: row.ciHigh,
        base_rate: base,
        lift,
        oos_cases: oosBucket.length,
        oos_p: oosBucket.length ? oosHits / oosBucket.length : null,
        passed,
      });
    }
  }
  return { runs, cases, validation, probTables };
}

/** Sizing economics (Rev 5) over graded candidates (triggered + regime-allowed).
 * Returns per-module medians plus a pooled row. Tier R < 1 means the tier
 * target pays less than the risk at the stop. */
export function sizingEconomics(candidates) {
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const one = (rows) => {
    const g = rows.filter((c) => c.triggered && !c.regimeExcluded);
    const pos = g.map((c) => c.positionPct).filter((x) => x != null);
    const risk = g.map((c) => c.riskPct).filter((x) => x != null);
    const r1 = g.map((c) => c.tierR1).filter((x) => x != null);
    const r2 = g.map((c) => c.tierR2).filter((x) => x != null);
    const r3 = g.map((c) => c.tierR3).filter((x) => x != null);
    return {
      n: g.length,
      medianPositionPct: median(pos),
      medianRiskPct: median(risk),
      medianTierR1: median(r1),
      medianTierR2: median(r2),
      medianTierR3: median(r3),
      tier3Below1R: r3.length ? r3.filter((x) => x < 1).length / r3.length : null,
      capBinds: g.length ? g.filter((c) => c.sizeBinding === 'single-max').length / g.length : null,
    };
  };
  const byModule = {};
  for (const m of [...new Set(candidates.map((c) => c.setup))]) {
    byModule[m] = one(candidates.filter((c) => c.setup === m));
  }
  return { byModule, pooled: one(candidates) };
}

/** FINAL_REPORT.md per spec §12's template (10 items). */
export function writeFinalReport(dir, runId, moduleResults, { from, to, split, paramsVersion, cacheAudit, dataNotes, sizing }) {
  const lines = [];
  lines.push(`# Scoring revamp — backtest final report (${runId})`, '');
  lines.push(`Window ${from} → ${to}; out-of-sample from ${split}; params \`${paramsVersion}\`.`, '');
  lines.push('## 1. Summary — verdicts', '');
  lines.push('| Module | Verdict | Triggered | In-sample | OOS | OOS with lookup |');
  lines.push('|---|---|---|---|---|---|');
  for (const [m, r] of Object.entries(moduleResults)) {
    lines.push(`| ${m} | **${r.verdict}** | ${r.counts.triggered} | ${r.counts.inSample} | ${r.counts.oos} | ${r.counts.withLookup} |`);
  }
  lines.push('', '## 2. Setup-by-setup findings', '');
  for (const [m, r] of Object.entries(moduleResults)) {
    lines.push(`### ${m} — ${r.verdict.toUpperCase()} (${r.misses} miss${r.misses === 1 ? '' : 'es'})`, '');
    for (const k of CHECKS) {
      const c = r.checks[k];
      lines.push(`- **${k}**: ${c.pass ? 'PASS' : 'MISS'} — ${c.detail}`);
    }
    lines.push('');
  }
  lines.push('## 3. P(5% / 10% / 15%) — in-sample vs out-of-sample', '');
  lines.push('Per-bucket tables are in each module\'s `prob-tables.json` (window 10 is the main view; windows 3/5/20 included). Pooled OOS calibration is check 2 above.', '');
  lines.push('## 4. Expected move', '');
  lines.push('Expected move per candidate = 5%×P(5–10%) + 10%×P(10–15%) + 15%×P(≥15%), tail beyond 15% counted as 15% (spec §3.1). It is a ranking input, not a price target; it is only computed where all three tier lookups succeed.', '');
  lines.push('## 5. High-probability buckets (≥ 65%)', '');
  for (const [m, r] of Object.entries(moduleResults)) {
    if (!r.highProb.length) { lines.push(`- ${m}: none.`); continue; }
    for (const b of r.highProb) lines.push(`- ${m} \`${b.bucket}\` — P ${pct(b.p)} (CI ${pct(b.ciLow)}–${pct(b.ciHigh)}), ${b.cases} cases, lift ${num(b.lift, 2)}×, OOS ${b.oosCheck} (${b.oosCases} cases)`);
  }
  lines.push('', '## 6. Ablation results', '');
  lines.push('Catalyst ablated first (spec order): each module was re-scored with the catalyst component zeroed; the no-leakage check (check 6) compares the A/A+ OOS T1 frequency before and after. Growth and options contribute 0 points in the baseline (no SEC facts, no option data), so their ablation is vacuous — recorded in DATA_AUDIT.md, not hidden.', '');
  lines.push('## 7. Data quality', '');
  lines.push('See `DATA_AUDIT.md`: coverage, gaps, survivorship share, hand-checked splits and earnings timestamps, cached files used with row counts, fallback distribution.', '');
  lines.push('', cacheAudit, '');
  lines.push('## 8. Verdicts', '');
  for (const [m, r] of Object.entries(moduleResults)) lines.push(`- **${m}: ${r.verdict}**`);
  lines.push('', '## 9. Recommendation', '');
  lines.push('Adopt only the modules whose verdict is `adopt`. A `watch` module needs one more check to pass (named in its report) before it can be adopted; a `reject` module is not adopted. No module ships into the nightly flow until its verdict is `adopt` and the staging acceptance script (03) passes — the publish step stays dry-run until then.', '');
  if (sizing) {
    const med = (x) => (x == null ? '—' : `${x.toFixed(2)}`);
    lines.push('## 10. Sizing economics (Rev 5 — not in the §12 template)', '');
    lines.push('Rev 5 (Ankit 2026-11-22): the 3% is the max loss per trade as a share of capital, enforced by position sizing — the technical stop stays at `invalidLevel` however far away it is. Population: graded candidates (triggered + regime-allowed). `positionPct` = % of capital; `riskPct` = % of capital lost if the stop is hit (≤ 3% by construction); tier R = tier move ÷ stop distance, so Tier 3 < 1R means the 15% target pays less than the risk. `cap binds` = share where the 20% single-position cap (not the 3% risk cap) sets the size.', '');
    lines.push('| Module | n | Median position | Median risk | Median Tier 1R | Median Tier 2R | Median Tier 3R | Tier 3 < 1R | Cap binds |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const [m, s] of Object.entries(sizing.byModule)) {
      lines.push(`| ${m} | ${s.n} | ${med(s.medianPositionPct)}% | ${med(s.medianRiskPct)}% | ${med(s.medianTierR1)}R | ${med(s.medianTierR2)}R | ${med(s.medianTierR3)}R | ${s.tier3Below1R == null ? '—' : pct(s.tier3Below1R)} | ${s.capBinds == null ? '—' : pct(s.capBinds)} |`);
    }
    const p = sizing.pooled;
    lines.push(`| **Pooled** | **${p.n}** | **${med(p.medianPositionPct)}%** | **${med(p.medianRiskPct)}%** | **${med(p.medianTierR1)}R** | **${med(p.medianTierR2)}R** | **${med(p.medianTierR3)}R** | **${p.tier3Below1R == null ? '—' : pct(p.tier3Below1R)}** | **${p.capBinds == null ? '—' : pct(p.capBinds)}** |`, '');
  }
  lines.push('## 11. Caveats', '');
  for (const n of dataNotes) lines.push(`- ${n}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FINAL_REPORT.md'), lines.join('\n'));
}
