/**
 * test/tables.test.mjs — lookupProbability fallback ladder + Wilson spot
 * checks + buildTierRows aggregation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupProbability, wilsonInterval } from '../../../pipeline/lib/cmo/index.mjs';
import { buildTierRows } from '../eval/tables.mjs';
import { PARAMS } from '../../../pipeline/lib/cmo/index.mjs';

const row = (setup, direction, grade, adrBand, atrBand, cases, hits) => ({
  setup, direction, grade, adrBand, atrBand, cases, hits,
});

test('lookupProbability: full bucket hit', () => {
  const rows = [row('A1', 'long', 'A', 'adr3-5', 'atr0-1', 150, 90)];
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5 }, PARAMS);
  assert.equal(r.fallback, 'full');
  assert.equal(r.cases, 150);
  assert.equal(r.hits, 90);
  assert.ok(Math.abs(r.p - 0.6) < 1e-12);
});

test('lookupProbability: falls back to no-atr when the exact ATR band is thin', () => {
  const rows = [
    row('A1', 'long', 'A', 'adr3-5', 'atr0-1', 40, 20), // < 100: ignored at full
    row('A1', 'long', 'A', 'adr3-5', 'atr1-2', 120, 60),
  ];
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5 }, PARAMS);
  assert.equal(r.fallback, 'no-atr');
  assert.equal(r.cases, 160);
  assert.equal(r.hits, 80);
});

test('lookupProbability: falls back to no-adr when the ADR band is thin', () => {
  const rows = [
    row('A1', 'long', 'A', 'adr3-5', 'atr0-1', 40, 20),
    row('A1', 'long', 'A', 'adr5-8', 'atr0-1', 110, 55),
  ];
  const r = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5 }, PARAMS);
  assert.equal(r.fallback, 'no-adr');
  assert.equal(r.cases, 150);
  assert.equal(r.hits, 75);
});

test('lookupProbability: merged-grade pools A/A+ only, and only for A/A+ candidates', () => {
  const rows = [
    row('A1', 'long', 'A', 'adr3-5', 'atr0-1', 40, 20),
    row('A1', 'long', 'A+', 'adr5-8', 'atr1-2', 70, 35),
  ];
  const a = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5 }, PARAMS);
  assert.equal(a.fallback, 'merged-grade');
  assert.equal(a.cases, 110);
  const c = lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'C', adrPct: 4, atrDistance: 0.5 }, PARAMS);
  assert.equal(c, null); // C never merges
});

test('lookupProbability: null when nothing reaches 100 cases', () => {
  const rows = [row('A1', 'long', 'A', 'adr3-5', 'atr0-1', 99, 50)];
  assert.equal(lookupProbability(rows, { setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5 }, PARAMS), null);
  assert.equal(lookupProbability([], { setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5 }, PARAMS), null);
});

test('wilsonInterval spot checks (independently recomputed in Python for WO-01)', () => {
  const w1 = wilsonInterval(68, 100);
  assert.ok(Math.abs(w1.low - 0.599391) < 1e-6);
  assert.ok(Math.abs(w1.high - 0.751124) < 1e-6);
  const w2 = wilsonInterval(12, 120);
  assert.ok(Math.abs(w2.low - 0.063406) < 1e-6);
  assert.ok(Math.abs(w2.high - 0.154237) < 1e-6);
});

function fakeCand(over) {
  return {
    setup: 'A1', direction: 'long', grade: 'A', adrPct: 4, atrDistance: 0.5,
    bucketKey: 'A1|long|A|adr3-5|atr0-1', triggered: true, inSample: true,
    regimeExcluded: false, ablated: null, ablatedBucketKey: null,
    outcomes: {
      3: { hit1: true, hit2: false, hit3: false },
      5: { hit1: true, hit2: false, hit3: false },
      10: { hit1: true, hit2: false, hit3: false },
      20: { hit1: true, hit2: true, hit3: false },
    },
    complete: { 3: true, 5: true, 10: true, 20: true },
    ...over,
  };
}

test('buildTierRows aggregates by bucket and drops OOS / untriggered / incomplete', () => {
  const cands = [
    fakeCand(),
    fakeCand(),
    fakeCand({ inSample: false }), // OOS: excluded
    fakeCand({ triggered: false }), // excluded
    fakeCand({ complete: { 3: true, 5: true, 10: false, 20: true } }), // 10w incomplete: excluded from w10 only
  ];
  const rows = buildTierRows(cands, { params: PARAMS });
  const w10t1 = rows[5][10];
  assert.equal(w10t1.length, 1);
  assert.equal(w10t1[0].cases, 2);
  assert.equal(w10t1[0].hits, 2);
  const w3t1 = rows[5][3];
  assert.equal(w3t1[0].cases, 3); // the incomplete-10w candidate still counts for w3
  const w20t2 = rows[10][20];
  assert.equal(w20t2[0].hits, 3); // all three counted candidates hit tier 2 in 20 sessions
});
