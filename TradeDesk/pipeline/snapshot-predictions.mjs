#!/usr/bin/env node
/**
 * snapshot-predictions.mjs — record each day's suggestions into a persistent
 * history file so the tracker can grade them later.
 *
 * Reads daily-brief.json (breakout candidates) + lotto.json (0DTE/1DTE plays)
 * from OUT_DIR and appends one record per suggestion to
 * pipeline/data/prediction-history.jsonl. Idempotent: a re-run on the same
 * day adds nothing (keyed on date + type + ticker).
 *
 * Records only what the pipeline actually suggested that day — never
 * fabricates past predictions. Runs in refresh.sh after build-brief (step 9)
 * and build-lotto (step 5). Non-fatal by design.
 *
 * $0, keyless (pure file I/O — no network).
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const HIST = join(ROOT, 'data', 'prediction-history.jsonl');

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

/** Fallback: pull the trigger level out of the scanner's trigger sentence. */
function parseTrigger(text, direction) {
  if (typeof text !== 'string') return null;
  const m = text.match(/\$([\d,]+\.\d+)/);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function loadExistingKeys() {
  const keys = new Set();
  if (!existsSync(HIST)) return keys;
  for (const line of readFileSync(HIST, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      keys.add(`${r.date}|${r.type}|${String(r.ticker || '').toUpperCase()}`);
    } catch { /* skip a bad line, never fail the snapshot */ }
  }
  return keys;
}

function main() {
  const brief = readJson('daily-brief.json');
  const lotto = readJson('lotto.json');
  const seen = loadExistingKeys();
  const fresh = [];

  // ── breakouts ────────────────────────────────────────────────────────
  const briefDate = brief?.brief_date || null;
  const breakoutCands = Array.isArray(brief?.breakout_candidates) ? brief.breakout_candidates : [];
  let bNew = 0;
  for (const c of breakoutCands) {
    const ticker = String(c.ticker || '').toUpperCase();
    if (!ticker || !briefDate) continue;
    const key = `${briefDate}|breakout|${ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({
      date: briefDate,
      ticker,
      type: 'breakout',
      name: typeof c.name === 'string' && c.name !== ticker ? c.name : null,
      score: c.score ?? null,
      setup: c.setup ?? null,
      price: c.price ?? null,
      trigger: c.trigger_price ?? null,
      stop: c.stop_price ?? null,
      outcome: null,
      graded_at: null,
    });
    bNew++;
  }

  // ── lotto plays ──────────────────────────────────────────────────────
  const lottoDate = lotto?.as_of || null;
  const lottoCands = Array.isArray(lotto?.candidates) ? lotto.candidates : [];
  let lNew = 0;
  for (const c of lottoCands) {
    const ticker = String(c.ticker || '').toUpperCase();
    if (!ticker || !lottoDate) continue;
    const key = `${lottoDate}|lotto|${ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // The ticket rides the primary chain: 0DTE when it exists, else 1DTE.
    const is0dte = c.expiry_0dte != null;
    const ticket = c.suggested_ticket || null;
    fresh.push({
      date: lottoDate,
      ticker,
      type: 'lotto',
      direction: c.direction || null,
      setup: c.setup ?? null,
      score: c.score ?? null,
      spot: c.spot ?? null,
      trigger: c.trigger_level ?? parseTrigger(c.entry_trigger, c.direction),
      expiry: is0dte ? c.expiry_0dte : (c.expiry_1dte || null),
      expiry_kind: is0dte ? '0DTE' : '1DTE',
      strike: ticket?.strike ?? null,
      premium: ticket?.premium ?? null,
      breakeven: ticket?.breakeven ?? null,
      expected_move_pct: c.expected_move_pct ?? null,
      iv_pct: c.iv_pct ?? null,
      outcome: null,
      graded_at: null,
    });
    lNew++;
  }

  if (fresh.length) {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    appendFileSync(HIST, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  console.log(`[predictions] snapshot: +${bNew} breakout, +${lNew} lotto for ${briefDate || lottoDate || 'unknown date'} (${fresh.length} new, ${seen.size} total keys)`);
}

main();
