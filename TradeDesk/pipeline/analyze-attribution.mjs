#!/usr/bin/env node
/**
 * analyze-attribution.mjs — the feedback loop.
 *
 * Reads public/data/performance.json (which snapshots WHY each idea was
 * picked in `reasons`), then for ideas old enough to judge:
 *   1. Splits winners vs losers.
 *   2. Correlates outcomes with the selection reasons
 *      (congress buys, insider clusters, unusual options, trend template,
 *      sentiment, stage, quality flags, score).
 *   3. Checks p_up calibration: do ideas scored 70 actually win ~70%?
 *   4. Writes public/data/attribution.json with the findings + concrete
 *      tuning suggestions (as proposals — never auto-applied).
 *   5. Appends a dated entry to public/data/attribution-log.md.
 *
 * Run weekly (or as a non-fatal refresh.sh step — it no-ops until ideas
 * are old enough to judge). $0, keyless, no network calls.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');

// Minimum holding days before an idea is judged (matches p_up's 30-day window).
const MIN_HOLD_DAYS = 30;
const now = Date.now();
const daysHeld = (iso) => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / 86400000 : 0;
};

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** Feature extractors: name -> (reasons) => true/false. */
const FEATURES = {
  congress_buys_any: (r) => (r?.congress_buys ?? 0) > 0,
  congress_buys_2plus: (r) => (r?.congress_buys ?? 0) >= 2,
  insider_clusters: (r) => (r?.insider_clusters ?? 0) > 0,
  unusual_options: (r) => !!r?.unusual_options,
  trend_template_pass: (r) => r?.trend_template_pass === true,
  sentiment_positive: (r) => {
    const s = r?.sentiment;
    if (typeof s === 'string') return /positiv|bullish/i.test(s);
    if (s && typeof s === 'object') return /positiv|bullish/i.test(JSON.stringify(s));
    return false;
  },
  stage_2: (r) => /stage.?2/i.test(String(r?.stage || '')),
  clean_quality: (r) => !r?.quality_flags || (Array.isArray(r.quality_flags) && r.quality_flags.length === 0),
  high_score: (r, item) => (item?.score ?? 0) >= 70,
};

function summarize(list) {
  const n = list.length;
  if (!n) return { n: 0, win_rate: null, avg_pct: null };
  const wins = list.filter((i) => (i.pct_change ?? 0) > 0).length;
  const avg = list.reduce((s, i) => s + (i.pct_change ?? 0), 0) / n;
  return { n, win_rate: r1((wins / n) * 100), avg_pct: r1(avg) };
}

