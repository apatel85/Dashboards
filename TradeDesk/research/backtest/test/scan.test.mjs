/**
 * test/scan.test.mjs — trigger / invalidation search on small arrays.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findTrigger, findInvalidation } from '../engine/scan.mjs';

const bar = (c, h, l, o = c, v = 1000, ts = 0) => ({ ts, o, h, l, c, v });

test('findTrigger: long, first session through the pivot inside 5 sessions', () => {
  const bars = [
    bar(100, 100, 100), bar(101, 102, 99), bar(103, 104, 100), bar(106, 108, 104), bar(105, 106, 103),
  ];
  assert.equal(findTrigger(bars, 0, 105, 'long'), 3); // session 1 high 102, session 2 high 104, session 3 high 108 ≥ 105
  assert.equal(findTrigger(bars, 0, 109, 'long'), null); // never through in 5 sessions
});

test('findTrigger: short, low through the pivot', () => {
  const bars = [
    bar(100, 100, 100), bar(99, 101, 98), bar(97, 99, 95), bar(96, 98, 94),
  ];
  assert.equal(findTrigger(bars, 0, 96, 'short'), 2); // session 2 low 95 ≤ 96
  assert.equal(findTrigger(bars, 0, 93, 'short'), null);
});

test('findTrigger: only looks 5 sessions ahead', () => {
  const bars = [bar(100, 100, 100)];
  for (let i = 0; i < 7; i++) bars.push(bar(101, 101, 100));
  bars.push(bar(110, 112, 108)); // session 8 — too late
  assert.equal(findTrigger(bars, 0, 105, 'long'), null);
});

test('findInvalidation: a close exactly AT the level does not invalidate', () => {
  const bars = [
    bar(100, 100, 100), bar(99, 101, 98), bar(97, 99, 96), bar(98, 100, 97),
  ];
  // Session 2 closes exactly at 97 — invalidation needs strictly below.
  assert.equal(findInvalidation(bars, 0, 97, 'long', 30), null);
});

test('findInvalidation: long, close strictly below the level', () => {
  const bars = [
    bar(100, 100, 100), bar(99, 101, 98), bar(96, 99, 95), bar(98, 100, 97),
  ];
  assert.equal(findInvalidation(bars, 0, 97, 'long', 30), 2); // session 2 close 96 < 97
  assert.equal(findInvalidation(bars, 0, 90, 'long', 30), null);
});

test('findInvalidation: short, close strictly above the level', () => {
  const bars = [
    bar(100, 100, 100), bar(101, 102, 99), bar(104, 105, 102),
  ];
  assert.equal(findInvalidation(bars, 0, 103, 'short', 30), 2);
  assert.equal(findInvalidation(bars, 0, 110, 'short', 30), null);
});
