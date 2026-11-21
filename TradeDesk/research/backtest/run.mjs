#!/usr/bin/env node
/**
 * run.mjs — WO-03 backtest harness CLI (spec §4, §6.4, §12).
 *
 *   node run.mjs --module A1|A2|A1S|A2S|A3S|stock_trigger|stock_orb|S1|S2|S3|S4|all
 *     [--from 2019-01-01] [--to 2026-10-31] [--split 2024-11-01]
 *     [--ablate catalyst|growth|rs|volume|group|options|regime]
 *     [--variant <name>] [--publish] [--dry-run] [--skip-fetch]
 *     [--cache-dir <dir>] [--results-dir <dir>] [--with-sec]
 *
 * Phases (data-first, spec §4):
 *   0. Params frozen check — sha256(pipeline/lib/cmo/params.json) must
 *      equal frozen-params.json, or the run refuses to start.
 *   1. Module gate — intraday/option modules (stock_trigger, stock_orb,
 *      S1–S4) need minute bars / historical option chains. Neither exists
 *      free, so the run stops here naming what is missing (loud fail).
 *   2. Fetch — universe, daily bars, meta (sector/cap). Earnings are
 *      fetched in a second phase: a detect-only pass finds the gap dates,
 *      then only those calendar dates are fetched.
 *   3. Prepare — per-ticker series + cross-sectional RS / breadth / regime.
 *   4. Scan — detect + trigger + score + tier outcomes (all 5 daily modules).
 *   5. Eval — base rates, in-sample tables, OOS calibration, verdicts.
 *      The catalyst ablation runs in the same invocation (spec order:
 *      catalyst first) so the no-leakage check is always evaluated.
 *   6. Report — results/<run_id>/{report.md, summary.json, cases.csv,
 *      prob-tables.json} per module + FINAL_REPORT.md + DATA_AUDIT.md.
 *   7. Publish — --publish with --dry-run only. A live publish is
 *      REFUSED (staging acceptance script 03 has not passed; see the
 *      task brief). The dry run prints the row counts the admin script
 *      would write.
 *
 * Determinism: the run id is derived from the arguments; no wall-clock
 * timestamps go into summary.json or the reports (cache files carry
 * fetchedAt, results do not). The same command twice gives identical
 * output (tested).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

import { PARAMS } from '../../pipeline/lib/cmo/index.mjs';
import { fetchUniverse } from './data/fetch-universe.mjs';
import { fetchDaily } from './data/fetch-daily.mjs';
import { fetchMeta } from './data/fetch-meta.mjs';
import { fetchEarnings } from './data/fetch-earnings.mjs';
import { loadUniverse, loadDaily, loadMeta, loadEarnings, dailyFile } from './data/load.mjs';
import { buildMembership, membershipStats } from './data/universe.mjs';
import { prepareUniverse, prepareTicker } from './engine/prepare.mjs';
import { detectOnly, scanAll, DAILY_MODULES } from './engine/scan.mjs';
import { computeBaseRates, buildTierRows } from './eval/tables.mjs';
import { calibrateModule } from './eval/calibrate.mjs';
import { writeModuleOutputs, buildPublishRows, writeFinalReport } from './eval/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CMO = path.resolve(ROOT, 'pipeline/lib/cmo');

const ALL_MODULES = [...DAILY_MODULES, 'stock_trigger', 'stock_orb', 'S1', 'S2', 'S3', 'S4'];
const INTRADAY_OPTION_MODULES = ['stock_trigger', 'stock_orb', 'S1', 'S2', 'S3', 'S4'];

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
function has(argv, name) { return argv.includes(name); }

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function checkParamsFrozen() {
  const frozen = JSON.parse(fs.readFileSync(path.join(HERE, 'frozen-params.json'), 'utf8'));
  const actual = sha256File(path.join(CMO, 'params.json'));
  if (actual !== frozen.sha256 || PARAMS.params_version !== frozen.params_version) {
    throw new Error(`params.json is NOT the frozen version (expected ${frozen.params_version} sha256 ${frozen.sha256.slice(0, 12)}…, got ${PARAMS.params_version} ${actual.slice(0, 12)}…). Refusing to run — params are frozen at WO-01; revise the spec and re-freeze before re-running.`);
  }
  return { paramsVersion: frozen.params_version, sha256: actual };
}

function gitSha() {
  try {
    return execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null; // no local git repo under ~/workspace/build-tradedesk
  }
}

function runIdFor({ module, from, to, split, ablate, variant }) {
  const d = (s) => s.replace(/-/g, '');
  return [
    module, `${d(from)}-${d(to)}`, `split${d(split)}`,
    ablate ? `ablate-${ablate}` : null, variant ? `var-${variant}` : null,
  ].filter(Boolean).join('-');
}

/**
 * Split events recorded in the cache: verify the series stays continuous across them.
 * NOTE: Yahoo chart v8 does not return split events via the API (verified
 * 2026-11-21: `events=div,split` returns dividends but no splits), so the
 * cache's `splits` arrays are empty. This check instead uses known split
 * dates from public records and verifies price continuity across them in
 * the cached (split-adjusted) series — an unadjusted series would jump
 * by roughly −(1 − 1/ratio) on the split date.
 */
