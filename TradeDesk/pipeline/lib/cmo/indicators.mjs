/**
 * indicators.mjs — pure technical indicators for the CMO library (spec §5).
 *
 * Bar shape (matches the pipeline's existing convention — Yahoo chart output
 * and every backtest script use it): { ts, o, h, l, c, v } with ts in unix
 * seconds. Series functions return arrays the same length as the input,
 * with null where there is not enough history yet.
 *
 * Reuse notes (WO-01 reuse check):
 * - sma / atr match pipeline/backtest-scoring-v2.mjs `smaArr` / `atrArr`:
 *   SMA is the sliding-window mean (null until period-1 values exist); ATR
 *   is the SIMPLE mean of true range over the last `period` sessions (NOT
 *   Wilder's smoothed ATR) — null until `period` true ranges exist.
 * - rvol matches that file's `volAvg`: today's volume divided by the mean
 *   of the PRIOR `period` sessions, excluding today.
 * - closeLocation matches its `anatomy().closePos`.
 * - ema is seeded with the SMA of the first `period` values (textbook
 *   seeding); the pipeline's per-index ema helpers use the same seeding.
 * - adrPct has NO pipeline precedent (build-brief.mjs never computes it):
 *   it is the mean of (high-low)/close x 100 over the last `period`
 *   sessions. Judgment call, recorded here.
 */
import { PARAMS } from './params.mjs';
import { mean, trueRange } from './util.mjs';

/** Simple moving average of an array of numbers. Null until period-1 values. */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

/**
 * Exponential moving average. Seeded with the SMA of the first `period`
 * values; k = 2 / (period + 1) after that. Null before the seed is ready.
 */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = mean(values.slice(0, period));
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Average true range: simple mean of true range over the last `period`
 * sessions (pipeline convention, NOT Wilder smoothing). Null until
 * `period` true ranges exist (index < period).
 */
export function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    let s = 0;
    for (let k = i - period + 1; k <= i; k++) s += trueRange(bars, k);
    out[i] = s / period;
  }
  return out;
}

/**
 * Average daily range as a percent: mean of (high-low)/close x 100 over
 * the last `period` sessions. Null until period-1 values. (No pipeline
 * precedent — see the header note.)
 */