function main() {
  const perf = readJson('performance.json');
  const items = perf?.items || [];
  const judged = items.filter(
    (i) => i.pct_change != null && daysHeld(i.recommended_at) >= MIN_HOLD_DAYS
  );
  const pending = items.length - judged.length;

  const out = {
    as_of: new Date().toISOString(),
    min_hold_days: MIN_HOLD_DAYS,
    judged_count: judged.length,
    pending_count: pending,
    overall: summarize(judged),
    features: {},
    p_up_calibration: [],
    tuning_suggestions: [],
  };

  if (!judged.length) {
    console.log(`[attribution] no ideas old enough to judge yet (${items.length} tracked, ${pending} pending)`);
  } else {
    // Per-feature: with vs without.
    for (const [fname, fn] of Object.entries(FEATURES)) {
      const withF = judged.filter((i) => { try { return fn(i.reasons, i); } catch { return false; } });
      const withoutF = judged.filter((i) => { try { return !fn(i.reasons, i); } catch { return true; } });
      const sWith = summarize(withF);
      const sWithout = summarize(withoutF);
      const lift = sWith.win_rate != null && sWithout.win_rate != null
        ? r1(sWith.win_rate - sWithout.win_rate) : null;
      out.features[fname] = { with: sWith, without: sWithout, win_rate_lift_pts: lift };

      // Suggest tuning when the signal is consistent and sampled enough.
      if (sWith.n >= 5 && sWithout.n >= 5 && lift != null) {
        if (lift >= 15) {
          out.tuning_suggestions.push(
            `UPWEIGHT candidate: "${fname}" — win rate ${sWith.win_rate}% with vs ${sWithout.win_rate}% without ` +
            `(+${lift} pts, n=${sWith.n}/${sWithout.n}). Consider raising its weight in selection/scoring.`
          );
        } else if (lift <= -15) {
          out.tuning_suggestions.push(
            `DOWNWEIGHT candidate: "${fname}" — win rate ${sWith.win_rate}% with vs ${sWithout.win_rate}% without ` +
            `(${lift} pts, n=${sWith.n}/${sWithout.n}). Consider lowering its weight or requiring confirmation.`
          );
        }
      }
    }

    // p_up calibration buckets.
    const buckets = [[50, 60], [60, 70], [70, 80], [80, 100]];
    for (const [lo, hi] of buckets) {
      const inB = judged.filter((i) => (i.p_up ?? 0) >= lo && (i.p_up ?? 0) < hi);
      if (!inB.length) continue;
      const s = summarize(inB);
      out.p_up_calibration.push({
        predicted_range: `${lo}-${hi}%`,
        n: s.n,
        actual_win_rate: s.win_rate,
        avg_pct: s.avg_pct,
        miscalibration_pts: s.win_rate != null ? r1(s.win_rate - (lo + hi) / 2) : null,
      });
    }
    const mis = out.p_up_calibration.filter((b) => b.miscalibration_pts != null && b.n >= 5);
    if (mis.length) {
      const avgMis = mis.reduce((s, b) => s + b.miscalibration_pts, 0) / mis.length;
      if (avgMis <= -15) {
        out.tuning_suggestions.push(
          `p_up looks OVERCONFIDENT by ~${Math.abs(r1(avgMis))} pts — consider tempering high scores or recalibrating the PM prompt.`
        );
      } else if (avgMis >= 15) {
        out.tuning_suggestions.push(
          `p_up looks UNDERCONFIDENT by ~${r1(avgMis)} pts — the agent may be leaving edge on the table.`
        );
      }
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'attribution.json'), JSON.stringify(out, null, 1));

  // Append dated log entry.
  const logPath = join(OUT_DIR, 'attribution-log.md');
  if (!existsSync(logPath)) {
    writeFileSync(logPath, '# Attribution Log\n\nDated entries from the weekly attribution analyzer. Newest first.\n');
  }
  const lines = [
    `\n## ${out.as_of.slice(0, 10)}`,
    `Judged: ${out.judged_count} ideas (≥${MIN_HOLD_DAYS}d hold) · Pending: ${out.pending_count}`,
    out.judged_count
      ? `Overall: ${out.overall.win_rate}% win rate, avg ${out.overall.avg_pct}% (n=${out.overall.n})`
      : 'Not enough history yet.',
  ];
  for (const [fname, f] of Object.entries(out.features)) {
    lines.push(`- ${fname}: with ${f.with.win_rate}% (n=${f.with.n}) vs without ${f.without.win_rate}% (n=${f.without.n}) → lift ${f.win_rate_lift_pts ?? 'n/a'} pts`);
  }
  if (out.p_up_calibration.length) {
    lines.push('p_up calibration:');
    for (const b of out.p_up_calibration) {
      lines.push(`  - predicted ${b.predicted_range}: actual ${b.actual_win_rate}% (n=${b.n}, miscal ${b.miscalibration_pts ?? 'n/a'} pts)`);
    }
  }
  if (out.tuning_suggestions.length) {
    lines.push('Tuning suggestions (proposals — not applied):');
    for (const s of out.tuning_suggestions) lines.push(`  - ${s}`);
  }
  appendFileSync(logPath, lines.join('\n') + '\n');
  console.log(`[attribution] judged=${out.judged_count} pending=${pending} suggestions=${out.tuning_suggestions.length}`);
}

main();