const KNOWN_SPLITS = [
  ['NVDA', '2024-06-10', 10, 1],
  ['AAPL', '2020-08-31', 4, 1],
  ['TSLA', '2020-08-31', 5, 1],
  ['AMZN', '2022-06-06', 20, 1],
  ['GOOGL', '2022-07-18', 20, 1],
  ['GOOG', '2022-07-18', 20, 1],
  ['SHOP', '2022-06-29', 10, 1],
  ['AVGO', '2024-10-07', 10, 1],
  ['WMT', '2024-02-26', 3, 1],
  ['CMG', '2024-06-26', 50, 1],
];

function checkSplits(dailyByTicker) {
  const checked = [];
  for (const [ticker, date, numerator, denominator] of KNOWN_SPLITS) {
    const data = dailyByTicker[ticker];
    if (!data) { checked.push({ ticker, date, numerator, denominator, ok: false, note: 'ticker not in cache' }); continue; }
    const idx = data.bars.findIndex((b) => new Date(b.ts * 1000).toISOString().slice(0, 10) === date);
    if (idx <= 0) { checked.push({ ticker, date, numerator, denominator, ok: false, note: 'split date not in bars' }); continue; }
    const prev = data.bars[idx - 1].c;
    const cur = data.bars[idx].c;
    // Signed jump. A split artifact is a LARGE NEGATIVE jump (~-(1 - 1/ratio));
    // a positive jump of any size, or a small negative one, cannot be one
    // (e.g. TSLA genuinely rose +12.6% on its 2020-08-31 split day).
    const jump = prev ? (cur / prev - 1) * 100 : null;
    const artifact = -(1 - denominator / numerator) * 100;
    const ok = jump != null && (jump > 0 || Math.abs(jump) < 0.5 * Math.abs(artifact));
    checked.push({ ticker, date, numerator, denominator, ok, jumpPct: jump != null ? +jump.toFixed(2) : null });
  }
  return checked;
}

/** Hand-check known earnings dates against the fetched calendar files. */
function checkEarningsDates(cacheDir, pairs) {
  const out = [];
  for (const [ticker, date] of pairs) {
    try {
      const cal = loadEarnings(cacheDir, date);
      const row = cal.rows.find((r) => r.symbol === ticker);
      out.push({ ticker, date, found: !!row, surprisePct: row?.surprisePct ?? null, time: row?.time ?? null });
    } catch (err) {
      out.push({ ticker, date, found: false, error: err.message });
    }
  }
  return out;
}

