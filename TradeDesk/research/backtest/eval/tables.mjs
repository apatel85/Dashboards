/**
 * eval/tables.mjs — base rates, in-sample probability tables, lookups.
 *
 * Pure functions. Base rates come from the prepared forward-move arrays
 * (every liquid session, every ticker): the unconditional chance that a
 * liquid stock moves ≥ tier% within the window. Probability tables are
 * built from IN-SAMPLE triggered candidates only; OOS candidates are
 * scored against them via the library's lookupProbability (fallback
 * full → no-atr → no-adr → merged-grade, min 100 cases).
 */
import { adrBand, lookupProbability, wilsonInterval } from '../../../pipeline/lib/cmo/index.mjs';
import { WINDOWS } from '../engine/prepare.mjs';
import { TIERS } from '../engine/scan.mjs';

/** Quarter label for a date: "2025-Q1". */
export function quarterOf(date) {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/**
 * Base rates over all liquid sessions in [from, to].
 * Returns { byBand: {long|short: {band: {window: {tier: {cases, hits, p}}}}},
 *           pooled: {long|short: {window: {tier: {cases, hits, p}}}},
 *           byQuarter: {quarter: {long|short: {window: {tier: {cases, hits, p}}}}} }.
 * A session counts for a window only when the forward window is complete.
 */
export function computeBaseRates(prepared, params, from, to) {
  const byBand = { long: {}, short: {} };
  const pooled = { long: {}, short: {} };
  const byQuarter = {};
  const add = (store, dir, band, w, t, hit) => {
    store[dir] ??= {};
    store[dir][band] ??= {};
    store[dir][band][w] ??= {};
    store[dir][band][w][t] ??= { cases: 0, hits: 0 };
    const cell = store[dir][band][w][t];
    cell.cases += 1;
    if (hit) cell.hits += 1;
  };
  const addPooled = (store, dir, w, t, hit) => {
    store[dir] ??= {};
    store[dir][w] ??= {};
    store[dir][w][t] ??= { cases: 0, hits: 0 };
    const cell = store[dir][w][t];
    cell.cases += 1;
    if (hit) cell.hits += 1;
  };
  for (const p of prepared.values()) {
    for (let i = 0; i < p.bars.length; i++) {
      const d = p.dates[i];
      if (d < from || d > to || !p.liquid[i]) continue;
      const band = adrBand(p.adr20[i], params);
      if (!band) continue;
      const q = quarterOf(d);
      byQuarter[q] ??= { long: {}, short: {} };
      for (const w of WINDOWS) {
        const fl = p.fwdLong[w][i];
        const fs = p.fwdShort[w][i];
        if (fl == null || fs == null) continue; // incomplete forward window
        for (const t of TIERS) {
          add(byBand, 'long', band, w, t, fl >= t);
          add(byBand, 'short', band, w, t, fs >= t);
          addPooled(pooled, 'long', w, t, fl >= t);
          addPooled(pooled, 'short', w, t, fs >= t);
          addPooled(byQuarter[q], 'long', w, t, fl >= t);
          addPooled(byQuarter[q], 'short', w, t, fs >= t);
        }
      }
    }
  }
  // Set p on every { cases, hits } cell, whatever the nesting depth.
  const finishNode = (node) => {
    if (node && typeof node === 'object') {
      if (typeof node.cases === 'number' && typeof node.hits === 'number') {
        node.p = node.cases ? node.hits / node.cases : null;
        return;
      }
      for (const k of Object.keys(node)) finishNode(node[k]);
    }
  };
  finishNode(byBand);
  finishNode(pooled);
  for (const q of Object.keys(byQuarter)) finishNode(byQuarter[q]);
  return { byBand, pooled, byQuarter };
}

/**
 * In-sample probability rows, per tier × window.
 * rows[tier][window] = [{ setup, direction, grade, adrBand, atrBand,
 * cases, hits, p, ciLow, ciHigh }] aggregated by bucket key.
 * `useAblated`: grade/bucket from the ablated score instead of baseline.
 * `includeRegimeExcluded`: true only for the regime ablation.
 */
export function buildTierRows(candidates, { params, useAblated = false, includeRegimeExcluded = false }) {
  const rows = {};
  for (const t of TIERS) rows[t] = {};
  for (const w of WINDOWS) {
    for (const t of TIERS) rows[t][w] = new Map();
  }
  for (const c of candidates) {
    if (!c.triggered || !c.inSample) continue;
    if (c.regimeExcluded && !includeRegimeExcluded) continue;
    const grade = useAblated && c.ablated ? c.ablated.grade : c.grade;
    const key = useAblated && c.ablated ? c.ablatedBucketKey : c.bucketKey;
    const [, , g, ab, tb] = key.split('|');
    for (const w of WINDOWS) {
      if (!c.complete[w]) continue;
      for (const t of TIERS) {
        const hit = c.outcomes[w][`hit${TIERS.indexOf(t) + 1}`];
        const cell = rows[t][w].get(key) || {
          setup: c.setup, direction: c.direction, grade, adrBand: ab, atrBand: tb, cases: 0, hits: 0,
        };
        cell.cases += 1;
        if (hit) cell.hits += 1;
        rows[t][w].set(key, cell);
      }
    }
  }
  const out = {};
  for (const t of TIERS) {
    out[t] = {};
    for (const w of WINDOWS) {
      out[t][w] = [...rows[t][w].values()].map((r) => {
        const { p, low, high } = wilsonInterval(r.hits, r.cases, params.buckets.wilsonZ90);
        return { ...r, p, ciLow: low, ciHigh: high };
      });
    }
  }
  return out;
}

/** Lookup for one candidate in one tier/window table; returns null when no level reaches 100 cases. */
export function lookupFor(candRows, candidate, params, useAblated = false) {
  const cand = {
    setup: candidate.setup,
    direction: candidate.direction,
    grade: useAblated && candidate.ablated ? candidate.ablated.grade : candidate.grade,
    adrPct: candidate.adrPct,
    atrDistance: candidate.atrDistance,
  };
  return lookupProbability(candRows, cand, params);
}

/** Expected move (%) from tier probabilities (spec §3.1): tail beyond 15% counts as 15%. */
export function expectedMove(p1, p2, p3) {
  if (p1 == null || p2 == null || p3 == null) return null;
  return 5 * (p1 - p2) + 10 * (p2 - p3) + 15 * p3;
}
