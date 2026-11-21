/**
 * engine/scan.mjs — detect + trigger + score + tier outcomes, pure.
 *
 * One pass over the cached bars runs all five daily detectors (A1, A2,
 * A1S, A2S, A3S). Pure: the caller passes in prepared series, earnings
 * maps and params; nothing here touches fs, network or the clock.
 *
 * Detection rules (the library detectors are the authority; the scan only
 * applies cheap necessary-condition pre-filters so the expensive detectors
 * are not called on every session — a pre-filter can only ADD candidates
 * the detector then rejects, never remove ones it would accept):
 *   A1  : gap ≥ 10% (params.a1.gapMinPct)
 *   A1S : gap ≤ −10%
 *   A2  : index ≥ 252, close > 50 > 150 > 200 SMA, 200-day rising,
 *         within 25% of the 252-day high, ≥ 30% above the 252-day low,
 *         RS ≥ 80, prior-move max ≥ 30%
 *   A2S : index ≥ 252, close < 50 < 150 < 200 SMA, RS ≤ 20,
 *         10/20-day EMA falling over 5 sessions
 *   A3S : rise over 5 sessions ≥ the market-cap bar (50% large / 300%
 *         small, null cap → strict 300%) and ≥ 3 consecutive up days
 * The liquidity filter (plan §4.2) is applied at detection: a pattern on
 * an illiquid session is counted and skipped, never graded.
 *
 * Trigger (§8.3): the first session within 5 after detection where the
 * price trades through the pivot (high ≥ pivot long, low ≤ pivot short).
 * Entry price = the pivot. No trigger in 5 sessions → never_triggered
 * (recorded, excluded from tier stats).
 *
 * Scoring (§5): tradeScore from the library. Component availability in
 * this harness (see README + DATA_AUDIT.md):
 *   setupQuality: A1/A1S/A3S 'met'; A2/A2S 'full' iff base ≥ 15 sessions
 *     AND close above the 10-day EMA (the plan's "contraction ≤ 50%" is
 *     undefined, so this harness defines 'full' as base ≥ 15 + surfing
 *     the 10-day EMA), else 'met'.
 *   catalyst: earnings surprise from the Nasdaq calendar (gap date or the
 *     prior session — the calendar's `time` field is usually
 *     "time-not-supplied" on past dates) + the gap %; guidance/news
 *     unavailable (null).
 *   growth: null (SEC facts unavailable — no SEC_CONTACT_EMAIL).
 *   rs: universe RS percentile; RS-line new high via the library on SPY
 *     bars ALIGNED to the stock's own dates.
 *   volume: 50-day RVOL; opening RVOL null (no minute data).
 *   group: percentile of the stock's sector median RS across sectors;
 *     null when the sector is unknown.
 *   options: null (no historical option data).
 * Regime (§6.3) is a GATE, not points: a candidate in a disallowed
 * direction is kept with regimeExcluded = true and excluded from the
 * baseline grading (it is re-included by the regime ablation).
 *
 * Tradeable (§4.5) is NOT a grading filter — it is reported, not
 * applied. The library's `tradeable` reads the 3% rule as "the
 * technical stop must be ≤ 3% of the entry price". Measured on real
 * data that vetoes EVERY A1/A1S/A2/A2S detection in 2019–2026 (the
 * gap-day range alone is typically 5–12%; a base is 10–25% deep), so
 * grading tradeable-only would leave 16 candidates and answer nothing.
 * The backtest grades every detection — it judges whether the SETUP
 * predicts the move — and reports the tradeable share per module as a
 * headline finding. Whether "3% loss" means stop-distance ≤ 3% of
 * price (the library's reading) or risk ≤ 3% of capital via position
 * sizing (the stop can be 10–20% away; you size down) is the single
 * biggest open question from the first run, and needs Ankit's call.
 * A3S does not apply the cap in the library (only the $10 minimum), so
 * its tradeable share is 100%.
 *
 * Re-detection of the same setup+direction on the same ticker is
 * suppressed until the earliest of: the outcome window closes (entry +
 * 20 sessions), the setup invalidates (close beyond invalidLevel), or 30
 * sessions pass.
 *
 * Ablation (--ablate <component>): the candidate keeps its baseline
 * score/grade AND an ablated score/grade with that component zeroed.
 * Catalyst is ablated first (spec order). Growth/options are already
 * null in the baseline, so their ablation is vacuous — recorded as such.
 */
