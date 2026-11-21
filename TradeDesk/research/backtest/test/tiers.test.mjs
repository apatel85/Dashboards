/**
 * test/tiers.test.mjs — tierOutcome reproduces ten hand-checked cases.
 * Every expected number below was computed by hand from the library's
 * definition (extremes basis unless stated): favourable = high/entry − 1
 * (long) or entry/low − 1 (short); sessionsTo is the 1-based offset of the
 * first session reaching the tier; worstAgainst is measured up to the
 * session where the HIGHEST tier was first reached (or the window end).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOutcome } from '../../../pipeline/lib/cmo/index.mjs';

const bar = (c, h, l, o = c, v = 1000, ts = 0) => ({ ts, o, h, l, c, v });
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('1: long hits 5% in 1 session, never 10%', () => {
  const bars = [bar(100, 100, 100), bar(105, 106, 99), bar(106, 107, 100), bar(107, 108, 101)];
  const o = tierOutcome(bars, 0, 100, 'long', 3);
  assert.equal(o.hit['5'], true);
  assert.equal(o.hit['10'], false);
  assert.equal(o.hit['15'], false);
  assert.equal(o.sessionsTo['5'], 1);
  assert.equal(o.sessionsTo['10'], null);
  assert.ok(approx(o.bestMovePct, 8));
  assert.ok(approx(o.worstAgainstPct, -1)); // highest tier (5%) reached at session 1; low 99
  assert.equal(o.windowSessions, 3);
});

test('2: long hits 5/10% in session 2, 15% in session 3', () => {
  const bars = [
    bar(100, 100, 100),
    bar(103, 104, 98), bar(110, 111, 104), bar(115, 116, 110), bar(111, 112, 108), bar(109, 110, 106),
  ];
  const o = tierOutcome(bars, 0, 100, 'long', 5);
  assert.deepEqual(o.hit, { 5: true, 10: true, 15: true });
  assert.deepEqual(o.sessionsTo, { 5: 2, 10: 2, 15: 3 }); // session 1 high is only +4%
  assert.ok(approx(o.bestMovePct, 16));
  assert.ok(approx(o.worstAgainstPct, -2)); // worst low before session 3 is 98
});

test('3: long never reaches 5%', () => {
  const bars = [bar(100, 100, 100), bar(101, 101, 97), bar(102, 102, 98), bar(103, 103, 99)];
  const o = tierOutcome(bars, 0, 100, 'long', 3);
  assert.deepEqual(o.hit, { 5: false, 10: false, 15: false });
  assert.deepEqual(o.sessionsTo, { 5: null, 10: null, 15: null });
  assert.ok(approx(o.bestMovePct, 3));
  assert.ok(approx(o.worstAgainstPct, -3)); // no tier: worst to window end
});

test('4: short hits 5% in 1 session, never 10%', () => {
  const bars = [bar(100, 100, 100), bar(95, 101, 94), bar(94, 100, 93), bar(97, 99, 96)];
  const o = tierOutcome(bars, 0, 100, 'short', 3);
  assert.equal(o.hit['5'], true);
  assert.equal(o.hit['10'], false);
  assert.equal(o.sessionsTo['5'], 1);
  assert.ok(approx(o.bestMovePct, (100 / 93 - 1) * 100));
  assert.ok(approx(o.worstAgainstPct, 1)); // highest tier reached at session 1; high 101
});

test('5: close basis ignores intraday highs', () => {
  const bars = [bar(100, 100, 100), bar(101, 110, 99), bar(106, 112, 100)];
  const o = tierOutcome(bars, 0, 100, 'long', 2, [5, 10, 15], { basis: 'close' });
  assert.equal(o.hit['5'], true); // close +6% at session 2 (intraday +10% at session 1 does not count)
  assert.equal(o.hit['10'], false);
  assert.equal(o.sessionsTo['5'], 2);
  assert.ok(approx(o.bestMovePct, 6));
  assert.ok(approx(o.worstAgainstPct, -1)); // worst low to session 2 is 99
});

test('6: window truncated at the end of the data', () => {
  const bars = [bar(100, 100, 100), bar(105, 106, 100)];
  const o = tierOutcome(bars, 0, 100, 'long', 10);
  assert.equal(o.hit['5'], true);
  assert.equal(o.sessionsTo['5'], 1);
  assert.equal(o.windowSessions, 1);
});

test('7: exactly 5.00% counts as a hit', () => {
  const bars = [bar(100, 100, 100), bar(104, 105, 100)];
  const o = tierOutcome(bars, 0, 100, 'long', 1);
  assert.equal(o.hit['5'], true);
  assert.equal(o.sessionsTo['5'], 1);
});

test('8: 10% reached only on the last session of the window', () => {
  const bars = [bar(100, 100, 100), bar(103, 103, 99), bar(104, 104, 98), bar(110, 110, 100)];
  const o = tierOutcome(bars, 0, 100, 'long', 3);
  assert.deepEqual(o.hit, { 5: true, 10: true, 15: false });
  assert.deepEqual(o.sessionsTo, { 5: 3, 10: 3, 15: null });
  assert.ok(approx(o.bestMovePct, 10));
  assert.ok(approx(o.worstAgainstPct, -2)); // worst low to session 3 is 98
});

test('9: short hits 15% in 2 sessions', () => {
  const bars = [bar(100, 100, 100), bar(92, 102, 90), bar(87, 101, 85)];
  const o = tierOutcome(bars, 0, 100, 'short', 5);
  assert.deepEqual(o.hit, { 5: true, 10: true, 15: true });
  assert.deepEqual(o.sessionsTo, { 5: 1, 10: 1, 15: 2 });
  assert.ok(approx(o.bestMovePct, (100 / 85 - 1) * 100));
  assert.ok(approx(o.worstAgainstPct, 2)); // worst high to session 2 is 102
});

test('10: flat price — no hits, zero moves', () => {
  const bars = [bar(100, 100, 100), bar(100, 100, 100), bar(100, 100, 100)];
  const o = tierOutcome(bars, 0, 100, 'long', 2);
  assert.deepEqual(o.hit, { 5: false, 10: false, 15: false });
  assert.deepEqual(o.sessionsTo, { 5: null, 10: null, 15: null });
  assert.ok(approx(o.bestMovePct, 0));
  assert.ok(approx(o.worstAgainstPct, 0));
});