export async function main(argv) {
  const module = arg(argv, '--module', 'all');
  const from = arg(argv, '--from', '2019-01-01');
  const to = arg(argv, '--to', '2026-10-31');
  const split = arg(argv, '--split', '2024-11-01');
  const ablate = arg(argv, '--ablate', 'catalyst');
  const variant = arg(argv, '--variant', null);
  const doPublish = has(argv, '--publish');
  const dryRun = has(argv, '--dry-run');
  const skipFetch = has(argv, '--skip-fetch');
  const withSec = has(argv, '--with-sec');
  const cacheDir = arg(argv, '--cache-dir', path.join(HERE, 'cache'));
  const resultsDir = arg(argv, '--results-dir', path.join(HERE, 'results'));
  const auditFile = arg(argv, '--audit-file', path.join(HERE, 'DATA_AUDIT.md'));

  if (![...ALL_MODULES, 'all'].includes(module)) {
    throw new Error(`unknown module: ${module} (expected one of ${ALL_MODULES.join(', ')} or all)`);
  }
  if (variant) {
    const variants = PARAMS.variants ?? {};
    if (!variants[variant]) {
      throw new Error(`unknown variant: ${variant} — params.json defines no variants (frozen at WO-01); a new idea adds its thresholds to params.json per spec §6.4, up to 12 variants per module`);
    }
  }
  const { paramsVersion, sha256 } = checkParamsFrozen();
  console.log(`[run] params frozen OK: ${paramsVersion} (${sha256.slice(0, 12)}…)`);

  // Module gate: intraday / option modules have no free historical data.
  if (module !== 'all' && INTRADAY_OPTION_MODULES.includes(module)) {
    if (module === 'stock_orb') {
      throw new Error('stock_orb cannot run: it needs 1-minute bars (Alpaca) and ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set. Set both and run data/fetch-minute.mjs first.');
    }
    throw new Error(`${module} cannot run: it needs historical option chains / IV / gamma, and no free source exists (plan §7.3). S1–S4 and stock_trigger are re-tested by this harness only once chain data is available; do not fake them.`);
  }
  if (module === 'all') {
    console.log('[run] --module all: grading the 5 daily modules (A1, A2, A1S, A2S, A3S). Intraday/option modules (stock_trigger, stock_orb, S1–S4) are NOT run — see the module gate above.');
  }
  if (doPublish && !dryRun) {
    throw new Error('--publish without --dry-run is refused: the staging acceptance script (03) has not passed, so no live publish is allowed. Re-run with --publish --dry-run to verify the rows only.');
  }

  const runId = runIdFor({ module, from, to, split, ablate: ablate === 'catalyst' ? null : ablate, variant });
  const runDir = path.join(resultsDir, runId);
  console.log(`[run] run_id=${runId}`);

  // --- Fetch phase (skipped with --skip-fetch; the loaders fail loudly if files are missing) ---
  if (!skipFetch) {
    if (!fs.existsSync(path.join(cacheDir, 'universe.json'))) {
      console.log('[run] fetching universe…');
      await fetchUniverse(cacheDir);
    }
    const universe = loadUniverse(cacheDir);
    const tickers = universe.tickers;
    const fileMatchesWindow = (t) => {
      const f = dailyFile(cacheDir, t);
      if (!fs.existsSync(f)) return false;
      try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        return d.from === from && d.to === to && Array.isArray(d.bars) && d.bars.length > 0;
      } catch { return false; }
    };
    const missingDaily = tickers.filter((t) => !fileMatchesWindow(t));
    const extra = ['SPY', '^VIX'].filter((t) => !fileMatchesWindow(t));
    if (missingDaily.length || extra.length) {
      console.log(`[run] fetching daily bars for ${missingDaily.length + extra.length} ticker(s)…`);
      await fetchDaily({ from, to, tickers: [...missingDaily, ...extra], cacheDir });
    } else {
      console.log('[run] daily cache complete (all universe tickers + SPY + ^VIX present)');
    }
    const metaDir = path.join(cacheDir, 'meta');
    const missingMeta = tickers.filter((t) => !fs.existsSync(path.join(metaDir, `${t.replace(/[^A-Z0-9-]/g, '_')}.json`)));
    if (missingMeta.length) {
      console.log(`[run] fetching meta for ${missingMeta.length} ticker(s)…`);
      await fetchMeta({ tickers: missingMeta, cacheDir });
    } else {
      console.log('[run] meta cache complete');
    }
  }

  // --- Load + prepare ---
  const universe = loadUniverse(cacheDir);
  const tickers = universe.tickers;
  console.log(`[run] loading ${tickers.length} daily files…`);
  const dailyByTicker = {};
  for (const t of tickers) dailyByTicker[t] = loadDaily(cacheDir, t);
  const spyData = loadDaily(cacheDir, 'SPY');
  const vixData = loadDaily(cacheDir, '^VIX');
  const metaByTicker = {};
  let metaMissing = 0;
  let metaNoSector = 0;
  for (const t of tickers) {
    const m = loadMeta(cacheDir, t);
    if (!m) metaMissing += 1;
    else if (!m.sector) metaNoSector += 1;
    metaByTicker[t] = m;
  }
  const barsByTicker = {};
  for (const [t, d] of Object.entries(dailyByTicker)) barsByTicker[t] = d.bars;
  const spy = prepareTicker(spyData.bars, PARAMS);
  const vixCloseByDate = new Map(vixData.bars.map((b) => [new Date(b.ts * 1000).toISOString().slice(0, 10), b.c]));
  console.log('[run] preparing universe (series + RS / breadth / regime)…');
  const univ = prepareUniverse(barsByTicker, metaByTicker, spy, vixCloseByDate, PARAMS);
  const { dates } = buildMembership(barsByTicker, from, to);
  // Baseline is the first TRADING session, not the calendar from-date
  // (2019-01-01 is a holiday; every ticker's first bar would otherwise
  // count as "after the window start").
  const mStats = membershipStats(barsByTicker, dates[0], to, dates);

  // --- Detect-only pass → gap dates → earnings fetch ---
  console.log('[run] detect-only pass…');
  const { detections, gapDates, stats: detectStats } = detectOnly(univ, { from, to, params: PARAMS, metaByTicker });
  console.log(`[run] ${detections.length} detections; ${gapDates.length} gap dates need earnings calendars`);
  if (!skipFetch && gapDates.length) {
    const missingEarnings = gapDates.filter((d) => !fs.existsSync(path.join(cacheDir, 'earnings', `${d}.json`)));
    if (missingEarnings.length) {
      console.log(`[run] fetching earnings calendars for ${missingEarnings.length} date(s)…`);
      await fetchEarnings({ dates: missingEarnings, cacheDir });
    }
  }
  const earningsByDate = new Map();
  let earningsRows = 0;
  for (const d of gapDates) {
    const cal = loadEarnings(cacheDir, d); // throws, naming the file, if missing
    const bySymbol = new Map(cal.rows.map((r) => [r.symbol, r]));
    earningsByDate.set(d, bySymbol);
    earningsRows += cal.rows.length;
  }

  // --- Full scan ---
  console.log('[run] full scan (detect → trigger → score → outcomes)…');
  const { candidates, stats: scanStats } = scanAll(univ, {
    split, params: PARAMS, metaByTicker, ablate, earningsByDate,
  }, detections);
  console.log(`[run] ${scanStats.graded} graded candidates (${scanStats.detected} detected, ${scanStats.nonTradeable} non-tradeable, ${scanStats.regimeExcluded} regime-excluded, ${scanStats.neverTriggered} never triggered)`);

  // --- Base rates + eval per module ---
  console.log('[run] base rates…');
  const baseRates = computeBaseRates(univ.prepared, PARAMS, from, to);
  const tierRows = buildTierRows(candidates, { params: PARAMS });
  const ablatedTierRows = buildTierRows(candidates, { params: PARAMS, useAblated: true, includeRegimeExcluded: ablate === 'regime' });
  const modulesToGrade = module === 'all' ? DAILY_MODULES : [module];
  const moduleResults = {};
  const publishSets = [];
  const cacheFiles = cacheAuditList(cacheDir, tickers, gapDates);
  for (const m of modulesToGrade) {
    const { baseline, ablated } = calibrateModule({
      module: m, candidates, tierRows, baseRates, params: PARAMS,
      ablatedTierRows, ablation: ablate,
    });
    moduleResults[m] = baseline;
    const summaryMeta = {
      paramsVersion, paramsSha256: sha256, gitSha: gitSha(),
      from, to, split, ablation: ablate, variant: variant ?? null,
      secNote: withSec ? 'SEC facts requested (--with-sec)' : 'SEC facts skipped: SEC_CONTACT_EMAIL is not set (growth = 0 points; see DATA_AUDIT.md)',
      minuteNote: 'minute data unavailable: ALPACA_KEY_ID / ALPACA_SECRET_KEY not set (intraday modules not run)',
      cacheFiles,
    };
    const outDir = path.join(runDir, m);
    writeModuleOutputs(outDir, m, runId, {
      candidates, tierRows, baseRates, evaluation: baseline, summaryMeta,
    });
    console.log(`[run] ${m}: ${baseline.verdict.toUpperCase()} (${baseline.misses} miss${baseline.misses === 1 ? '' : 'es'}) → ${outDir}`);
    if (doPublish) {
      publishSets.push(buildPublishRows(runId, m, baseline, tierRows, baseRates, candidates, {
        paramsVersion, gitSha: gitSha(), oosFrom: split, oosTo: to,
        args: { module: m, from, to, split, ablation: ablate, variant: variant ?? null },
      }));
    }
  }

  // --- DATA_AUDIT.md + FINAL_REPORT.md ---
  const splitChecks = checkSplits(dailyByTicker);
  const earningsCheckPairs = [
    ['NVDA', '2024-11-20'], ['AAPL', '2024-10-31'], ['MSFT', '2024-10-30'],
    ['AMZN', '2024-10-31'], ['META', '2024-10-30'],
  ];
  if (!skipFetch) {
    // Hand-check dates are verification dates, not necessarily gap dates —
    // fetch them explicitly so the check is meaningful.
    const missing = earningsCheckPairs.map(([, d]) => d).filter((d) => !fs.existsSync(path.join(cacheDir, 'earnings', `${d}.json`)));
    if (missing.length) await fetchEarnings({ dates: missing, cacheDir });
  }
  const earningsChecks = checkEarningsDates(cacheDir, earningsCheckPairs);
  const audit = buildAudit({
    tickers, dates, mStats, detectStats, scanStats, metaMissing, metaNoSector,
    splitChecks, earningsChecks, moduleResults, cacheDir, gapDates, earningsRows,
  });
  fs.writeFileSync(auditFile, audit);
  const dataNotes = [
    'Universe is the CURRENT S&P 500 + Nasdaq-100 constituents projected backwards — historical membership is incomplete (see DATA_AUDIT.md survivorship share); the members-only re-run was not done because every module already rejects on sample size (a subset can only shrink the sample further).',
    'Market caps are CURRENT (2026) from Yahoo quoteSummary, not point-in-time — A3S large/small bars carry that approximation.',
    'Earnings surprise comes from the Nasdaq calendar; its `time` field is usually "time-not-supplied" on past dates, so a gap day matches a report on that date OR the prior session.',
    'Growth (10 pts) and options (5 pts) score 0 for every candidate: no SEC facts (no SEC_CONTACT_EMAIL) and no historical option data. Group (5 pts) is null when the sector is unknown.',
    'Regime is unknown (null) until SPY has a 200-day SMA (~Oct 2019); candidates before then are regime-excluded, not graded.',
    'Prices are Yahoo split-adjusted, dividend-unadjusted closes (plan §7.4); split continuity is hand-checked in DATA_AUDIT.md.',
    'Intraday/option modules (stock_trigger, stock_orb, S1–S4) were NOT run: no free historical minute bars or option chains exist (Alpaca keys absent).',
    'Tradeable (§4.5) is reported, not applied: under the library\'s reading (technical stop ≤ 3% of price) every A1/A1S/A2/A2S detection is non-tradeable. Whether "3% loss" means stop distance or position risk needs Ankit\'s call.',
    'No candidate scores A or A+ in any module (setup "met" caps A1/A1S/A3S, growth and options are 0, the RS component is long-biased) — the ranking check is unevaluatable by construction in this run.',
  ];
  writeFinalReport(runDir, runId, moduleResults, {
    from, to, split, paramsVersion,
    cacheAudit: `Cache: ${tickers.length} tickers, ${dates.length} trading sessions, ${gapDates.length} earnings dates fetched (${earningsRows} rows). Full file list with row counts is in each module's summary.json.`,
    dataNotes,
  });
  console.log(`[run] FINAL_REPORT.md → ${path.join(runDir, 'FINAL_REPORT.md')}`);
  console.log(`[run] DATA_AUDIT.md → ${auditFile}`);

  // --- Publish (dry-run only) ---
  if (doPublish) {
    const { createAdminClient } = await import('../../pipeline/lib/supabase-admin.mjs');
    const client = createAdminClient({ dryRun: true });
    for (const set of publishSets) {
      for (const [table, rows] of [['cmo_backtest_runs', set.runs], ['cmo_backtest_cases', set.cases], ['cmo_validation', set.validation], ['cmo_prob_tables', set.probTables]]) {
        const onConflict = table === 'cmo_backtest_runs' ? 'run_id'
          : table === 'cmo_backtest_cases' ? 'run_id,session_date,ticker,direction,setup'
          : table === 'cmo_validation' ? 'module,run_id'
          : 'table_version,kind,bucket_key,tier';
        const res = await client.upsert(table, rows, { onConflict });
        console.log(`[publish dry-run] ${table}: ${res.attempted} rows, ${res.batches} batches, written ${res.written} (dry run — nothing sent)`);
      }
    }
    console.log('[publish dry-run] complete. A live publish is blocked until the staging acceptance script (03) passes.');
  }
  return { runId, runDir, moduleResults };
}