import {
  bucketKey, contraction, detectA1, detectA1S, detectA2, detectA2S, detectA3S,
  gapInfo, gradeFor, regimeAllows, rsLineNewHigh, tierOutcome, tradeScore,
} from '../../../pipeline/lib/cmo/index.mjs';
import { WINDOWS } from './prepare.mjs';

export const DAILY_MODULES = ['A1', 'A2', 'A1S', 'A2S', 'A3S'];
export const TIERS = [5, 10, 15];

/** Find the trigger session: first j in (i+1..i+5) trading through the pivot. */
export function findTrigger(bars, i, pivot, direction) {
  const long = direction === 'long';
  for (let j = i + 1; j <= Math.min(i + 5, bars.length - 1); j++) {
    if (long ? bars[j].h >= pivot : bars[j].l <= pivot) return j;
  }
  return null;
}

/** First session after i where the close goes beyond the invalid level (or null). */
export function findInvalidation(bars, i, invalidLevel, direction, limit) {
  const long = direction === 'long';
  for (let k = i + 1; k <= Math.min(i + limit, bars.length - 1); k++) {
    if (long ? bars[k].c < invalidLevel : bars[k].c > invalidLevel) return k;
  }
  return null;
}

function earningsFor(ticker, date, prevDate, earningsByDate) {
  const bySymbol = earningsByDate.get(date);
  let row = bySymbol?.get(ticker);
  let matchedDate = row ? date : null;
  if (!row && prevDate) {
    const prev = earningsByDate.get(prevDate);
    row = prev?.get(ticker);
    matchedDate = row ? prevDate : null;
  }
  if (!row) return null;
  const surprise = row.surprisePct != null ? row.surprisePct / 100 : null;
  return { surprise, matchedDate, time: row.time ?? null };
}

/** Build the tradeScore inputs for one detection. */
export function buildScoreInputs({ det, p, i, ticker, univ, earningsByDate, params, spyAligned }) {
  const bars = p.bars;
  const d = p.dates[i];
  const rs = univ.rsPct.get(ticker)?.get(d) ?? null;
  const group = univ.groupPct.get(ticker)?.get(d) ?? null;
  const gap = gapInfo(bars, i);
  const prevDate = i > 0 ? p.dates[i - 1] : null;
  const earn = (det.setup === 'A1' || det.setup === 'A1S')
    ? earningsFor(ticker, d, prevDate, earningsByDate) : null;
  let setupQuality = 'met';
  if (det.setup === 'A2' || det.setup === 'A2S') {
    const con = contraction(bars, i, params);
    const surfing = p.ema10[i] != null && p.closes[i] > p.ema10[i];
    if (con.pass && con.baseLength >= 15 && surfing) setupQuality = 'full';
  }
  const rsLine = (rs != null && i >= 252)
    ? rsLineNewHigh(bars, spyAligned, i, 252).rsLineHigh : false;
  return {
    setupQuality,
    catalyst: {
      surprise: earn?.surprise ?? null,
      guidanceRaised: null,
      hardNews: null,
      softNews: null,
      gapPct: gap?.gapPct ?? null,
    },
    growth: null,
    rs,
    rsLineNewHigh: rsLine,
    rvol: p.rvol50[i],
    openingRvol: null,
    groupRankPct: group,
    options: null,
    _meta: { earningsMatchedDate: earn?.matchedDate ?? null, earningsTime: earn?.time ?? null },
  };
}

