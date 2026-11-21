/**
 * setups.mjs — setup detectors (spec §5, plan §6.1/§6.6).
 *
 * Each detector returns null (no setup) or:
 *   { setup, direction, pivot, invalidLevel, baseStart,
 *     distToPivotPct, tradeable, notes[] }
 * `pivot` is the setup's own trigger level; `invalidLevel` is the level
 * below which the setup is no longer valid (the stop line). `tradeable`
 * applies the §4.5 / §6.6 trade filters (3% technical-stop cap, $10
 * minimum short price) — a pattern can be detected but not tradeable,
 * and the notes say why. Detection is not a trade recommendation.
 *
 * Detectors are pure price-action checks on daily bars
 * { ts, o, h, l, c, v }. What bars cannot prove is taken from `ctx`:
 * - A1/A1S: `ctx.catalyst` ('earnings' | 'guidance' | 'news' | null).
 *   If null, the pattern is detected on price action alone and the notes
 *   say the catalyst is unconfirmed. A wrong-kind catalyst returns null.
 * - A2/A2S: `ctx.rs` (universe RS percentile 0–100, from rank.mjs) and
 *   `ctx.spyBars` (aligned SPY bars for the RS-line check).
 * - A3S: `ctx.marketCap` (USD, may be null — see below).
 *
 * §8 decisions encoded here: A1 gap 10% (not 8%); A1-S mirror at 10%
 * (labelled plan construction — Kullamägi's EP is long-only); A3-S
 * small-cap bar 300%+ (not 100%); PDT workarounds removed (no PDT
 * logic anywhere); J Law / Khandelwal contribute no rules.
 *
 * Judgment calls (plan text under-specified, marked in notes):
 * - A3S "up X% in 5 sessions" is close-to-close over 5 sessions.
 * - A3S pivot is the signal day's low (the daily proxy for the
 *   opening-range low the short triggers on); invalidLevel is the day's
 *   high. Intraday entry needs the real opening range (orb.mjs).
 * - A2-S "bear flag" is operationalized like `contraction` mirrored:
 *   the flag starts at the lowest low of the last 40 sessions, must be
 *   10–40 sessions long, and the second half's range must be narrower
 *   than the first half's (tightening), under a falling 10/20-day EMA.
 * - A2 pivot is the base high (contraction.baseHigh); invalidLevel is
 *   the base low. The 0.1%-above-pivot entry and the 1.5× volume-pace
 *   and 0.7-ATR entry-validity rules are live-entry rules, not
 *   detection gates — they are noted, not enforced here.
 */
import { PARAMS } from './params.mjs';
import { atr, closeLocation, contraction, ema, gapInfo, priorMove, rvol, sma, trendTemplate } from './indicators.mjs';

function stopDistancePct(entry, stop) {
  return entry ? (Math.abs(entry - stop) / entry) * 100 : null;
}

/**
 * A1 · Episodic pivot, long (plan §6.1). Gap up ≥ 10% at the open on
 * earnings, guidance or hard news; day RVOL ≥ 2; not already up > 50%
 * in the prior 63 sessions; close in the top 25% of the day's range.
 */