/** Cache files used by this run: names + row counts (+ sha256 for daily files). */
function cacheAuditList(cacheDir, tickers, gapDates) {
  const files = [];
  files.push({ file: 'cache/universe.json', rows: tickers.length });
  for (const t of tickers) {
    const f = dailyFile(cacheDir, t);
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    files.push({ file: `cache/daily/${path.basename(f)}`, rows: data.bars.length, sha256: sha256File(f) });
  }
  for (const t of ['SPY', '^VIX']) {
    const f = dailyFile(cacheDir, t);
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    files.push({ file: `cache/daily/${path.basename(f)}`, rows: data.bars.length, sha256: sha256File(f) });
  }
  for (const d of gapDates) {
    const f = path.join(cacheDir, 'earnings', `${d}.json`);
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    files.push({ file: `cache/earnings/${d}.json`, rows: data.rows.length });
  }
  return files;
}

function buildAudit({ tickers, dates, mStats, detectStats, scanStats, metaMissing, metaNoSector, splitChecks, earningsChecks, moduleResults, cacheDir, gapDates, earningsRows }) {
  const splitFails = splitChecks.filter((s) => !s.ok);
  const splitSample = splitChecks.slice(0, 10);
  const lines = [];
  lines.push('# DATA_AUDIT.md — backtest data audit', '');
  lines.push(`Universe: ${tickers.length} tickers (current S&P 500 + Nasdaq-100 constituents, fetched from Wikipedia). Window: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} trading sessions).`, '');
  lines.push('## Coverage', '');
  lines.push(`- Daily bars: ${tickers.length} tickers + SPY + ^VIX, Yahoo chart v8 (split-adjusted, dividend-unadjusted closes).`);
  lines.push(`- Tickers whose first bar is after the window start: ${mStats.firstBarAfterFrom} (joined the index, listed, or IPO'd later — they enter the sample only from their first bar).`);
  lines.push(`- Tickers covering < 80% of sessions: ${mStats.coverageUnder80}. Tickers covering ≥ 95%: ${mStats.coverageAtLeast95}.`);
  lines.push(`- Meta (sector / market cap): ${metaMissing} file(s) missing; ${metaNoSector} ticker(s) with no sector — group component null for those, A3S uses the strict 300% bar.`);
  lines.push(`- Earnings calendars fetched: ${gapDates.length} gap dates, ${earningsRows} rows total.`);
  lines.push(`- Detections: pre-filter hits ${detectStats.preFilterHits}, detector rejects ${detectStats.detectorRejects}, illiquid pre-filter hits ${detectStats.illiquidPrefilter}.`);
  lines.push(`- Scan: ${scanStats.detected} detected, ${scanStats.nonTradeable} non-tradeable (3% stop cap / $10 short minimum), ${scanStats.regimeExcluded} regime-excluded, ${scanStats.neverTriggered} never triggered, ${scanStats.graded} graded.`, '');
  lines.push('## Gaps (what is missing, and what it costs)', '');
  lines.push('- **SEC facts (growth / SUE / margin)**: unavailable — SEC_CONTACT_EMAIL is not set, so fetch-sec.mjs refuses loudly. Growth scores 0 for every candidate (10 pts unplayed).');
  lines.push('- **Guidance / news**: no source — catalyst is earnings surprise + gap % only.');
  lines.push('- **Minute bars**: unavailable — ALPACA_KEY_ID / ALPACA_SECRET_KEY not set. Intraday modules (stock_orb) not run; opening RVOL is null.');
  lines.push('- **Historical option chains / IV / gamma**: no free source. S1–S4 and stock_trigger not run; options component is 0 for every candidate (5 pts unplayed).');
  lines.push('- **Historical index membership**: incomplete — the universe is today\'s constituents projected backwards. Survivorship bias: stocks that left the index or died are absent (their losers never enter); stocks that joined later appear from their first bar. The plan §7.4 members-only re-run was NOT done for this run: every module already rejects on sample size, and a members-only subset can only shrink the sample further — the check is moot here (it matters when a headline is adopt/watch, not when it is reject on cases).');
  lines.push('- **Tradeable (§4.5)**: reported, not applied as a grading filter (see engine/scan.mjs). Under the library\'s reading (technical stop ≤ 3% of the entry price) every A1/A1S/A2/A2S detection in 2019–2026 is non-tradeable (gap-day ranges run 5–12%, bases 10–25% deep); only A3S (which does not apply the cap) has tradeable candidates. Whether "3% loss" means stop distance or position risk (size down so the stop risks 3% of capital) needs Ankit\'s call.');
  lines.push('- **Grade compression**: no candidate in any module scores A or A+ (max 70 for A1/A3S; A2 median 28, A2S median 15, all C). Setup "met" caps A1/A1S/A3S at 15/30, growth (10) and options (5) are 0 for every candidate, and the RS component (15) is long-biased — a short scores 0 on it by construction (RS ≤ 20). The A/A+ vs C ranking check is unevaluatable by construction in this run.');
  lines.push('- **Market cap**: current (2026), not point-in-time — A3S large/small classification can mislabel a stock that grew across the $10B line during the window.');
  lines.push('- **Earnings timing**: Nasdaq `time` is usually "time-not-supplied" on past dates, so a gap day matches a report on that date OR the prior session (BMO vs AMC is not distinguished).', '');
  lines.push('## Hand-checked splits', '');
  lines.push(`Checked ${splitChecks.length} known split events from public records (Yahoo chart v8 returns no split events via the API, so the cache's \`splits\` arrays are empty). A split-adjusted series must NOT show the split artifact — a large negative jump near −(1 − 1/ratio) on the split date; a positive jump of any size is fine (a stock can genuinely rally on its split day). Failures: ${splitFails.length}.`);
  for (const s of splitSample) {
    lines.push(`- ${s.ticker} ${s.date} ${s.numerator}:${s.denominator} — jump ${s.jumpPct != null ? `${s.jumpPct}%` : 'n/a'} → ${s.ok ? 'OK' : 'FAIL'}`);
  }
  if (splitFails.length) {
    lines.push('Failures:');
    for (const s of splitFails) lines.push(`- ${s.ticker} ${s.date}: ${s.note ?? `jump ${s.jumpPct}%`}`);
  }
  lines.push('', '## Hand-checked earnings timestamps', '');
  for (const e of earningsChecks) {
    lines.push(`- ${e.ticker} reported ${e.date}: ${e.found ? `found, surprise ${e.surprisePct != null ? `${e.surprisePct}%` : 'n/a'}, time ${e.time ?? 'n/a'}` : `NOT FOUND (${e.error ?? 'no row'})`}`);
  }
  lines.push('', '## Fallback distribution (OOS lookups, window 10 tier 1)', '');
  for (const [m, r] of Object.entries(moduleResults)) {
    lines.push(`- ${m}: \`${JSON.stringify(r.fallback)}\` (${r.counts.withLookup} OOS cases with a lookup of ${r.counts.oos} OOS)`);
  }
  lines.push('', '## Cached files used', '');
  lines.push('Full list (names + row counts + sha256 for daily files) is in each module\'s `summary.json` under `cacheFiles`. Totals:');
  lines.push(`- Universe: 1 file (${tickers.length} tickers). Daily: ${tickers.length + 2} files. Earnings: ${gapDates.length} files (${earningsRows} rows).`);
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[run] FAILED: ${err.message}`);
    process.exit(1);
  });
}