/** Zero one score component for ablation. Returns the modified inputs. */
export function ablateInputs(inputs, component) {
  const next = { ...inputs, catalyst: inputs.catalyst ? { ...inputs.catalyst } : null };
  switch (component) {
    case 'catalyst': next.catalyst = null; break;
    case 'growth': next.growth = null; break;
    case 'rs': next.rs = null; next.rsLineNewHigh = false; break;
    case 'volume': next.rvol = null; next.openingRvol = null; break;
    case 'group': next.groupRankPct = null; break;
    case 'options': next.options = null; break;
    case 'regime': break; // regime is a gate, handled by the caller (re-include excluded)
    default: throw new Error(`unknown ablation component: ${component}`);
  }
  return next;
}

function atrDistancePct(det, p, i) {
  const atr = p.atr14[i];
  if (atr == null || p.closes[i] <= 0) return null;
  const atrPct = (atr / p.closes[i]) * 100;
  return atrPct > 0 ? det.distToPivotPct / atrPct : null;
}

/**
 * Detect-only pass: returns detections + the gap dates that need earnings.
 * Used so run.mjs can fetch the earnings calendar for exactly those dates
 * before the full scan.
 */
export function detectOnly(univ, opts) {
  const { from, to, params, metaByTicker } = opts;
  const detections = [];
  const gapDates = new Set();
  const stats = { preFilterHits: 0, detectorRejects: 0, illiquidPrefilter: 0 };
  for (const [ticker, p] of univ.prepared) {
    const bars = p.bars;
    const n = bars.length;
    const cap = metaByTicker[ticker]?.marketCap ?? null;
    const a3Bar = cap != null && cap >= params.a3s.largeCapUsd ? params.a3s.largeCapMovePct : params.a3s.smallCapMovePct;
    const suppressed = new Map(); // setup|direction -> first allowed index
    for (let i = 0; i < n; i++) {
      const d = p.dates[i];
      if (d < from || d > to) continue;
      for (const setup of DAILY_MODULES) {
        if (i < (suppressed.get(`${setup}|${setup.endsWith('S') ? 'short' : 'long'}`) ?? 0)) continue;
        const det = tryDetect(univ, ticker, p, i, setup, cap, a3Bar, params, stats, null);
        if (!det) continue;
        const entryIndex = findTrigger(bars, i, det.pivot, det.direction);
        detections.push({ ticker, setup, direction: det.direction, index: i, date: d, det, entryIndex });
        if (setup === 'A1' || setup === 'A1S') gapDates.add(d);
        // Suppression: until the earliest of invalidation, the outcome
        // window closing (entry + 20 sessions), or 30 sessions passing.
        const inv = findInvalidation(bars, i, det.invalidLevel, det.direction, 30);
        const windowClose = entryIndex != null ? entryIndex + 20 : i + 30;
        const until = Math.min(inv ?? i + 30, windowClose, i + 30);
        suppressed.set(`${setup}|${det.direction}`, until);
      }
    }
  }
  return { detections, gapDates: [...gapDates].sort(), stats };
}

/**
 * Try one detector at (ticker, i) after the cheap pre-filter.
 * `earningsByDate` is null during detectOnly (catalyst stays null there).
 * Returns the detector result or null. Updates stats.
 */
