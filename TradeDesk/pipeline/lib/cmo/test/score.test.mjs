/** tradeScore / readinessScore tests (plan §5, spec §6.3). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeScore, readinessScore, gradeFor } from '../score.mjs';

test('gradeFor boundaries: A+ ≥ 85, A 75–84, B 60–74, C < 60', () => {
  assert.equal(gradeFor(100), 'A+');
  assert.equal(gradeFor(85), 'A+');
  assert.equal(gradeFor(84.9), 'A');
  assert.equal(gradeFor(75), 'A');
  assert.equal(gradeFor(74.9), 'B');
  assert.equal(gradeFor(60), 'B');
  assert.equal(gradeFor(59.9), 'C');
  assert.equal(gradeFor(0), 'C');
});

const fullTrade = {
  setupQuality: 'full',
  catalyst: { surprise: 0.2, guidanceRaised: true, hardNews: false, softNews: false, gapPct: 12 },
  growth: { epsYoY: 0.3, salesYoY: 0.25, accelerating: true },
  rs: 95, rsLineNewHigh: true, rvol: 3.5, openingRvol: 6, groupRankPct: 85,
  options: { callVolMult: 4, dteVolumeGtOi: true, insiderCluster: true, spreadOk: true },
};

test('tradeScore full marks → 100, A+', () => {
  const r = tradeScore(fullTrade);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A+');
  assert.deepEqual(r.components.map((k) => k.points), [30, 20, 10, 15, 15, 5, 5]);
  assert.ok(r.components.every((k) => k.label && k.note));
});

test('tradeScore empty → 0, C', () => {
  const r = tradeScore({ setupQuality: 'trigger', catalyst: {}, growth: {}, rs: 50, rvol: 1, groupRankPct: 30, options: {} });
  assert.equal(r.score, 0);
  assert.equal(r.grade, 'C');
});

test('tradeScore halves: setup met → 15, catalyst beat <10% → 10, RS 70–89 → 7.5', () => {
  const r = tradeScore({
    setupQuality: 'met',
    catalyst: { surprise: 0.05, guidanceRaised: false },
    growth: { epsYoY: 0.3, salesYoY: 0.05, accelerating: false },
    rs: 80, rsLineNewHigh: false, rvol: 2, groupRankPct: 60,
    options: { callVolMult: 4 },
  });
  // 15 + 10 + 5 + 7.5 + 7.5 + 2.5 + 2.5 = 50
  assert.equal(r.score, 50);
  assert.equal(r.grade, 'C');
});

test('tradeScore catalyst: gap ≥ 8% alone earns full catalyst marks', () => {
  const r = tradeScore({ ...fullTrade, catalyst: { surprise: 0, gapPct: 9 } });
  assert.equal(r.components.find((k) => k.key === 'catalyst').points, 20);
});

test('tradeScore RS ≥ 90 without a line high earns half', () => {
  const r = tradeScore({ ...fullTrade, rs: 92, rsLineNewHigh: false });
  assert.equal(r.components.find((k) => k.key === 'rs').points, 7.5);
});

test('tradeScore wide spreads zero the options component', () => {
  const r = tradeScore({ ...fullTrade, options: { callVolMult: 9, spreadOk: false } });
  assert.equal(r.components.find((k) => k.key === 'options').points, 0);
});

test('readinessScore full marks → 100, watchlist true', () => {
  const r = readinessScore({
    contractionDepthPct: 8, rs: 95, rsLineNewHigh: true, distToPivotPct: 2,
    catalystSessions: 5, growth: { epsYoY: 0.3, salesYoY: 0.25, accelerating: true }, optionsActive: true,
  });
  assert.equal(r.score, 100);
  assert.equal(r.watchlist, true);
});

test('readinessScore exactly 70 is on the watchlist', () => {
  const r = readinessScore({
    contractionDepthPct: 8, rs: 75, rsLineNewHigh: false, distToPivotPct: 2,
    catalystSessions: 5, growth: {}, optionsActive: false,
  });
  // 30 + 10 + 15 + 15 + 0 + 0 = 70
  assert.equal(r.score, 70);
  assert.equal(r.watchlist, true);
});

test('readinessScore empty → 0, not on the watchlist', () => {
  const r = readinessScore({
    contractionDepthPct: 40, rs: 40, rsLineNewHigh: false, distToPivotPct: 12,
    catalystSessions: null, growth: {}, optionsActive: false,
  });
  assert.equal(r.score, 0);
  assert.equal(r.watchlist, false);
});