export function detectA1(bars, index, ctx = {}, params = PARAMS) {
  if (index < 64) return null;
  if (ctx.catalyst != null && !['earnings', 'guidance', 'news'].includes(ctx.catalyst)) return null;
  const gap = gapInfo(bars, index);
  if (!gap || gap.gapPct == null || gap.gapPct < params.a1.gapMinPct) return null;
  const rv = rvol(bars, index, 50);
  if (rv == null || rv < params.a1.rvolMin) return null;
  const prior63 = (bars[index - 1].c / bars[index - 64].c - 1) * 100;
  if (prior63 > params.a1.prior63MaxPct) return null;
  const loc = closeLocation(bars[index]);
  if (loc == null || loc < 0.75) return null;
  const pivot = bars[index].h;
  const invalidLevel = bars[index].l;
  const stopDist = stopDistancePct(pivot, invalidLevel);
  const notes = [
    `Gap +${gap.gapPct.toFixed(1)}% at the open (needs ≥ ${params.a1.gapMinPct}%)`,
    `Day RVOL ${rv.toFixed(2)}× (needs ≥ ${params.a1.rvolMin}×)`,
    `Prior 63 sessions +${prior63.toFixed(1)}% (must be ≤ ${params.a1.prior63MaxPct}%)`,
    `Close in top ${Math.round(loc * 100)}% of the day's range`,
  ];
  if (ctx.catalyst) notes.push(`Catalyst: ${ctx.catalyst}`);
  else notes.push('Catalyst unconfirmed from bars — verify earnings / guidance / news before trading');
  if (stopDist != null && stopDist > params.risk.lossPct) {
    notes.push(`Technical stop ${stopDist.toFixed(1)}% away exceeds the ${params.risk.lossPct}% cap — detected, not tradeable under §4.5`);
  }
  return {
    setup: 'A1', direction: 'long', pivot, invalidLevel, baseStart: index,
    distToPivotPct: ((pivot - bars[index].c) / bars[index].c) * 100,
    tradeable: stopDist == null || stopDist <= params.risk.lossPct,
    notes,
  };
}

/**
 * A2 · Contraction breakout, long (plan §6.1). Trend Template true;
 * RS ≥ 80; prior move ≥ 30%; contraction rules all true.
 * Pivot = highest high of the base; invalidLevel = base low.
 */
export function detectA2(bars, index, ctx = {}, params = PARAMS) {
  if (index < 252) return null;
  const template = trendTemplate(bars, index, ctx.rs ?? null, params);
  if (!template.pass) return null;
  if (ctx.rs == null || ctx.rs < params.rs.a2Min) return null;
  const pm = priorMove(bars, index, params);
  if (!pm.pass) return null;
  const con = contraction(bars, index, params);
  if (!con.pass) return null;
  const pivot = con.baseHigh;
  const invalidLevel = con.baseLow;
  const stopDist = stopDistancePct(pivot, invalidLevel);
  const notes = [
    'Trend Template true (close > 50 > 150 > 200 SMA, 200-day rising, 52-week position, RS ≥ 70)',
    `RS ${ctx.rs} (needs ≥ ${params.rs.a2Min})`,
    `Prior move +${pm.maxRisePct.toFixed(1)}% over ${pm.window} sessions (needs ≥ ${params.priorMove.minPct}%)`,
    `Base ${con.baseLength} sessions, depth ${con.depthPct.toFixed(1)}% (≤ ${params.contraction.maxDepthPct}%)`,
    `Entry: buy stop ${params.a2.entryAbovePivotPct}% above pivot, only with volume on pace ≥ ${params.a2.entryVolPaceMin}× and price not > ${params.a2.maxAbovePivotAtr} ATR above the pivot`,
  ];
  if (stopDist != null && stopDist > params.risk.lossPct) {
    notes.push(`Technical stop ${stopDist.toFixed(1)}% away exceeds the ${params.risk.lossPct}% cap — detected, not tradeable under §4.5`);
  }
  return {
    setup: 'A2', direction: 'long', pivot, invalidLevel, baseStart: con.baseStart,
    distToPivotPct: ((pivot - bars[index].c) / bars[index].c) * 100,
    tradeable: stopDist == null || stopDist <= params.risk.lossPct,
    notes,
  };
}

/**
 * A1-S · Negative episodic pivot, short (plan §6.6). Mirror of A1:
 * gap down ≥ 10%, RVOL ≥ 2, close in the bottom 25% of the day's range.
 * The plan states no prior-63 rule for the short side, so none is
 * applied. Pivot = gap-day low; invalidLevel = gap-day high.
 */