function tryDetect(univ, ticker, p, i, setup, cap, a3Bar, params, stats, earningsByDate) {
  const bars = p.bars;
  const c = p.closes[i];
  let pre = false;
  if (setup === 'A1') {
    if (i < 64) return null;
    const gap = i > 0 ? ((bars[i].o - bars[i - 1].c) / bars[i - 1].c) * 100 : null;
    pre = gap != null && gap >= params.a1.gapMinPct;
  } else if (setup === 'A1S') {
    if (i < 64) return null;
    const gap = i > 0 ? ((bars[i].o - bars[i - 1].c) / bars[i - 1].c) * 100 : null;
    pre = gap != null && gap <= -params.a1s.gapMinPct;
  } else if (setup === 'A2') {
    if (i < 252) return null;
    const tt = params.trendTemplate;
    pre = p.sma50[i] != null && p.sma150[i] != null && p.sma200[i] != null
      && c > p.sma50[i] && p.sma50[i] > p.sma150[i] && p.sma150[i] > p.sma200[i]
      && p.sma200[i] > p.sma200[i - tt.risingMinSessions]
      && p.low252[i] != null && ((c / p.low252[i]) - 1) * 100 >= tt.aboveLowPct
      && p.high252[i] != null && ((p.high252[i] / c) - 1) * 100 <= tt.withinHighPct
      && p.priorMoveMax[i] != null && p.priorMoveMax[i] >= params.priorMove.minPct
      && (univ.rsPct.get(ticker)?.get(p.dates[i]) ?? -1) >= params.rs.a2Min;
  } else if (setup === 'A2S') {
    if (i < 252) return null;
    pre = p.sma50[i] != null && p.sma150[i] != null && p.sma200[i] != null
      && c < p.sma50[i] && p.sma50[i] < p.sma150[i] && p.sma150[i] < p.sma200[i]
      && p.ema10[i] != null && p.ema20[i] != null
      && p.ema10[i] < p.ema10[i - 5] && p.ema20[i] < p.ema20[i - 5]
      && (univ.rsPct.get(ticker)?.get(p.dates[i]) ?? 101) <= params.rs.a2sMax;
  } else if (setup === 'A3S') {
    if (i < 5) return null;
    const rise = (c / bars[i - params.a3s.windowSessions].c - 1) * 100;
    pre = rise >= a3Bar && p.upStreak[i] >= params.a3s.minUpDays;
  }
  if (!pre) return null;
  stats.preFilterHits += 1;
  if (!p.liquid[i]) { stats.illiquidPrefilter += 1; return null; }
  const d = p.dates[i];
  let det = null;
  if (setup === 'A1' || setup === 'A1S') {
    const prevDate = i > 0 ? p.dates[i - 1] : null;
    const earn = earningsByDate ? earningsFor(ticker, d, prevDate, earningsByDate) : null;
    const ctx = { catalyst: earn ? 'earnings' : null };
    det = setup === 'A1' ? detectA1(bars, i, ctx, params) : detectA1S(bars, i, ctx, params);
  } else if (setup === 'A2') {
    det = detectA2(bars, i, { rs: univ.rsPct.get(ticker)?.get(d) ?? null, spyBars: univ.spy.bars }, params);
  } else if (setup === 'A2S') {
    det = detectA2S(bars, i, { rs: univ.rsPct.get(ticker)?.get(d) ?? null }, params);
  } else if (setup === 'A3S') {
    det = detectA3S(bars, i, { marketCap: cap }, params);
  }
  if (!det) stats.detectorRejects += 1;
  return det;
}

/**
 * Full scan: detections → trigger → score → tier outcomes.
 * `detections` comes from detectOnly (same window, same params) so the
 * detectors are not run twice. `earningsByDate`: Map(date -> Map(symbol -> row)).
 */
