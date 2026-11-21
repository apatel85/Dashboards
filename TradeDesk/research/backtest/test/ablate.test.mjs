/**
 * test/ablate.test.mjs — ablation zeroes exactly one score component.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeScore } from '../../../pipeline/lib/cmo/index.mjs';
import { ablateInputs } from '../engine/scan.mjs';
import { PARAMS } from '../../../pipeline/lib/cmo/index.mjs';

const fullInputs = {
  setupQuality: 'full',
  catalyst: { surprise: 0.2, guidanceRaised: true, hardNews: null, softNews: null, gapPct: 12 },
  growth: { epsYoY: 0.3, salesYoY: 0.25, accelerating: true },
  rs: 92,
  rsLineNewHigh: true,
  rvol: 3.5,
  openingRvol: null,
  groupRankPct: 85,
  options: { callVolMult: 4, dteVolumeGtOi: true, insiderCluster: true, spreadOk: true },
};

test('baseline score is the sum of all components', () => {
  const s = tradeScore(fullInputs, PARAMS);
  // setup 30 + catalyst 20 + growth 10 + rs 15 + volume 15 + group 5 + options 5 = 100
  assert.equal(s.score, 100);
  assert.equal(s.grade, 'A+');
});

test('ablate catalyst zeroes 20 points, nothing else', () => {
  const s = tradeScore(ablateInputs(fullInputs, 'catalyst'), PARAMS);
  assert.equal(s.score, 80);
  assert.equal(s.components.find((c) => c.key === 'catalyst').points, 0);
  assert.equal(s.components.find((c) => c.key === 'growth').points, 10);
});

test('ablate rs zeroes 15 points', () => {
  const s = tradeScore(ablateInputs(fullInputs, 'rs'), PARAMS);
  assert.equal(s.score, 85);
  assert.equal(s.components.find((c) => c.key === 'rs').points, 0);
});

test('ablate volume zeroes 15 points', () => {
  const s = tradeScore(ablateInputs(fullInputs, 'volume'), PARAMS);
  assert.equal(s.score, 85);
});

test('ablate group zeroes 5 points', () => {
  const s = tradeScore(ablateInputs(fullInputs, 'group'), PARAMS);
  assert.equal(s.score, 95);
});

test('ablate growth / options on an all-null baseline is vacuous', () => {
  const bare = {
    setupQuality: 'met', catalyst: null, growth: null, rs: 50, rsLineNewHigh: false,
    rvol: 1, openingRvol: null, groupRankPct: null, options: null,
  };
  const base = tradeScore(bare, PARAMS).score;
  assert.equal(tradeScore(ablateInputs(bare, 'growth'), PARAMS).score, base);
  assert.equal(tradeScore(ablateInputs(bare, 'options'), PARAMS).score, base);
});

test('ablate unknown component throws', () => {
  assert.throws(() => ablateInputs(fullInputs, 'nope'), /unknown ablation component/);
});
