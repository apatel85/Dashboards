#!/usr/bin/env node
/**
 * lib/util.mjs — small shared utilities for the TradeDesk pipeline.
 */
import fs from 'fs';
import path from 'path';

/** ISO date (YYYY-MM-DD) for a Date, in UTC. */
export function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Add n days to a YYYY-MM-DD string. */
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole-day difference: b - a (both YYYY-MM-DD). */
export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
}

/** "Wed Jul 1" style label for a YYYY-MM-DD date. */
export function dayLabel(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAY[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Parse "$4.45" / "$2,308,617,010,000" / "1.66" → number. Null on garbage. */
export function parseMoney(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const n = parseFloat(String(s).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Unix seconds → YYYY-MM-DD (UTC). */
export function unixToDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Epoch millis → ISO-8601 UTC string. */
export function msToIso(ms) {
  return new Date(ms).toISOString();
}

/**
 * Atomic JSON write: write to temp file, then rename. The UI never reads
 * a half-written file. Creates the directory if needed.
 */
export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
  const n = Array.isArray(data) ? data.length : 1;
  console.log(`[write] ${filePath} (${n} ${Array.isArray(data) ? 'records' : 'object'})`);
}

/**
 * Deterministic headline sentiment heuristic (documented, no LLM in pipeline).
 * Returns 'bullish' | 'bearish' | 'neutral'. 'neutral' here means "no
 * directional words detected" — a stated heuristic, not a researched call.
 */
const BULL_WORDS = ['beat', 'beats', 'surge', 'surges', 'record', 'upgrade', 'upgraded', 'raises', 'raised', 'growth', 'grows', 'bullish', 'outperform', 'buyback', 'dividend hike', 'profit', 'soar', 'rally', 'jump', 'tops', 'exceeds'];
const BEAR_WORDS = ['miss', 'misses', 'plunge', 'plunges', 'downgrade', 'downgraded', 'cuts', 'cut', 'warning', 'warns', 'lawsuit', 'probe', 'bearish', 'underperform', 'layoff', 'recall', 'tumble', 'sink', 'slump', 'disappoint'];

export function headlineSentiment(headline) {
  const t = String(headline || '').toLowerCase();
  let bull = 0, bear = 0;
  for (const w of BULL_WORDS) if (t.includes(w)) bull++;
  for (const w of BEAR_WORDS) if (t.includes(w)) bear++;
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

/** Round to n decimals (null-safe). */
export function r2(n, digits = 2) {
  return n == null || !Number.isFinite(n) ? null : parseFloat(n.toFixed(digits));
}

/** Clamp a number into [lo, hi]. */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