export function scanAll(univ, opts, detections) {
  const { split, params, metaByTicker, ablate = null } = opts;
  const candidates = [];
  const stats = {
    detected: 0, nonTradeable: 0, regimeExcluded: 0, neverTriggered: 0,
    graded: 0, perModule: {},
  };
  for (const m of DAILY_MODULES) stats.perModule[m] = { detected: 0, graded: 0, neverTriggered: 0, regimeExcluded: 0, nonTradeable: 0 };
  // Aligned SPY pseudo-bars per ticker (RS-line check needs index alignment).
  const spyByDate = new Map(univ.spy.dates.map((d, i) => [d, univ.spy.bars[i]]));
  const spyAlignedCache = new Map();
  function spyAlignedFor(p) {
    if (spyAlignedCache.has(p)) return spyAlignedCache.get(p);
    let last = null;
    const aligned = p.dates.map((d) => {
      if (spyByDate.has(d)) last = spyByDate.get(d);
      return last ? { ts: last.ts, o: last.o, h: last.h, l: last.l, c: last.c, v: last.v } : null;
    });
    // Backfill leading nulls with the first available SPY bar.
    let first = null;
    for (const b of aligned) if (b) { first = b; break; }
    const out = aligned.map((b) => b || first);
    spyAlignedCache.set(p, out);
    return out;
  }
  for (const item of detections) {
    const { ticker, setup, direction, index: i, date: d, det } = item;
    const p = univ.prepared.get(ticker);
    const bars = p.bars;
    stats.detected += 1;
    stats.perModule[setup].detected += 1;
    const regime = univ.regime.get(d);
    const allows = regime ? regimeAllows(regime)[direction] : false;
    const regimeExcluded = !allows;
    if (regimeExcluded) {
      stats.regimeExcluded += 1;
      stats.perModule[setup].regimeExcluded += 1;
      // Kept (flagged) so the regime ablation can re-include them.
    }
    // Tradeable is recorded, not applied (see the header note): the
    // backtest grades every detection and reports the tradeable share.
    if (!det.tradeable) {
      stats.nonTradeable += 1;
      stats.perModule[setup].nonTradeable += 1;
    }
    const entryIndex = item.entryIndex;
    const triggered = entryIndex != null;
    if (!triggered) {
      stats.neverTriggered += 1;
      stats.perModule[setup].neverTriggered += 1;
    }
    const inputs = buildScoreInputs({
      det, p, i, ticker, univ,
      earningsByDate: opts.earningsByDate || new Map(),
      params, spyAligned: spyAlignedFor(p),
    });
    const scored = tradeScore(inputs, params);
    let ablated = null;
    if (ablate) {
      const abInputs = ablateInputs(inputs, ablate);
      const ab = tradeScore(abInputs, params);
      ablated = { score: ab.score, grade: ab.grade, components: ab.components };
    }
    const outcomes = {};
    const complete = {};
    if (triggered) {
      for (const w of WINDOWS) {
        const o = tierOutcome(bars, entryIndex, det.pivot, direction, w, TIERS, { basis: 'extremes' });
        outcomes[w] = {
          hit1: o.hit['5'], hit2: o.hit['10'], hit3: o.hit['15'],
          sessionsTo1: o.sessionsTo['5'], sessionsTo2: o.sessionsTo['10'], sessionsTo3: o.sessionsTo['15'],
          bestMovePct: o.bestMovePct, worstAgainstPct: o.worstAgainstPct,
        };
        complete[w] = entryIndex + w <= bars.length - 1;
      }
    }
    const adrPct = p.adr20[i];
    const atrDistance = atrDistancePct(det, p, i);
    const cand = {
      ticker, setup, direction, date: d, index: i,
      pivot: det.pivot, invalidLevel: det.invalidLevel,
      tradeable: det.tradeable, triggered, neverTriggered: !triggered,
      entryIndex, entryPrice: triggered ? det.pivot : null,
      entryDate: triggered ? p.dates[entryIndex] : null,
      score: scored.score, grade: scored.grade, components: scored.components,
      ablated,
      adrPct, atrDistance,
      bucketKey: bucketKey({ setup, direction, grade: scored.grade, adrPct, atrDistance }, params),
      ablatedBucketKey: ablated
        ? bucketKey({ setup, direction, grade: ablated.grade, adrPct, atrDistance }, params) : null,
      regime, regimeExcluded,
      inSample: d < split,
      outcomes, complete,
      rs: inputs.rs, rvol: inputs.rvol, groupRankPct: inputs.groupRankPct,
      catalystSurprise: inputs.catalyst.surprise, catalystGapPct: inputs.catalyst.gapPct,
      earningsMatchedDate: inputs._meta.earningsMatchedDate,
    };
    candidates.push(cand);
    if (triggered && !regimeExcluded) {
      stats.graded += 1;
      stats.perModule[setup].graded += 1;
    }
  }
  return { candidates, stats };
}

export { gradeFor };