export function adrPct(bars, period = 20) {
  const out = new Array(bars.length).fill(null);
  let s = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    s += b.c ? ((b.h - b.l) / b.c) * 100 : 0;
    if (i >= period) {
      const old = bars[i - period];
      s -= old.c ? ((old.h - old.l) / old.c) * 100 : 0;
    }
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

/**
 * Relative volume at `index`: today's volume divided by the mean volume of
 * the PRIOR `period` sessions (today excluded). Null without enough history.
 */
export function rvol(bars, index, period = 50) {
  if (index < period) return null;
  let s = 0;
  for (let k = index - period; k < index; k++) s += bars[k].v;
  const avg = s / period;
  return avg > 0 ? bars[index].v / avg : null;
}

/**
 * Relative strength (raw, plan §4.3): weighted return over four 63-session
 * blocks ending at `index` — 40% the last block, 20% each prior block.
 * Block return = close[i] / close[i-63] - 1. Needs index >= 252.
 * Returns the weighted return as a fraction (0.10 = +10%), or null.
 * Percentile ranking across the universe is rank.mjs `percentileRank`.
 */
export function rsRaw(bars, index, params = PARAMS) {
  const n = params.rs.blockSessions;
  const w = params.rs.weights;
  if (index < 4 * n) return null;
  let total = 0;
  for (let b = 0; b < 4; b++) {
    const end = bars[index - b * n].c;
    const start = bars[index - (b + 1) * n].c;
    if (!start) return null;
    total += w[b] * (end / start - 1);
  }
  return total;
}

/**
 * Minervini Trend Template (plan §4.3) at `index`, plus the §8 decision:
 * the template carries RS ≥ 70 (book criterion 8).
 * `rsPercentile` is the universe percentile rank (0-100) from rank.mjs;
 * pass null to skip the RS check (recorded in the returned checks).
 * Returns { pass, checks: [{ key, pass, value, note }] }.
 */
export function trendTemplate(bars, index, rsPercentile = null, params = PARAMS) {
  const closes = bars.map((b) => b.c);
  const [p50, p150, p200] = params.trendTemplate.smaPeriods;
  const s50 = sma(closes, p50);
  const s150 = sma(closes, p150);
  const s200 = sma(closes, p200);
  const checks = [];
  const c = bars[index]?.c;
  const lo = Math.min(...bars.slice(Math.max(0, index - 251), index + 1).map((b) => b.l));
  const hi = Math.max(...bars.slice(Math.max(0, index - 251), index + 1).map((b) => b.h));
  const add = (key, pass, value, note) => checks.push({ key, pass, value, note });

  add('close>50>150>200', c != null && s50[index] != null && s150[index] != null && s200[index] != null &&
    c > s50[index] && s50[index] > s150[index] && s150[index] > s200[index],
    c != null ? { close: c, sma50: s50[index], sma150: s150[index], sma200: s200[index] } : null,
    'Close above 50-day, 50 above 150, 150 above 200');
  const rising = s200[index] != null && s200[index - params.trendTemplate.risingMinSessions] != null &&
    s200[index] > s200[index - params.trendTemplate.risingMinSessions];
  add('sma200-rising', rising, s200[index] ?? null,
    `200-day SMA rising over ${params.trendTemplate.risingMinSessions} sessions`);
  add('above-52w-low', c != null && lo > 0 && (c / lo - 1) * 100 >= params.trendTemplate.aboveLowPct,
    c != null && lo > 0 ? (c / lo - 1) * 100 : null,
    `Close ≥ ${params.trendTemplate.aboveLowPct}% above 52-week low`);
  add('within-52w-high', c != null && hi > 0 && (hi / c - 1) * 100 <= params.trendTemplate.withinHighPct,
    c != null && hi > 0 ? (hi / c - 1) * 100 : null,
    `Close within ${params.trendTemplate.withinHighPct}% of 52-week high`);
  if (rsPercentile == null) {
    add('rs>=70', true, null, 'RS percentile not supplied — check skipped');
  } else {
    add('rs>=70', rsPercentile >= params.rs.templateMin, rsPercentile,
      `RS percentile ≥ ${params.rs.templateMin} (book criterion 8)`);
  }
  return { pass: checks.every((k) => k.pass), checks };
}

/**
 * Prior move (plan §4.3): largest rise over any window of
 * `minWindow`–`maxWindow` sessions ending at `index`, within the last
 * `lookback` sessions. Returns { maxRisePct, window, pass }.
 */
export function priorMove(bars, index, params = PARAMS) {
  const { minWindow, maxWindow, minPct } = params.priorMove;
  let best = -Infinity;
  let bestW = null;
  for (let w = minWindow; w <= maxWindow; w++) {
    if (index - w < 0) break;
    const start = bars[index - w].c;
    if (!start) continue;
    const rise = (bars[index].c / start - 1) * 100;
    if (rise > best) { best = rise; bestW = w; }
  }
  return { maxRisePct: best === -Infinity ? null : best, window: bestW, pass: best >= minPct };
}

/**
 * Contraction / VCP base (plan §4.3) ending at `index`.
 * Operationalization (the plan does not define how the base start is
 * found): the base high is the highest high of the last `maxBaseSessions`
 * sessions; the base starts at that high's session; depth is measured
 * from that high to the lowest low since. Returns the measurements plus
 * per-rule checks; pass needs every check.
 */
export function contraction(bars, index, params = PARAMS) {
  const p = params.contraction;
  const from = Math.max(0, index - p.maxBaseSessions);
  let baseHigh = -Infinity;
  let baseStart = null;
  for (let k = from; k <= index; k++) {
    if (bars[k].h > baseHigh) { baseHigh = bars[k].h; baseStart = k; }
  }
  let baseLow = Infinity;
  for (let k = baseStart; k <= index; k++) if (bars[k].l < baseLow) baseLow = bars[k].l;
  const baseLength = index - baseStart;
  const depthPct = baseHigh > 0 ? ((baseHigh - baseLow) / baseHigh) * 100 : null;
  const atr5 = atr(bars, p.atrShort)[index];
  const atr20 = atr(bars, p.atrLong)[index];
  const atrRatio = atr5 != null && atr20 ? atr5 / atr20 : null;
  const vol5 = mean(bars.slice(Math.max(0, index - p.volShort + 1), index + 1).map((b) => b.v));
  const vol50 = mean(bars.slice(Math.max(0, index - p.volLong + 1), index + 1).map((b) => b.v));
  const volRatio = vol5 != null && vol50 ? vol5 / vol50 : null;
  const checks = [
    { key: 'base-length', pass: baseLength >= p.minBaseSessions && baseLength <= p.maxBaseSessions, value: baseLength, note: `Base ${p.minBaseSessions}–${p.maxBaseSessions} sessions` },
    { key: 'depth', pass: depthPct != null && depthPct <= p.maxDepthPct, value: depthPct, note: `Depth ≤ ${p.maxDepthPct}%` },
    { key: 'atr-ratio', pass: atrRatio != null && atrRatio <= p.atrRatioMax, value: atrRatio, note: `${p.atrShort}-day ATR ≤ ${p.atrRatioMax * 100}% of ${p.atrLong}-day ATR` },
    { key: 'vol-ratio', pass: volRatio != null && volRatio <= p.volRatioMax, value: volRatio, note: `${p.volShort}-day avg volume ≤ ${p.volRatioMax * 100}% of ${p.volLong}-day` },
  ];
  return { pass: checks.every((k) => k.pass), baseStart, baseLength, baseHigh, baseLow, depthPct, atrRatio, volRatio, checks };
}

/**
 * Gap info for the session at `index` (plan §4.3): open vs prior close,
 * plus where the close sits in the day's range.
 */
export function gapInfo(bars, index) {
  if (index < 1) return null;
  const prevClose = bars[index - 1].c;
  const b = bars[index];
  return {
    gapPct: prevClose ? ((b.o - prevClose) / prevClose) * 100 : null,
    gapUp: b.o > prevClose,
    closeLocationPct: closeLocation(b),
    open: b.o,
    prevClose,
  };
}

/** Where the close sits in the day's range: 0 = low, 1 = high. Null if no range. */
export function closeLocation(bar) {
  const range = bar.h - bar.l;
  return range > 0 ? (bar.c - bar.l) / range : null;
}

/**
 * Anchored VWAP (plan §4.3): volume-weighted average of typical price
 * ((high+low+close)/3) from `anchorIndex` through `endIndex` inclusive.
 */
export function avwap(bars, anchorIndex, endIndex = bars.length - 1) {
  let pv = 0;
  let v = 0;
  for (let k = anchorIndex; k <= endIndex; k++) {
    const b = bars[k];
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    v += b.v;
  }
  return v > 0 ? pv / v : null;
}

/**
 * RS line (plan §4.3): stock close divided by benchmark close.
 * Flags when the RS line makes a 52-week high while the price does not —
 * the RS line leading the price. `benchBars` must be aligned by index
 * with `bars` (same sessions). lookback is in sessions (252 = 52 weeks).
 */
export function rsLineNewHigh(bars, benchBars, index, lookback = 252) {
  const line = (i) => (benchBars[i]?.c ? bars[i].c / benchBars[i].c : null);
  const cur = line(index);
  if (cur == null) return { rsLineHigh: false, priceHigh: false, rsLeads: false, rsLine: null };
  const from = Math.max(0, index - lookback);
  let rsMax = -Infinity;
  let priceMax = -Infinity;
  for (let k = from; k < index; k++) {
    const l = line(k);
    if (l != null && l > rsMax) rsMax = l;
    if (bars[k].c > priceMax) priceMax = bars[k].c;
  }
  const rsLineHigh = cur > rsMax;
  const priceHigh = bars[index].c > priceMax;
  return { rsLineHigh, priceHigh, rsLeads: rsLineHigh && !priceHigh, rsLine: cur };
}
