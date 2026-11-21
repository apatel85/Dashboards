/**
 * data/universe.mjs — per-date index membership from the CACHED bars.
 *
 * Plan §7.4: the backtest must state its survivorship bias honestly.
 * Membership here is "the ticker has a cached bar on that date" — i.e. the
 * CURRENT constituents (universe.json, fetched today) projected backwards.
 * That is NOT historical membership: a stock that left the index (or died)
 * before today is absent from the whole window, and a stock that joined in
 * 2024 appears in the 2019 sample too (it was liquid then, but not an
 * index member). Both directions of the bias are reported in DATA_AUDIT.md:
 *  - survivorship share: tickers whose first cached bar is after `from`,
 *    and tickers with bars covering < 80% of the window;
 *  - the headline verdict is re-run on index members only (tickers with
 *    bars on ≥ 95% of the window's trading days) as the plan requires.
 *
 * Pure functions over loaded data (the caller passes the bars in).
 */

/** Build per-date membership from { ticker: bars[] } restricted to [from, to]. */
export function buildMembership(barsByTicker, from, to) {
  const datesSet = new Set();
  const byTicker = new Map(); // ticker -> Map(date -> barIndex)
  for (const [ticker, bars] of Object.entries(barsByTicker)) {
    const idx = new Map();
    for (let i = 0; i < bars.length; i++) {
      const d = new Date(bars[i].ts * 1000).toISOString().slice(0, 10);
      if (d < from || d > to) continue;
      datesSet.add(d);
      idx.set(d, i);
    }
    byTicker.set(ticker, idx);
  }
  const dates = [...datesSet].sort();
  const byDate = new Map(); // date -> [tickers with a bar]
  for (const d of dates) byDate.set(d, []);
  for (const [ticker, idx] of byTicker) {
    for (const d of idx.keys()) byDate.get(d).push(ticker);
  }
  return { dates, byDate, byTicker };
}

export function membershipStats(barsByTicker, from, to, dates) {
  const nSessions = dates.length;
  const stats = {
    windowSessions: nSessions,
    tickers: Object.keys(barsByTicker).length,
    firstBarAfterFrom: 0,
    coverageUnder80: 0,
    coverageAtLeast95: 0,
    coverageRows: [],
  };
  for (const [ticker, bars] of Object.entries(barsByTicker)) {
    const inWindow = bars.filter((b) => {
      const d = new Date(b.ts * 1000).toISOString().slice(0, 10);
      return d >= from && d <= to;
    });
    if (!inWindow.length) continue;
    const first = new Date(inWindow[0].ts * 1000).toISOString().slice(0, 10);
    const coverage = inWindow.length / nSessions;
    if (first > from) stats.firstBarAfterFrom += 1;
    if (coverage < 0.8) stats.coverageUnder80 += 1;
    if (coverage >= 0.95) stats.coverageAtLeast95 += 1;
    stats.coverageRows.push({ ticker, first, bars: inWindow.length, coverage: +coverage.toFixed(4) });
  }
  stats.coverageRows.sort((a, b) => a.coverage - b.coverage);
  return stats;
}
