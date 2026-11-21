/**
 * options.test.mjs — Black-Scholes, expected move, contract choice.
 * BS reference values were computed independently in Python
 * (statistics.NormalDist — an exact CDF, unlike the library's
 * Abramowitz-Stegun approximation), so agreement validates both.
 * Cases: S, K, T (years), r, sigma, call?
 *   (100,100,1/365,0.05,0.30,call) → price 0.633271, delta 0.506612, gamma 0.254024
 *   (100,100,1/365,0.05,0.30,put)  → price 0.619573, delta -0.493388, gamma 0.254024
 *   (100,105,2/365,0.043,0.45,call) → price 0.110075, delta 0.074795, gamma 0.042407
 *   (250.5,260,1/365,0.05,0.60,put) → price 9.931898, delta -0.878024, gamma 0.025721
 *   (50,45,30/365,0.03,0.25,call)  → price 5.209290, delta 0.938252, gamma 0.033996
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsPrice, bsDelta, bsGamma, expectedMove, chooseContract } from '../options.mjs';

const approx = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('bsPrice / bsDelta / bsGamma match the independent Python values', () => {
  const cases = [
    { args: [100, 100, 1 / 365, 0.05, 0.30, true], price: 0.633271, delta: 0.506612, gamma: 0.254024 },
    { args: [100, 100, 1 / 365, 0.05, 0.30, false], price: 0.619573, delta: -0.493388, gamma: 0.254024 },
    { args: [100, 105, 2 / 365, 0.043, 0.45, true], price: 0.110075, delta: 0.074795, gamma: 0.042407 },
    { args: [250.5, 260, 1 / 365, 0.05, 0.60, false], price: 9.931898, delta: -0.878024, gamma: 0.025721 },
    { args: [50, 45, 30 / 365, 0.03, 0.25, true], price: 5.209290, delta: 0.938252, gamma: 0.033996 },
  ];
  for (const c of cases) {
    assert.ok(approx(bsPrice(...c.args), c.price), `price ${c.args}`);
    assert.ok(approx(bsDelta(...c.args), c.delta), `delta ${c.args}`);
    assert.ok(approx(bsGamma(...c.args.slice(0, 5)), c.gamma), `gamma ${c.args}`);
  }
});

test('bsPrice put-call parity holds: C − P = S − K·e^(−rT)', () => {
  const S = 120; const K = 125; const T = 5 / 365; const r = 0.05; const sig = 0.4;
  const lhs = bsPrice(S, K, T, r, sig, true) - bsPrice(S, K, T, r, sig, false);
  const rhs = S - K * Math.exp(-r * T);
  assert.ok(approx(lhs, rhs, 1e-6));
});

test('bs guards: invalid inputs → null price, 0.5/−0.5 delta, 0 gamma', () => {
  assert.equal(bsPrice(100, 100, 0, 0.05, 0.3, true), null);
  assert.equal(bsPrice(-5, 100, 0.01, 0.05, 0.3, true), null);
  assert.equal(bsDelta(100, 100, 0, 0.05, 0.3, true), 0.5);
  assert.equal(bsDelta(100, 100, 0, 0.05, 0.3, false), -0.5);
  assert.equal(bsGamma(100, 100, 0, 0.05, 0.3), 0);
});

test('expectedMove (§3.1): 5%×P(5–10%) + 10%×P(10–15%) + 15%×P(≥15%)', () => {
  // p1 0.6, p2 0.3, p3 0.1 → 5×0.3 + 10×0.2 + 15×0.1 = 1.5+2+1.5 = 5.0
  assert.ok(approx(expectedMove(0.6, 0.3, 0.1), 5.0));
  assert.ok(approx(expectedMove(0.5, 0.5, 0.5), 7.5)); // 0 + 0 + 15×0.5
  assert.equal(expectedMove(0.6, null, 0.1), null);
  assert.equal(expectedMove(null, null, null), null);
});

const chain = [
  { symbol: 'XYZ 100C', type: 'call', strike: 100, expiry: '2026-11-21', delta: 0.55, bid: 1.0, ask: 1.1 },
  { symbol: 'XYZ 102C', type: 'call', strike: 102, expiry: '2026-11-21', delta: 0.48, bid: 0.8, ask: 0.9 },
  { symbol: 'XYZ 104C', type: 'call', strike: 104, expiry: '2026-11-21', delta: 0.42, bid: 0.6, ask: 0.66 },
  { symbol: 'XYZ 106C', type: 'call', strike: 106, expiry: '2026-11-21', delta: 0.35, bid: 0.4, ask: 0.44 },
  { symbol: 'XYZ 100P', type: 'put', strike: 100, expiry: '2026-11-21', delta: -0.45, bid: 1.0, ask: 1.1 },
  { symbol: 'XYZ 98P', type: 'put', strike: 98, expiry: '2026-11-21', delta: -0.38, bid: 0.7, ask: 0.77 },
];

test('chooseContract picks the contract nearest 40 delta', () => {
  const { contract, reason } = chooseContract(chain, { direction: 'long', entryPrice: 100, tiers: [5, 10, 15] });
  assert.equal(reason, null);
  assert.equal(contract.symbol, 'XYZ 104C'); // |0.42-0.40| = 0.02, nearest
  assert.equal(contract.strike, 104);
  assert.deepEqual(contract.tierStrikes, { t1: 105, t2: 110, t3: 115 });
  assert.ok(approx(contract.mid, 0.63));
});

test('chooseContract short: puts, tier strikes below the entry', () => {
  const { contract } = chooseContract(chain, { direction: 'short', entryPrice: 100, tiers: [5, 10, 15] });
  assert.equal(contract.symbol, 'XYZ 98P'); // |−0.38−0.40| = 0.02, nearest of the puts
  assert.deepEqual(contract.tierStrikes, { t1: 95, t2: 90, t3: 85 });
});

test('chooseContract nothing-fits: no delta in range', () => {
  const { contract, reason } = chooseContract(
    [{ symbol: 'X', type: 'call', strike: 100, expiry: '2026-11-21', delta: 0.9, bid: 1, ask: 1.05 }],
    { direction: 'long', entryPrice: 100 });
  assert.equal(contract, null);
  assert.equal(reason, 'No contract between 30 and 50 delta');
});

test('chooseContract nothing-fits: spread too wide', () => {
  const { contract, reason } = chooseContract(
    [{ symbol: 'X', type: 'call', strike: 100, expiry: '2026-11-21', delta: 0.42, bid: 1.0, ask: 1.3 }],
    { direction: 'long', entryPrice: 100 });
  assert.equal(contract, null);
  assert.equal(reason, 'No contract with a tight enough spread');
});

test('chooseContract nothing-fits: no bid, and empty chain', () => {
  const noBid = chooseContract(
    [{ symbol: 'X', type: 'call', strike: 100, expiry: '2026-11-21', delta: 0.42, bid: 0, ask: 0.5 }],
    { direction: 'long', entryPrice: 100 });
  assert.equal(noBid.contract, null);
  assert.equal(noBid.reason, 'No contract with a tight enough spread');
  const empty = chooseContract([], { direction: 'long', entryPrice: 100 });
  assert.equal(empty.reason, 'No options in the chain');
});
