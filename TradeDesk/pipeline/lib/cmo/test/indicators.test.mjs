/**
 * indicators.test.mjs — every indicator against hand-computed fixtures.
 * The arithmetic is shown in the comments so a reader can check it
 * without trusting the implementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sma, ema, atr, adrPct, rvol, rsRaw, trendTemplate, priorMove,
  contraction, gapInfo, closeLocation, avwap, rsLineNewHigh,
} from '../indicators.mjs';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const bar = (c, o = c, h = c, l = c, v = 1000, ts = 0) => ({ ts, o, h, l, c, v });

test('sma: [10,11,12,13,14] period 3 → [null,null,11,12,13]', () => {
  assert.deepEqual(sma([10, 11, 12, 13, 14], 3), [null, null, 11, 12, 13]);
});

test('ema: seeded with the SMA of the first period, k = 2/(n+1)', () => {
  // seed = mean(10,11,12) = 11; k = 0.5; i=3: 13*0.5+11*0.5 = 12; i=4: 14*0.5+12*0.5 = 13
  assert.deepEqual(ema([10, 11, 12, 13, 14], 3), [null, null, 11, 12, 13]);
});

test('atr: simple mean of true range (pipeline convention, not Wilder)', () => {
  const bars = [
    bar(10.5, 10, 11, 9),
    bar(11.5, 10.5, 12, 10), // TR = max(2, |12-10.5|, |10-10.5|) = 2
    bar(12.5, 11.5, 13, 11), // TR = max(2, 1.5, 0.5) = 2
    bar(12, 12.5, 12.8, 11.5), // TR = max(1.3, 0.3, 1.0) = 1.3
    bar(12.2, 12, 12.5, 11.8), // TR = max(0.7, 0.5, 0.2) = 0.7
  ];
  const a = atr(bars, 3);
  assert.deepEqual(a.slice(0, 3), [null, null, null]);
  assert.ok(approx(a[3], (2 + 2 + 1.3) / 3)); // 1.7667
  assert.ok(approx(a[4], (2 + 1.3 + 0.7) / 3)); // 1.3333
});

test('adrPct: mean of (high-low)/close x 100', () => {
  const bars = [bar(10, 10, 11, 9), bar(11, 11, 12, 10), bar(12, 12, 13, 11)];
  // day0: 2/10 = 20%; day1: 2/11 = 18.1818%; day2: 2/12 = 16.6667%
  const a = adrPct(bars, 2);
  assert.equal(a[0], null);
  assert.ok(approx(a[1], (20 + 18.181818) / 2, 1e-4));
  assert.ok(approx(a[2], (18.181818 + 16.666667) / 2, 1e-4));
});

test('rvol: today volume / mean of the PRIOR 50 sessions (today excluded)', () => {
  const bars = [bar(10, 10, 10, 10, 100), bar(10, 10, 10, 10, 100), bar(10, 10, 10, 10, 100),
    bar(10, 10, 10, 10, 100), bar(10, 10, 10, 10, 300)];
  assert.equal(rvol(bars, 3, 4), null); // not enough history
  assert.equal(rvol(bars, 4, 4), 3); // 300 / mean(100,100,100,100)
});

test('rsRaw: four 63-session blocks, weights 40/20/20/20', () => {
  const mk = (bounds) => {
    // bounds: closes at indices 0, 63, 126, 189, 252; linear between
    const closes = new Array(253);
    const pts = [[0, bounds[0]], [63, bounds[1]], [126, bounds[2]], [189, bounds[3]], [252, bounds[4]]];
    for (let s = 0; s < 4; s++) {
      const [i0, c0] = pts[s];
      const [i1, c1] = pts[s + 1];
      for (let i = i0; i <= i1; i++) closes[i] = c0 + ((c1 - c0) * (i - i0)) / (i1 - i0);
    }
    return closes.map((c) => bar(c));
  };
  // every block +10%: 0.4*0.1 + 0.2*0.1 + 0.2*0.1 + 0.2*0.1 = 0.10
  assert.ok(approx(rsRaw(mk([100, 110, 121, 133.1, 146.41]), 252), 0.1, 1e-9));
  // blocks +20%, +10%, 0%, -10% (newest first): 0.4*0.2 + 0.2*0.1 + 0.2*0 + 0.2*(-0.1) = 0.08
  assert.ok(approx(rsRaw(mk([100, 90, 90, 99, 118.8]), 252), 0.08, 1e-9));
  assert.equal(rsRaw(mk([100, 110, 121, 133.1, 146.41]), 100), null); // too short
});

test('trendTemplate: rising series passes; flat series fails the strict >', () => {
  const rising = [];
  for (let i = 0; i < 260; i++) rising.push(bar(100 + i * 0.5, 100 + i * 0.5, 101 + i * 0.5, 99 + i * 0.5));
  const t = trendTemplate(rising, 259, 87);
  assert.equal(t.pass, true);
  assert.deepEqual(t.checks.map((k) => k.key), ['close>50>150>200', 'sma200-rising', 'above-52w-low', 'within-52w-high', 'rs>=70']);
  const flat = new Array(260).fill(null).map(() => bar(100, 100, 101, 99));
  assert.equal(trendTemplate(flat, 259, 87).pass, false); // close == SMAs, not above
  const noRs = trendTemplate(rising, 259, null);
  assert.equal(noRs.pass, true); // RS check skipped, noted
  assert.equal(noRs.checks.find((k) => k.key === 'rs>=70').note.includes('skipped'), true);
  const lowRs = trendTemplate(rising, 259, 60);
  assert.equal(lowRs.pass, false); // RS 60 < 70
});

test('priorMove: largest rise over any 21–63 session window', () => {
  const bars = [];
  for (let i = 0; i <= 130; i++) {
    const c = i <= 100 ? 100 : 100 + ((i - 100) * 35) / 30; // 100 → 135 over 30 sessions
    bars.push(bar(c));
  }
  const pm = priorMove(bars, 130);
  assert.ok(approx(pm.maxRisePct, 35, 1e-9));
  assert.equal(pm.window, 30);
  assert.equal(pm.pass, true);
  const flat = new Array(131).fill(null).map(() => bar(100));
  assert.equal(priorMove(flat, 130).pass, false);
});

test('contraction: shrinking base passes; deep base fails', () => {
  const mk = (lowStart) => {
    const bars = [];
    for (let i = 0; i < 30; i++) {
      bars.push({ ts: i, o: 100, h: 110 - i * 0.3, l: lowStart + i * 0.2, c: 100, v: 1000 - i * 20 });
    }
    return bars;
  };
  // base high 110 (bar 0), low 90 → depth 18.2%; length 29; ATR ratio ~0.63; vol ratio ~0.65
  const c = contraction(mk(90), 29);
  assert.equal(c.pass, true);
  assert.equal(c.baseStart, 0);
  assert.equal(c.baseLength, 29);
  assert.ok(approx(c.depthPct, (110 - 90) / 110 * 100, 1e-9));
  // depth (110-80)/110 = 27.3% > 25% → fail
  assert.equal(contraction(mk(80), 29).pass, false);
});

test('gapInfo and closeLocation', () => {
  const bars = [bar(100, 100, 101, 99), bar(114, 112, 115, 110)];
  const g = gapInfo(bars, 1);
  assert.ok(approx(g.gapPct, 12));
  assert.equal(g.gapUp, true);
  assert.ok(approx(g.closeLocationPct, (114 - 110) / (115 - 110))); // 0.8
  assert.equal(closeLocation({ h: 110, l: 100, c: 105 }), 0.5);
  assert.equal(closeLocation({ h: 100, l: 100, c: 100 }), null);
});

test('avwap: volume-weighted typical price from the anchor', () => {
  const bars = [
    { ts: 0, o: 9, h: 10, l: 8, c: 9, v: 100 }, // typical 9, pv 900
    { ts: 1, o: 11, h: 12, l: 10, c: 11, v: 200 }, // typical 11, pv 2200
  ];
  assert.ok(approx(avwap(bars, 0, 1), 3100 / 300, 1e-9));
  assert.equal(avwap(bars, 0, 0), 9);
});

test('rsLineNewHigh: RS line at a high while price is flat → leads', () => {
  const bars = [];
  const bench = [];
  for (let i = 0; i < 260; i++) {
    bars.push(bar(100, 100, 101, 99));
    bench.push(bar(i < 250 ? 100 : 100 - (i - 249), 100, 101, 99)); // bench falls after 250
  }
  const r = rsLineNewHigh(bars, bench, 259);
  assert.equal(r.rsLineHigh, true); // 100/90 = 1.111 > prior max 1.0
  assert.equal(r.priceHigh, false); // price 100, never above prior 100
  assert.equal(r.rsLeads, true);
});