export function detectA1S(bars, index, ctx = {}, params = PARAMS) {
  if (index < 64) return null;
  if (ctx.catalyst != null && !['earnings', 'guidance', 'news'].includes(ctx.catalyst)) return null;
  const gap = gapInfo(bars, index);
  if (!gap || gap.gapPct == null || gap.gapPct > -params.a1s.gapMinPct) return null;
  const rv = rvol(bars, index, 50);
  if (rv == null || rv < params.a1s.rvolMin) return null;
  const loc = closeLocation(bars[index]);
  if (loc == null || loc > 0.25) return null;
  const pivot = bars[index].l;
  const invalidLevel = bars[index].h;
  const stopDist = stopDistancePct(pivot, invalidLevel);
  const notes = [
    `Gap ${gap.gapPct.toFixed(1)}% at the open (needs ≤ −${params.a1s.gapMinPct}%)`,
    `Day RVOL ${rv.toFixed(2)}× (needs ≥ ${params.a1s.rvolMin}×)`,
    `Close in bottom ${Math.round(loc * 100)}% of the day's range`,
    'Short mirror is plan construction — Kullamägi\'s EP is long-only',
  ];
  if (ctx.catalyst) notes.push(`Catalyst: ${ctx.catalyst}`);
  else notes.push('Catalyst unconfirmed from bars — verify miss / guidance cut before trading');
  let tradeable = stopDist == null || stopDist <= params.risk.lossPct;
  if (stopDist != null && stopDist > params.risk.lossPct) {
    notes.push(`Technical stop ${stopDist.toFixed(1)}% away exceeds the ${params.risk.lossPct}% cap — detected, not tradeable under §4.5`);
  }
  if (bars[index].c < params.shorts.minPrice) {
    tradeable = false;
    notes.push(`Price $${bars[index].c.toFixed(2)} under $${params.shorts.minPrice} — no short per §6.6`);
  }
  return {
    setup: 'A1S', direction: 'short', pivot, invalidLevel, baseStart: index,
    distToPivotPct: ((bars[index].c - pivot) / bars[index].c) * 100,
    tradeable, notes,
  };
}

/**
 * A2-S · Breakdown, short (plan §6.6). Close < 50 < 150 < 200-day SMA;
 * RS ≤ 20; a 10–40 session bear flag tightening under a falling
 * 10/20-day EMA. Pivot = flag low; invalidLevel = flag high.
 */
export function detectA2S(bars, index, ctx = {}, params = PARAMS) {
  if (index < 252) return null;
  const closes = bars.map((b) => b.c);
  const s50 = sma(closes, 50);
  const s150 = sma(closes, 150);
  const s200 = sma(closes, 200);
  const c = bars[index].c;
  if (!(s50[index] != null && s150[index] != null && s200[index] != null &&
    c < s50[index] && s50[index] < s150[index] && s150[index] < s200[index])) return null;
  if (ctx.rs == null || ctx.rs > params.rs.a2sMax) return null;
  const from = Math.max(0, index - params.a2s.flagMaxSessions);
  let flagLow = Infinity;
  let flagStart = null;
  for (let k = from; k <= index; k++) {
    if (bars[k].l < flagLow) { flagLow = bars[k].l; flagStart = k; }
  }
  const flagLength = index - flagStart;
  if (flagLength < params.a2s.flagMinSessions || flagLength > params.a2s.flagMaxSessions) return null;
  const mid = flagStart + Math.floor(flagLength / 2);
  const range1 = Math.max(...bars.slice(flagStart, mid + 1).map((b) => b.h)) -
    Math.min(...bars.slice(flagStart, mid + 1).map((b) => b.l));
  const range2 = Math.max(...bars.slice(mid + 1, index + 1).map((b) => b.h)) -
    Math.min(...bars.slice(mid + 1, index + 1).map((b) => b.l));
  if (!(range2 < range1)) return null;
  const e10 = ema(closes, 10);
  const e20 = ema(closes, 20);
  const falling = e10[index] != null && e20[index] != null &&
    e10[index - 5] != null && e20[index - 5] != null &&
    e10[index] < e10[index - 5] && e20[index] < e20[index - 5];
  if (!falling) return null;
  let flagHigh = -Infinity;
  for (let k = flagStart; k <= index; k++) if (bars[k].h > flagHigh) flagHigh = bars[k].h;
  const pivot = flagLow;
  const invalidLevel = flagHigh;
  const stopDist = stopDistancePct(pivot, invalidLevel);
  const notes = [
    'Close < 50 < 150 < 200-day SMA',
    `RS ${ctx.rs} (needs ≤ ${params.rs.a2sMax})`,
    `Bear flag ${flagLength} sessions, tightening (second-half range ${range2.toFixed(2)} < first-half ${range1.toFixed(2)}), 10/20-day EMA falling`,
  ];
  let tradeable = stopDist == null || stopDist <= params.risk.lossPct;
  if (stopDist != null && stopDist > params.risk.lossPct) {
    notes.push(`Technical stop ${stopDist.toFixed(1)}% away exceeds the ${params.risk.lossPct}% cap — detected, not tradeable under §4.5`);
  }
  if (bars[index].c < params.shorts.minPrice) {
    tradeable = false;
    notes.push(`Price $${bars[index].c.toFixed(2)} under $${params.shorts.minPrice} — no short per §6.6`);
  }
  return {
    setup: 'A2S', direction: 'short', pivot, invalidLevel, baseStart: flagStart,
    distToPivotPct: ((bars[index].c - pivot) / bars[index].c) * 100,
    tradeable, notes,
  };
}

