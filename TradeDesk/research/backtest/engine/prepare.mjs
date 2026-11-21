/**
 * engine/prepare.mjs — precompute everything the scan needs, once per ticker.
 *
 * Pure functions over loaded cache data. No fs, no network, no clock.
 *
 * Why precompute: the library's sma/ema/atr return full arrays (O(n) per
 * call), so calling the detectors naively on every session is O(n^2) per
 * ticker. The scan instead uses these series for cheap pre-filters and
 * calls the library detectors only on sessions that pass a necessary
 * condition (a superset of the detector's own gates — the detector stays
 * the authority and can still reject).
 *
 * Per ticker (on its own bars):
 *   closes, sma50/150/200, ema10/20/21, atr14, adr20, rvol50 (rolling),
 *   rsRaw (library rsRaw), liquid (price ≥ $10, 20d avg dollar volume ≥
 *   $20M, ADR% ≥ 3%), forward max favourable move per window (extremes).
 * Universe (cross-sectional, per global date):
 *   rsPct (percentile of rsRaw across tickers), groupPct (percentile of
 *   the ticker's sector median RS across sectors), breadth (% of tickers
 *   with close > SMA50), regime (library regimeState on SPY + breadth).
 */
import {
  adrPct, atr, ema, percentileRank, regimeAllows, regimeState, rsRaw, sma,
} from '../../../pipeline/lib/cmo/index.mjs';

export const WINDOWS = [3, 5, 10, 20];

/** Percentile rank from a pre-sorted array (same formula as rank.mjs). */
export function percentileFromSorted(sorted, value) {
  if (!sorted.length || value == null) return null;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
  const below = lo;
  let up = lo;
  while (up < sorted.length && sorted[up] === value) up += 1;
  const equal = up - below;
  return ((below + 0.5 * equal) / sorted.length) * 100;
}

