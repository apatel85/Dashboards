/**
 * setups.test.mjs — each detector against three REAL historical examples
 * and three near-misses (bars in test/fixtures/, fetched from Yahoo).
 *
 * Examples must detect (non-null, right setup + direction). Near-misses
 * must return null AND the recorded failing criterion must be verified
 * by recomputing the underlying indicator in the test — so a near-miss
 * is a real near-miss, not a fixture that fails for another reason.
 *
 * The ORB and noise-band fixture tests use the real minute bars the
 * scan saved (orb-1m-*.json, noiseband-spy.json).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectA1, detectA2, detectA1S, detectA2S, detectA3S, positionSizing } from '../setups.mjs';
import { gapInfo, rvol, priorMove, trendTemplate, contraction } from '../indicators.mjs';
import { openingRange, orbSignal } from '../orb.mjs';
import { noiseValue, noiseBands, noiseSignal } from '../noiseBand.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
const fixtures = (setup, kind) => readdirSync(FIX)
  .filter((f) => f.startsWith(`${setup}-`) && f.endsWith(`-${kind}.json`))
  .sort()
  .map(load);

const DETECTORS = {
  A1: { fn: detectA1, direction: 'long' },
  A2: { fn: detectA2, direction: 'long' },
  A1S: { fn: detectA1S, direction: 'short' },
  A2S: { fn: detectA2S, direction: 'short' },
  A3S: { fn: detectA3S, direction: 'short' },
};

for (const [setup, { fn, direction }] of Object.entries(DETECTORS)) {
  const examples = fixtures(setup, 'example');
  const nearMisses = fixtures(setup, 'nearmiss');
  test(`${setup}: exactly 3 real examples and 3 near-misses in fixtures`, () => {
    assert.equal(examples.length, 3, `expected 3 ${setup} examples, found ${examples.length}`);
    assert.equal(nearMisses.length, 3, `expected 3 ${setup} near-misses, found ${nearMisses.length}`);
  });

  for (const fx of examples) {
    test(`${setup} example: ${fx.ticker} ${fx.signalDate} detects — ${fx.why}`, () => {
      const bars = fx.bars;
      const index = bars.length - 1;
      const ctx = { rs: fx.rsPercentile ?? undefined, marketCap: fx.marketCapUsd ?? undefined };
      const r = fn(bars, index, ctx);
      assert.ok(r, `expected ${setup} to detect on ${fx.ticker} ${fx.signalDate}`);
      assert.equal(r.setup, setup);
      assert.equal(r.direction, direction);
      assert.ok(r.pivot != null && r.invalidLevel != null);
      assert.ok(Array.isArray(r.notes) && r.notes.length > 0);
    });
  }

  for (const fx of nearMisses) {
    test(`${setup} near-miss: ${fx.ticker} ${fx.signalDate} does NOT detect — fails ${fx.failedCheck?.criterion}`, () => {
      const bars = fx.bars;
      const index = bars.length - 1;
      const ctx = { rs: fx.rsPercentile ?? undefined, marketCap: fx.marketCapUsd ?? undefined };
      assert.equal(fn(bars, index, ctx), null);
      assert.ok(fx.failedCheck, 'near-miss fixture must record which criterion fails');
      verifyFailedCheck(setup, bars, index, ctx, fx.failedCheck);
    });
  }
}

/**
 * Recompute the recorded failing criterion from the bars and assert it
 * really is the (only) reason the detector returned null.
 */
