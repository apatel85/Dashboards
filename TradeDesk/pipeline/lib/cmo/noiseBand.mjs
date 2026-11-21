/**
 * noiseBand.mjs — intraday-momentum noise band, Module C (plan §6.3).
 *
 * NOT in the spec §5 file table (the table names no file for Module C);
 * WO-01 adds this file so the challenger has the same one-implementation
 * treatment as everything else. Per SOURCES.md §8 decision 7, Module C
 * is a CHALLENGER (its edge decayed post-publication: out-of-sample
 * Sharpe 0.39), not a core module — the functions exist so WO-03 can
 * test it, not so the screen can recommend it.
 *
 * Noise for a half-hour mark = the 14-session average of
 * |price at that time ÷ that day's open − 1|.
 * Upper band = max(today's open, prior close) × (1 + noise);
 * lower band mirrors it (min × (1 − noise)).
 * Long when the price is above the upper band at a half-hour mark;
 * short when below the lower band. Exit on a cross back through the
 * band or session VWAP, or at 15:55 ET (plan §6.3).
 *
 * Per spec §7.1 the index-momentum rules in plan §6.3 are NOT built
 * (index plays deferred, Ankit 2026-11-20); this module is the
 * signal maths only, usable on any underlying the caller supplies.
 */
import { PARAMS } from './params.mjs';
import { mean } from './util.mjs';

/**
 * noiseValue(marks): mean |price/open − 1| over the marks.
 * `marks` = [{ open, price }] — one entry per session, price at the
 * same half-hour mark. Needs at least 1 mark; the plan uses 14.
 */
export function noiseValue(marks) {
  if (!marks || !marks.length) return null;
  const xs = [];
  for (const m of marks) {
    if (m.open && m.price != null) xs.push(Math.abs(m.price / m.open - 1));
  }
  return xs.length ? mean(xs) : null;
}

/** noiseBands({ open, priorClose, noise }) → { upper, lower }. */
export function noiseBands({ open, priorClose, noise }) {
  if (open == null || priorClose == null || noise == null) return null;
  return {
    upper: Math.max(open, priorClose) * (1 + noise),
    lower: Math.min(open, priorClose) * (1 - noise),
  };
}

/** noiseSignal(bands, price) → { signal, price, upper, lower }. */
export function noiseSignal(bands, price) {
  if (!bands || price == null) return { signal: 'none', price, upper: bands?.upper ?? null, lower: bands?.lower ?? null };
  if (price > bands.upper) return { signal: 'long', price, upper: bands.upper, lower: bands.lower };
  if (price < bands.lower) return { signal: 'short', price, upper: bands.upper, lower: bands.lower };
  return { signal: 'none', price, upper: bands.upper, lower: bands.lower };
}
