/** dteScore tests (spec §7.5). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dteScore } from '../dte-score.mjs';

const full = {
  openingRvol: 6, breakHeldMinutes: 6, gamma: 'short',
  signalDirection: 'long', priceVsVwap: 'above', regime: 'Green',
  expectedMovePct: 1.5, realisedDailyMovePct: 2.0, spreadPct: 3,
  signalTimeET: '10:15', dte: 0, eventLater: false, eventMinutes: null, dataAgeMinutes: 1,
};

test('dteScore full marks → 100, A+', () => {
  const r = dteScore(full);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A+');
  assert.equal(r.gated, false);
  assert.deepEqual(r.components.map((k) => k.points), [30, 15, 15, 15, 10, 10, 5]);
});

test('dteScore hard gate: event in the next 30 minutes → wait for the release', () => {
  const r = dteScore({ ...full, eventMinutes: 15 });
  assert.equal(r.gated, true);
  assert.equal(r.gateReason, 'wait for the release');
  assert.equal(r.score, 0);
});

test('dteScore hard gate: data older than 3 minutes → stale', () => {
  const r = dteScore({ ...full, dataAgeMinutes: 5 });
  assert.equal(r.gated, true);
  assert.equal(r.gateReason, 'data stale');
});

test('dteScore event later than 30 minutes is not a gate, but scores 0 on events', () => {
  const r = dteScore({ ...full, eventLater: true, eventMinutes: 120 });
  assert.equal(r.gated, false);
  assert.equal(r.components.find((k) => k.key === 'event').points, 0);
  assert.equal(r.score, 95);
});

test('dteScore time bands: 0DTE after 13:00 → 0; 1DTE 15:30–15:55 → 10', () => {
  const late0 = dteScore({ ...full, signalTimeET: '13:30', dte: 0 });
  assert.equal(late0.components.find((k) => k.key === 'time').points, 0);
  const mid0 = dteScore({ ...full, signalTimeET: '12:00', dte: 0 });
  assert.equal(mid0.components.find((k) => k.key === 'time').points, 5);
  const dte1 = dteScore({ ...full, signalTimeET: '15:40', dte: 1 });
  assert.equal(dte1.components.find((k) => k.key === 'time').points, 10);
  const early1 = dteScore({ ...full, signalTimeET: '14:00', dte: 1 });
  assert.equal(early1.components.find((k) => k.key === 'time').points, 0);
});

test('dteScore gamma long (pinning) → 0; pricing above 1.5× → 0', () => {
  const r = dteScore({ ...full, gamma: 'long', expectedMovePct: 4, realisedDailyMovePct: 2 });
  assert.equal(r.components.find((k) => k.key === 'gamma').points, 0);
  assert.equal(r.components.find((k) => k.key === 'pricing').points, 0);
});

test('dteScore short signal agrees with VWAP below + Red regime → full alignment', () => {
  const r = dteScore({ ...full, signalDirection: 'short', priceVsVwap: 'below', regime: 'Red' });
  assert.equal(r.components.find((k) => k.key === 'alignment').points, 15);
  const against = dteScore({ ...full, signalDirection: 'short', priceVsVwap: 'above', regime: 'Green' });
  assert.equal(against.components.find((k) => k.key === 'alignment').points, 0);
});