export function dateOf(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Per-ticker series. `bars` must be sorted by ts ascending, already cleaned. */
export function prepareTicker(bars, params) {
  const n = bars.length;
  const closes = bars.map((b) => b.c);
  const s50 = sma(closes, 50);
  const s150 = sma(closes, 150);
  const s200 = sma(closes, 200);
  const e10 = ema(closes, 10);
  const e20 = ema(closes, 20);
  const e21 = ema(closes, 21);
  const a14 = atr(bars, 14);
  const adr = adrPct(bars, 20);
  const rvol50 = new Array(n).fill(null);
  let volSum = 0;
  for (let i = 0; i < n; i++) {
    if (i >= 50) {
      // volSum holds the sum of the PRIOR 50 sessions (today excluded),
      // matching library rvol(bars, i, 50).
      const avg = volSum / 50;
      rvol50[i] = avg > 0 ? bars[i].v / avg : null;
    }
    volSum += bars[i].v;
    if (i >= 50) volSum -= bars[i - 50].v;
  }
  const rsArr = new Array(n).fill(null);
  for (let i = 0; i < n; i++) rsArr[i] = rsRaw(bars, i, params);
  // Liquidity (plan §4.2): price ≥ $10, 20d avg dollar volume ≥ $20M, ADR% ≥ 3%.
  // Dollar volume uses the PRIOR 20 sessions (same convention as rvol).
  const liquid = new Array(n).fill(false);
  let dvSum = 0;
  for (let i = 0; i < n; i++) {
    if (i >= 20) {
      liquid[i] = bars[i].c >= params.universe.minPrice
        && dvSum / 20 >= params.universe.minAvgDollarVol20d
        && adr[i] != null && adr[i] >= params.universe.minAdrPct20d;
    }
    dvSum += bars[i].c * bars[i].v;
    if (i >= 20) dvSum -= bars[i - 20].c * bars[i - 20].v;
  }
  // Forward max favourable move per window (extremes basis), per session.
  const fwdLong = {}; const fwdShort = {};
  for (const w of WINDOWS) { fwdLong[w] = new Array(n).fill(null); fwdShort[w] = new Array(n).fill(null); }
  for (let i = 0; i < n; i++) {
    let maxH = -Infinity; let minL = Infinity;
    for (let j = i + 1; j <= Math.min(i + 20, n - 1); j++) {
      if (bars[j].h > maxH) maxH = bars[j].h;
      if (bars[j].l < minL) minL = bars[j].l;
      const w = j - i;
      if (WINDOWS.includes(w)) {
        fwdLong[w][i] = ((maxH / bars[i].c) - 1) * 100;
        fwdShort[w][i] = ((bars[i].c / minL) - 1) * 100;
      }
    }
  }
  // Pre-filter series (rolling, O(n) each via monotone deques).
  // priorMoveMax[i]: the library priorMove's max rise over windows
  // [minWindow..maxWindow] = close[i] / min(close[i-maxW..i-minW]) - 1.
  const pm = params.priorMove;
  const priorMoveMax = new Array(n).fill(null);
  {
    const dq = []; // indices with increasing closes
    for (let i = 0; i < n; i++) {
      const enter = i - pm.minWindow; // newest index entering the window
      if (enter >= 0) {
        while (dq.length && closes[dq[dq.length - 1]] >= closes[enter]) dq.pop();
        dq.push(enter);
      }
      while (dq.length && dq[0] < i - pm.maxWindow) dq.shift();
      if (i >= pm.maxWindow && dq.length) {
        priorMoveMax[i] = ((closes[i] / closes[dq[0]]) - 1) * 100;
      }
    }
  }
  // 252-session rolling low / high (trend-template 52-week checks).
  const low252 = new Array(n).fill(null);
  const high252 = new Array(n).fill(null);
  {
    const dqLo = []; const dqHi = [];
    for (let i = 0; i < n; i++) {
      while (dqLo.length && bars[dqLo[dqLo.length - 1]].l >= bars[i].l) dqLo.pop();
      dqLo.push(i);
      while (dqHi.length && bars[dqHi[dqHi.length - 1]].h <= bars[i].h) dqHi.pop();
      dqHi.push(i);
      while (dqLo.length && dqLo[0] < i - 251) dqLo.shift();
      while (dqHi.length && dqHi[0] < i - 251) dqHi.shift();
      low252[i] = bars[dqLo[0]].l;
      high252[i] = bars[dqHi[0]].h;
    }
  }
  // Consecutive up days ending at i (close above prior close).
  const upStreak = new Array(n).fill(0);
  for (let i = 1; i < n; i++) upStreak[i] = closes[i] > closes[i - 1] ? upStreak[i - 1] + 1 : 0;
  return {
    bars, closes, dates: bars.map((b) => dateOf(b.ts)),
    sma50: s50, sma150: s150, sma200: s200, ema10: e10, ema20: e20, ema21: e21,
    atr14: a14, adr20: adr, rvol50, rsArr, liquid, fwdLong, fwdShort,
    priorMoveMax, low252, high252, upStreak,
  };
}

/**
 * Cross-sectional structures for the whole universe.
 * barsByTicker: { ticker: bars[] }; metaByTicker: { ticker: { sector } | null }.
 * spy: prepared SPY object; vixCloseByDate: Map(date -> close).
 * Returns { dates, prepared, rsPct, groupPct, breadth, regime, regimeAllowsByDate }.
 * rsPct/groupPct: Map(ticker -> Map(date -> percentile)).
 */
export function prepareUniverse(barsByTicker, metaByTicker, spy, vixCloseByDate, params) {
  const prepared = new Map();
  const dateSet = new Set();
  for (const [ticker, bars] of Object.entries(barsByTicker)) {
    const p = prepareTicker(bars, params);
    prepared.set(ticker, p);
    for (const d of p.dates) dateSet.add(d);
  }
  const dates = [...dateSet].sort();
  const spyDates = new Map(spy.dates.map((d, i) => [d, i]));

  // Per-date RS values, breadth, sector medians.
  const rsByDate = new Map(); // date -> [{ticker, rs, localIdx}]
  const breadthByDate = new Map(); // date -> {above, total}
  for (const [ticker, p] of prepared) {
    for (let i = 0; i < p.bars.length; i++) {
      const d = p.dates[i];
      if (p.rsArr[i] != null) {
        if (!rsByDate.has(d)) rsByDate.set(d, []);
        rsByDate.get(d).push({ ticker, rs: p.rsArr[i], localIdx: i });
      }
      if (p.sma50[i] != null) {
        const b = breadthByDate.get(d) || { above: 0, total: 0 };
        b.total += 1;
        if (p.closes[i] > p.sma50[i]) b.above += 1;
        breadthByDate.set(d, b);
      }
    }
  }
  const rsPct = new Map();
  const groupPct = new Map();
  for (const [d, entries] of rsByDate) {
    const sorted = entries.map((e) => e.rs).sort((a, b) => a - b);
    for (const e of entries) {
      const pct = percentileFromSorted(sorted, e.rs);
      if (!rsPct.has(e.ticker)) rsPct.set(e.ticker, new Map());
      rsPct.get(e.ticker).set(d, pct);
    }
    // Sector median RS → percentile across sectors.
    const bySector = new Map();
    for (const e of entries) {
      const sector = metaByTicker[e.ticker]?.sector ?? null;
      if (!sector) continue;
      if (!bySector.has(sector)) bySector.set(sector, []);
      bySector.get(sector).push(e.rs);
    }
    const medians = [];
    for (const [sector, vals] of bySector) {
      const s = [...vals].sort((a, b) => a - b);
      const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
      medians.push({ sector, med });
    }
    const sortedMedians = medians.map((m) => m.med).sort((a, b) => a - b);
    const sectorPct = new Map(medians.map((m) => [m.sector, percentileFromSorted(sortedMedians, m.med)]));
    for (const e of entries) {
      const sector = metaByTicker[e.ticker]?.sector ?? null;
      const pct = sector ? sectorPct.get(sector) ?? null : null;
      if (pct != null) {
        if (!groupPct.has(e.ticker)) groupPct.set(e.ticker, new Map());
        groupPct.get(e.ticker).set(d, pct);
      }
    }
  }
  // Regime per date.
  const breadth = new Map();
  const regime = new Map();
  for (const d of dates) {
    const b = breadthByDate.get(d);
    const breadthPct = b && b.total ? (100 * b.above) / b.total : null;
    breadth.set(d, breadthPct);
    const si = spyDates.get(d);
    if (si == null || spy.sma50[si] == null || spy.ema21[si] == null || spy.sma200[si] == null || breadthPct == null) {
      regime.set(d, null);
      continue;
    }
    const r = regimeState({
      spy: { close: spy.closes[si], sma50: spy.sma50[si], ema21: spy.ema21[si], sma200: spy.sma200[si] },
      breadthPct,
      vix: vixCloseByDate.get(d) ?? null,
    }, params);
    regime.set(d, r.state);
  }
  return { dates, prepared, rsPct, groupPct, breadth, regime, spy };
}

export { percentileRank, regimeAllows };
