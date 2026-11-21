/**
 * tiers.test.mjs — tierOutcome, bucketKey, Wilson interval, lookupProbability.
 * tierOutcome cases are hand-built OHLC sequences; the expected numbers
 * are computed in the comments.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOutcome, bucketKey, lookupProbability, wilsonInterval, adrBand, atrBand } from '../tiers.mjs';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const bar = (o, h, l, c, ts = 0) => ({ ts, o, h, l, c, v: 1000 });

test('tierOutcome long: tiers hit at sessions 3 and 5, 15% never', () => {
  const bars = [
    bar(100, 100, 100, 100), // entry session (index 0)
    bar(100, 101, 99, 100.5), // +1.0% high
    bar(101, 103, 100, 102), // +3.0%
    bar(102, 105.5, 102, 105), // +5.5% → Tier 1 at session 3
    bar(105, 109, 104, 108), // +9.0%
    bar(108, 110.5, 106, 110), // +10.5% → Tier 2 at session 5
    bar(110, 110, 107, 108), bar(108, 109, 107, 108), bar(108, 109, 107, 108),
    bar(108, 109, 107, 108), bar(108, 109, 107, 108),
  ];
  const r = tierOutcome(bars, 0, 100, 'long', 10);
  assert.deepEqual(r.hit, { 5: true, 10: true, 15: false });
  assert.deepEqual(r.sessionsTo, { 5: 3, 10: 5, 15: null });
  assert.ok(approx(r.bestMovePct, 10.5));
  // worst low before session 5 (when Tier 2 was reached): lows 99,100,102,104 → -1.0%
  assert.ok(approx(r.worstAgainstPct, -1));
  assert.equal(r.windowSessions, 10);
});

test('tierOutcome edge: tier reached on the LAST session of the window counts', () => {
  const bars = [bar(100, 100, 100, 100)];
  for (let i = 1; i < 10; i++) bars.push(bar(100, 101, 99, 100));
  bars.push(bar(100, 105.1, 100, 104)); // session 10: +5.1%
  const r = tierOutcome(bars, 0, 100, 'long', 10);
  assert.equal(r.hit[5], true);
  assert.equal(r.sessionsTo[5], 10);
});

test('tierOutcome edge: tier reached one session too late does NOT count', () => {
  const bars = [bar(100, 100, 100, 100)];
  for (let i = 1; i <= 10; i++) bars.push(bar(100, 101, 99, 100));
  bars.push(bar(100, 105.1, 100, 104)); // session 11: outside a 10-session window
  const r = tierOutcome(bars, 0, 100, 'long', 10);
  assert.equal(r.hit[5], false);
  assert.equal(r.sessionsTo[5], null);
});

test('tierOutcome short: judged on the lowest low', () => {
  const bars = [
    bar(100, 100, 100, 100),
    bar(100, 101, 94, 97), // -6.4% → Tier 1 at session 1
    bar(97, 98, 89.5, 90), // -10.5% → Tier 2 at session 2
    bar(90, 92, 89, 91),
  ];
  const r = tierOutcome(bars, 0, 100, 'short', 5);
  assert.deepEqual(r.hit, { 5: true, 10: true, 15: false });
  assert.deepEqual(r.sessionsTo, { 5: 1, 10: 2, 15: null });
  // best move for a short is (entry/low − 1); the lowest low is 89 at session 3: (100/89 − 1) × 100 = 12.36%
  assert.ok(approx(r.bestMovePct, (100 / 89 - 1) * 100, 1e-9));
  // worst high before session 2 (when Tier 2 was reached): highs 101, 98 → +1.0%
  assert.ok(approx(r.worstAgainstPct, 1));
});

test('tierOutcome close basis: an intraday spike that closes flat does not win (option plays, §3.1)', () => {
  const bars = [
    bar(100, 100, 100, 100),
    bar(100, 106, 99, 101), // high +6% but close +1%
  ];
  const extremes = tierOutcome(bars, 0, 100, 'long', 5, [5, 10, 15], { basis: 'extremes' });
  const close = tierOutcome(bars, 0, 100, 'long', 5, [5, 10, 15], { basis: 'close' });
  assert.equal(extremes.hit[5], true);
  assert.equal(close.hit[5], false);
});

test('tierOutcome worst-against stops at the session the top tier was reached', () => {
  const bars = [
    bar(100, 100, 100, 100),
    bar(100, 105.5, 99, 105), // Tier 1 at session 1; low 99 → -1%
    bar(105, 106, 90, 92), // later collapse to 90 — AFTER the top tier was reached, ignored
  ];
  const r = tierOutcome(bars, 0, 100, 'long', 5);
  assert.ok(approx(r.worstAgainstPct, -1));
});

test('bucketKey: setup|direction|grade|adrBand|atrBand', () => {
  assert.equal(bucketKey({ setup: 'A1', direction: 'long', grade: 'A', adrPct: 6, atrDistance: 1.5 }), 'A1|long|A|adr5-8|atr1-2');
  assert.equal(bucketKey({ setup: 'A2', direction: 'short', grade: 'B', adrPct: 2.5, atrDistance: 0.5 }), 'A2|short|B|adr<3|atr0-1');
  assert.equal(bucketKey({ setup: 'A3S', direction: 'short', grade: 'A+', adrPct: 9, atrDistance: 2.5 }), 'A3S|short|A+|adr8+|atr2+');
  assert.equal(adrBand(3), 'adr3-5');
  assert.equal(adrBand(8), 'adr8+');
  assert.equal(atrBand(1), 'atr0-1');
  assert.equal(atrBand(2), 'atr1-2');
});

test('wilsonInterval matches the hand-computed 90% Wilson values', () => {
  // 68/100: p 0.68, [0.599391, 0.751124]; 12/120: [0.063406, 0.154237]
  const w1 = wilsonInterval(68, 100);
  assert.ok(approx(w1.p, 0.68));
  assert.ok(approx(w1.low, 0.599391, 1e-4));
  assert.ok(approx(w1.high, 0.751124, 1e-4));
  const w2 = wilsonInterval(12, 120);
  assert.ok(approx(w2.low, 0.063406, 1e-4));
  assert.ok(approx(w2.high, 0.154237, 1e-4));
  assert.deepEqual(wilsonInterval(0, 0), { p: null, low: null, high: null });
});

const rows = [
  { setup: 'A1', direction: 'long', grade: 'A', adrBand: 'adr5-8', atrBand: 'atr1-2', cases: 120, hits: 60 },
  { setup: 'A1', direction: 'long', grade: 'A', adrBand: 'adr5-8', atrBand: 'atr0-1', cases: 80, hits: 40 },
  { setup: 'A1', direction: 'long', grade: 'A', adrBand: 'adr3-5', atrBand: 'atr1-2', cases: 150, hits: 45 },
  { setup: 'A1', direction: 'long', grade: 'A+', adrBand: 'adr5-8', atrBand: 'atr1-2', cases: 50, hits: 30 },
  { setup: 'A1', direction: 'long', grade: 'B', adrBand: 'adr5-8', atrBand: 'atr1-2', cases: 200, hits: 40 },
];

test('lookupProbability full bucket, no fallback needed', () => {
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 6, atrDistance: 1.5 });
  assert.equal(r.fallback, 'full');
  assert.ok(approx(r.p, 0.5));
  assert.equal(r.cases, 120);
});

test('lookupProbability thin full bucket falls back: drop ATR band first', () => {
  // atr0-1 row has 80 cases < 100 → aggregate adr5-8 across ATR bands: 200 cases, 100 hits
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 6, atrDistance: 0.5 });
  assert.equal(r.fallback, 'no-atr');
  assert.equal(r.cases, 200);
  assert.ok(approx(r.p, 0.5));
});

test('lookupProbability then drops the ADR band', () => {
  // adr8+ has no rows at all → aggregate all A1/long/A rows: 350 cases, 145 hits
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 9, atrDistance: 1.5 });
  assert.equal(r.fallback, 'no-adr');
  assert.equal(r.cases, 350);
  assert.ok(approx(r.p, 145 / 350));
});

test('lookupProbability merges A+ with A as the last fallback', () => {
  // A+ candidate, adr8+, atr2+: all A/A+ rows aggregate: 400 cases, 175 hits
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A+', adrPct: 9, atrDistance: 2.5 });
  assert.equal(r.fallback, 'merged-grade');
  assert.equal(r.cases, 400);
  assert.ok(approx(r.p, 175 / 400));
});

test('lookupProbability returns null when every level is under 100 cases', () => {
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'C', adrPct: 9, atrDistance: 2.5 });
  assert.equal(r, null);
});
