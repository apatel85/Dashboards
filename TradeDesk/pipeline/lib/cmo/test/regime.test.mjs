/** regime + rank tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { regimeState, regimeAllows } from '../regime.mjs';
import { percentileRank } from '../rank.mjs';

test('regimeState Green: SPY > 50 SMA, 21 EMA > 50 SMA, breadth ≥ 50%', () => {
  const r = regimeState({ spy: { close: 600, sma50: 590, ema21: 595, sma200: 550 }, breadthPct: 55, vix: 15 });
  assert.equal(r.state, 'Green');
  assert.ok(r.reasons.length >= 4);
});

test('regimeState Red: SPY < 200 SMA, or breadth < 30%', () => {
  const byPrice = regimeState({ spy: { close: 540, sma50: 590, ema21: 585, sma200: 550 }, breadthPct: 55, vix: 30 });
  assert.equal(byPrice.state, 'Red');
  const byBreadth = regimeState({ spy: { close: 600, sma50: 590, ema21: 595, sma200: 550 }, breadthPct: 25, vix: 15 });
  assert.equal(byBreadth.state, 'Red');
});

test('regimeState Yellow: neither Green nor Red', () => {
  // close > 50 SMA but 21 EMA < 50 SMA → not Green; close > 200 SMA, breadth 45 → not Red
  const r = regimeState({ spy: { close: 595, sma50: 590, ema21: 585, sma200: 550 }, breadthPct: 45, vix: 20 });
  assert.equal(r.state, 'Yellow');
});

test('regimeState: VIX is context only, never a gate', () => {
  const calm = regimeState({ spy: { close: 600, sma50: 590, ema21: 595, sma200: 550 }, breadthPct: 55, vix: 12 });
  const stressed = regimeState({ spy: { close: 600, sma50: 590, ema21: 595, sma200: 550 }, breadthPct: 55, vix: 45 });
  assert.equal(calm.state, stressed.state);
  assert.equal(calm.state, 'Green');
});

test('regimeAllows: longs Green/Yellow, shorts Red/Yellow (spec §6.3)', () => {
  assert.deepEqual(regimeAllows('Green'), { long: true, short: false });
  assert.deepEqual(regimeAllows('Red'), { long: false, short: true });
  assert.deepEqual(regimeAllows('Yellow'), { long: true, short: true });
});

test('percentileRank: (below + 0.5 × equal) / n × 100', () => {
  assert.equal(percentileRank([1, 2, 3, 4, 5], 3), 50); // (2 + 0.5)/5
  assert.equal(percentileRank([1, 2, 3, 4, 5], 5), 90); // (4 + 0.5)/5
  assert.equal(percentileRank([1, 2, 3, 4, 5], 1), 10); // (0 + 0.5)/5
  assert.equal(percentileRank([], 3), null);
  assert.equal(percentileRank([1, 2, 3], null), null);
});