function verifyFailedCheck(setup, bars, index, ctx, failed) {
  const { criterion, value } = failed;
  if (criterion === 'gap') {
    const g = gapInfo(bars, index).gapPct;
    assert.ok(Math.abs(g - value) < 0.5, `gap ${g} vs recorded ${value}`);
    const need = setup === 'A1' ? 10 : -10;
    assert.ok(setup === 'A1' ? g < need : g > need, `gap ${g} should fail the ${need}% bar`);
  } else if (criterion === 'rvol') {
    const rv = rvol(bars, index, 50);
    assert.ok(Math.abs(rv - value) < 0.05, `rvol ${rv} vs recorded ${value}`);
    assert.ok(rv < 2, `rvol ${rv} should fail the 2× bar`);
  } else if (criterion === 'prior63') {
    const rise = (bars[index - 1].c / bars[index - 64].c - 1) * 100;
    assert.ok(Math.abs(rise - value) < 1, `prior-63 rise ${rise} vs recorded ${value}`);
    assert.ok(rise > 50, `prior-63 rise ${rise} should exceed the 50% bar`);
  } else if (criterion === 'close-location') {
    const b = bars[index];
    const loc = (b.c - b.l) / (b.h - b.l);
    assert.ok(Math.abs(loc - value) < 0.05, `close location ${loc} vs recorded ${value}`);
    if (setup === 'A1') assert.ok(loc < 0.75);
    else assert.ok(loc > 0.25);
  } else if (criterion === 'rs') {
    assert.ok(ctx.rs != null && Math.abs(ctx.rs - value) < 2, `rs ${ctx.rs} vs recorded ${value}`);
    if (setup === 'A2') assert.ok(ctx.rs < 80);
    else assert.ok(ctx.rs > 20);
  } else if (criterion === 'template') {
    const t = trendTemplate(bars, index, ctx.rs ?? null);
    assert.equal(t.pass, false);
    const failedKeys = t.checks.filter((k) => !k.pass).map((k) => k.key);
    assert.ok(failedKeys.length > 0, 'template should fail at least one check');
  } else if (criterion === 'prior-move') {
    const pm = priorMove(bars, index);
    assert.ok(Math.abs(pm.maxRisePct - value) < 1, `prior move ${pm.maxRisePct} vs recorded ${value}`);
    assert.ok(pm.maxRisePct < 30);
  } else if (criterion === 'contraction') {
    const c = contraction(bars, index);
    assert.equal(c.pass, false);
  } else if (criterion === 'tightening') {
    // A2S only: recompute the flag halves the same way detectA2S does.
    const from = Math.max(0, index - 40);
    let flagLow = Infinity;
    let flagStart = null;
    for (let k = from; k <= index; k++) {
      if (bars[k].l < flagLow) { flagLow = bars[k].l; flagStart = k; }
    }
    const flagLength = index - flagStart;
    const mid = flagStart + Math.floor(flagLength / 2);
    const range1 = Math.max(...bars.slice(flagStart, mid + 1).map((b) => b.h)) -
      Math.min(...bars.slice(flagStart, mid + 1).map((b) => b.l));
    const range2 = Math.max(...bars.slice(mid + 1, index + 1).map((b) => b.h)) -
      Math.min(...bars.slice(mid + 1, index + 1).map((b) => b.l));
    assert.ok(Math.abs(range2 - value) < 0.5, `second-half range ${range2} vs recorded ${value}`);
    assert.ok(Math.abs(range1 - failed.threshold) < 0.5, `first-half range ${range1} vs recorded ${failed.threshold}`);
    assert.ok(range2 >= range1, `second-half range ${range2} should not be narrower than first-half ${range1}`);
  } else if (criterion === 'flag-length') {
    // A2S only: recompute the flag length the same way detectA2S does.
    const from = Math.max(0, index - 40);
    let flagLow = Infinity;
    let flagStart = null;
    for (let k = from; k <= index; k++) {
      if (bars[k].l < flagLow) { flagLow = bars[k].l; flagStart = k; }
    }
    const flagLength = index - flagStart;
    assert.equal(flagLength, value);
    assert.ok(flagLength < 10, `flag length ${flagLength} should fail the 10-session minimum`);
  } else if (criterion === 'five-session-rise') {
    const rise = (bars[index].c / bars[index - 5].c - 1) * 100;
    assert.ok(Math.abs(rise - value) < 2, `5-session rise ${rise} vs recorded ${value}`);
    assert.ok(rise < 50, `5-session rise ${rise} should fail the large-cap 50% bar`);
  } else if (criterion === 'up-days') {
    let streak = 0;
    for (let k = index; k > 0; k--) {
      if (bars[k].c > bars[k - 1].c) streak++;
      else break;
    }
    assert.equal(streak, value);
    assert.ok(streak < 3);
  } else {
    throw new Error(`unknown failedCheck criterion: ${criterion}`);
  }
}

test('ORB fixture: real 1-minute bars give the recorded opening range and signal', () => {
  const files = readdirSync(FIX).filter((f) => f.startsWith('orb-1m-'));
  assert.ok(files.length >= 1, 'expected at least one orb-1m fixture');
  for (const f of files) {
    const fx = load(f);
    const range = openingRange(fx.minuteBars, 5);
    // Recompute the range by hand: max high / min low of the first 5 bars.
    const first5 = fx.minuteBars.slice(0, 5);
    assert.equal(range.high, Math.max(...first5.map((b) => b.h)));
    assert.equal(range.low, Math.min(...first5.map((b) => b.l)));
    // The signal from the first bar after the range must match orbSignal.
    const after = fx.minuteBars.slice(5);
    const firstBreak = after.find((b) => b.c > range.high || b.c < range.low);
    if (firstBreak) {
      const s = orbSignal(range, { price: firstBreak.c }, { atr14: fx.atr14 ?? 2 });
      assert.equal(s.signal, firstBreak.c > range.high ? 'long' : 'short');
    }
  }
});

test('noise-band fixture: real SPY 5-minute marks give a sane noise value and ordered bands', () => {
  const fx = load('noiseband-spy.json');
  assert.ok(fx.marks.length >= 14, `expected ≥14 marks, got ${fx.marks.length}`);
  const noise = noiseValue(fx.marks);
  assert.ok(noise > 0 && noise < 0.1, `noise ${noise} should be a small positive fraction`);
  const bands = noiseBands({ open: fx.todayOpen, priorClose: fx.priorClose, noise });
  assert.ok(bands.upper > Math.max(fx.todayOpen, fx.priorClose));
  assert.ok(bands.lower < Math.min(fx.todayOpen, fx.priorClose));
  assert.equal(noiseSignal(bands, bands.upper * 1.01).signal, 'long');
  assert.equal(noiseSignal(bands, bands.lower * 0.99).signal, 'short');
  assert.equal(noiseSignal(bands, (bands.upper + bands.lower) / 2).signal, 'none');
});

