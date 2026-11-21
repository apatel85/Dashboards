/**
 * orb.test.mjs — opening range + ORB signal (plan §6.2, spec §7.3).
 * Synthetic minute bars; the fixture-based test (real 1-minute bars)
 * lives in setups.test.mjs once the scan lands the fixtures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openingRange, openingRvol, orbSignal } from '../orb.mjs';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const mbar = (ts, o, h, l, c, v = 1000) => ({ ts, o, h, l, c, v });

test('openingRange: high/low of the first 5 minutes', () => {
  const mins = [
    mbar(1, 100, 100.5, 99.8, 100.2), mbar(2, 100.2, 101, 100, 100.8),
    mbar(3, 100.8, 100.8, 99.9, 100.1), mbar(4, 100.1, 101.2, 100.2, 101),
    mbar(5, 101, 100.9, 100.1, 100.5), mbar(6, 100.5, 101.5, 100.4, 101.4),
  ];
  const r = openingRange(mins, 5);
  assert.ok(approx(r.high, 101.2));
  assert.ok(approx(r.low, 99.8));
  assert.equal(r.bars, 5);
  assert.equal(openingRange([], 5), null);
});

test('openingRvol: opening volume / 14-day average of the same bar', () => {
  assert.equal(openingRvol(500000, 250000), 2);
  assert.equal(openingRvol(100, 0), null);
});

test('orbSignal long: break of the range high, stop 10% of ATR(14)', () => {
  const range = { high: 101.2, low: 99.8 };
  const r = orbSignal(range, { price: 101.5 }, { atr14: 2.0 });
  assert.equal(r.signal, 'long');
  assert.ok(approx(r.entry, 101.2));
  assert.ok(approx(r.stop, 101.0)); // 101.2 − 0.10×2.0
  assert.ok(approx(r.target, 102.2)); // 101.2 + 5×0.2 (5R plan variant)
  assert.equal(r.endCondition, 'Back inside the opening range or through VWAP');
});

test('orbSignal short: break of the range low', () => {
  const range = { high: 101.2, low: 99.8 };
  const r = orbSignal(range, { price: 99.5 }, { atr14: 2.0 });
  assert.equal(r.signal, 'short');
  assert.ok(approx(r.entry, 99.8));
  assert.ok(approx(r.stop, 100.0)); // 99.8 + 0.2
  assert.ok(approx(r.target, 98.8)); // 99.8 − 5×0.2
});

test('orbSignal none inside the range; stop null without ATR', () => {
  const range = { high: 101.2, low: 99.8 };
  assert.equal(orbSignal(range, { price: 100.5 }, { atr14: 2.0 }).signal, 'none');
  const noAtr = orbSignal(range, { price: 101.5 }, {});
  assert.equal(noAtr.signal, 'long');
  assert.equal(noAtr.stop, null);
});
