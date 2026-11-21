/**
 * util.mjs — tiny pure helpers shared inside pipeline/lib/cmo/.
 *
 * Deliberately NOT imported from pipeline/lib/util.mjs: that file imports
 * `fs` and `path`, and nothing in lib/cmo may import fs (WO-01 accept
 * rule). These are re-implemented here in a few lines, pure.
 */

/** Clamp n into [lo, hi]. */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Arithmetic mean of an array of numbers (null on empty). */
export function mean(xs) {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation (null when fewer than 2 values). */
export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** Round to n decimals (null-safe). */
export function round(n, digits = 2) {
  return n == null || !Number.isFinite(n) ? null : parseFloat(n.toFixed(digits));
}

/** True range of bar i (needs the previous bar's close). */
export function trueRange(bars, i) {
  const b = bars[i];
  const p = bars[i - 1];
  if (!b || !p) return null;
  return Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c));
}