/**
 * positionSizing — Rev 5 (Ankit 2026-11-22): the 3% is the max LOSS per
 * trade as a share of capital, enforced by position sizing. Units are
 * percent throughout (20 = 20% of capital).
 */

test('positionSizing: wide stop sizes down so risk is exactly 3% (risk binds)', () => {
  const s = positionSizing(22.9);
  assert.ok(s);
  assert.ok(Math.abs(s.positionPct - 13.10) < 0.01, `position ${s.positionPct} vs 13.10`);
  assert.ok(Math.abs(s.riskPct - 3) < 1e-9, `risk ${s.riskPct} vs 3`);
  assert.ok(Math.abs(s.tierR1 - 5 / 22.9) < 1e-9);
  assert.ok(Math.abs(s.tierR2 - 10 / 22.9) < 1e-9);
  assert.ok(Math.abs(s.tierR3 - 15 / 22.9) < 1e-9);
  assert.equal(s.sizeBinding, 'risk');
});

test('positionSizing: AES hand case — stop 6.3% away, 20% single-position cap binds', () => {
  const s = positionSizing(6.3);
  assert.ok(s);
  assert.equal(s.positionPct, 20);
  assert.ok(Math.abs(s.riskPct - 1.26) < 1e-9, `risk ${s.riskPct} vs 1.26`);
  assert.ok(Math.abs(s.tierR1 - 0.7937) < 1e-3);
  assert.ok(Math.abs(s.tierR2 - 1.5873) < 1e-3);
  assert.ok(Math.abs(s.tierR3 - 2.3810) < 1e-3);
  assert.equal(s.sizeBinding, 'single-max');
});

test('positionSizing: stop exactly 15% away — both caps bind at once (risk 3%, Tier 3 exactly 1R)', () => {
  const s = positionSizing(15);
  assert.equal(s.positionPct, 20);
  assert.ok(Math.abs(s.riskPct - 3) < 1e-9);
  assert.ok(Math.abs(s.tierR3 - 1) < 1e-9);
  assert.equal(s.sizeBinding, 'single-max');
});

test('positionSizing: tight stop — cap binds, risk well under 3%', () => {
  const s = positionSizing(2);
  assert.equal(s.positionPct, 20);
  assert.ok(Math.abs(s.riskPct - 0.4) < 1e-9);
  assert.equal(s.sizeBinding, 'single-max');
});

test('positionSizing: no valid size without a real stop distance', () => {
  for (const bad of [null, undefined, 0, -5, NaN, Infinity]) {
    assert.equal(positionSizing(bad), null, `stopDist ${bad} should give null`);
  }
});

test('positionSizing: risk never exceeds 3% and position never exceeds 20% (sweep)', () => {
  for (let d = 0.1; d <= 100; d *= 1.5) {
    const s = positionSizing(d);
    assert.ok(s.riskPct <= 3 + 1e-9, `stop ${d}: risk ${s.riskPct}`);
    assert.ok(s.positionPct <= 20 + 1e-9, `stop ${d}: position ${s.positionPct}`);
    assert.ok(s.positionPct > 0);
  }
});

// Every real example detection carries valid sizing and is tradeable
// (all fixture closes are above the $10 short minimum).
for (const [setup, { fn }] of Object.entries(DETECTORS)) {
  for (const fx of fixtures(setup, 'example')) {
    test(`${setup} sizing: ${fx.ticker} ${fx.signalDate} — valid size, risk ≤ 3%, tradeable`, () => {
      const bars = fx.bars;
      const index = bars.length - 1;
      const ctx = { rs: fx.rsPercentile ?? undefined, marketCap: fx.marketCapUsd ?? undefined };
      const r = fn(bars, index, ctx);
      assert.ok(r, 'expected detection');
      assert.ok(r.stopDist != null && r.stopDist > 0, `stopDist ${r.stopDist}`);
      assert.ok(r.positionPct != null && r.positionPct > 0 && r.positionPct <= 20, `positionPct ${r.positionPct}`);
      assert.ok(r.riskPct != null && r.riskPct > 0 && r.riskPct <= 3 + 1e-9, `riskPct ${r.riskPct}`);
      assert.ok(Math.abs(r.tierR1 - 5 / r.stopDist) < 1e-9, `tierR1 ${r.tierR1} vs ${5 / r.stopDist}`);
      assert.ok(Math.abs(r.tierR2 - 10 / r.stopDist) < 1e-9);
      assert.ok(Math.abs(r.tierR3 - 15 / r.stopDist) < 1e-9);
      assert.ok(['single-max', 'risk'].includes(r.sizeBinding), `sizeBinding ${r.sizeBinding}`);
      assert.equal(r.tradeable, true);
      assert.ok(r.notes.some((n) => n.startsWith('Position ')), 'sizing note present');
    });
  }
}
