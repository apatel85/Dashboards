/**
 * noiseBand.test.mjs — Module C noise band (plan §6.3).
 * Synthetic marks; the fixture-based test (real SPY 5-minute bars)
 * lives in setups.test.mjs once the scan lands the fixtures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { noiseValue, noiseBands, noiseSignal } from '../noiseBand.mjs';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('noiseValue: 14-session mean of |price/open − 1|', () => {
  // |102/100-1| + |99/100-1| + |51/50-1| = 0.02+0.01+0.02 = 0.05; /3 = 0.016667
  const marks = [{ open: 100, price: 102 }, { open: 100, price: 99 }, { open: 50, price: 51 }];
  assert.ok(approx(noiseValue(marks), 0.05 / 3, 1e-9));
  assert.equal(noiseValue([]), null);
});

test('noiseBands: upper = max(open, prior close) × (1+noise); lower mirrors', () => {
  const b = noiseBands({ open: 100, priorClose: 99, noise: 0.02 });
  assert.ok(approx(b.upper, 102));
  assert.ok(approx(b.lower, 97.02));
  const b2 = noiseBands({ open: 98, priorClose: 100, noise: 0.02 });
  assert.ok(approx(b2.upper, 102)); // max(98,100) × 1.02
  assert.ok(approx(b2.lower, 96.04)); // min(98,100) × 0.98
  assert.equal(noiseBands({ open: 100, priorClose: 99, noise: null }), null);
});

test('noiseSignal: above the upper band → long; below the lower → short', () => {
  const bands = { upper: 102, lower: 97.02 };
  assert.equal(noiseSignal(bands, 103).signal, 'long');
  assert.equal(noiseSignal(bands, 96).signal, 'short');
  assert.equal(noiseSignal(bands, 100).signal, 'none');
  assert.equal(noiseSignal(bands, 102).signal, 'none'); // exactly on the band: no signal
});