/**
 * A3-S · Parabolic short (plan §6.6, Kullamägi's third setup). Up ≥ 50%
 * in 5 sessions (large caps) or ≥ 300% (small caps), 3+ consecutive up
 * days; short the first break of the opening-range low; stop at the
 * day's high; cover at the 10- and 20-day averages.
 * `ctx.marketCap` (USD) picks the bar: ≥ $10B is "large". Unknown cap
 * uses the stricter small-cap bar. Rise is close-to-close over 5
 * sessions (judgment call — the plan does not say which prices).
 */
export function detectA3S(bars, index, ctx = {}, params = PARAMS) {
  if (index < 5) return null;
  const isLarge = ctx.marketCap != null && ctx.marketCap >= params.a3s.largeCapUsd;
  const bar = isLarge ? params.a3s.largeCapMovePct : params.a3s.smallCapMovePct;
  const rise = (bars[index].c / bars[index - params.a3s.windowSessions].c - 1) * 100;
  if (rise < bar) return null;
  // Consecutive up days ending at index (close above prior close).
  let streak = 0;
  for (let k = index; k > 0; k--) {
    if (bars[k].c > bars[k - 1].c) streak++;
    else break;
  }
  if (streak < params.a3s.minUpDays) return null;
  const pivot = bars[index].l;
  const invalidLevel = bars[index].h;
  const notes = [
    `+${rise.toFixed(1)}% in ${params.a3s.windowSessions} sessions (needs ≥ ${bar}% for ${isLarge ? 'large' : 'small'} caps${ctx.marketCap == null ? ' — cap unknown, strict bar applied' : ''})`,
    `${streak} consecutive up days (needs ≥ ${params.a3s.minUpDays})`,
    `Pivot is the signal day's low (daily proxy for the opening-range low); stop at the day's high $${invalidLevel.toFixed(2)}`,
  ];
  let tradeable = true;
  if (bars[index].c < params.shorts.minPrice) {
    tradeable = false;
    notes.push(`Price $${bars[index].c.toFixed(2)} under $${params.shorts.minPrice} — no short per §6.6`);
  }
  return {
    setup: 'A3S', direction: 'short', pivot, invalidLevel, baseStart: index - params.a3s.windowSessions,
    distToPivotPct: ((bars[index].c - pivot) / bars[index].c) * 100,
    tradeable, notes,
  };
}
