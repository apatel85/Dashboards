import { useEffect, useState } from 'react';
import { SCHWAB_PROXY_URL } from './schwab';

/**
 * Pre-market high/low per ticker, from Schwab extended-hours history.
 *
 * Schwab's 1-minute history only returns COMPLETED days for a plain
 * `period=1` request — at 8am it hands back yesterday. To get TODAY's
 * pre-market candles we must ask with explicit epoch-ms startDate
 * (today 00:00 ET) and endDate (now), plus needExtendedHoursData=true.
 * Verified 2026-11-11: that returns 149 candles 07:00–09:28 ET for SPY.
 * Schwab's pre-market prints start ~07:00 ET, not 04:00 — the range is
 * the 07:00–09:29 window, and the UI says so honestly.
 *
 * One range per ticker per day, cached in memory; refreshes every 5 min
 * while the pre-market is still running (the range grows), and once after
 * the open (the final morning range doubles as the day's first S/R).
 * Failures are per-ticker and non-fatal — a missing range just hides.
 */

export interface PremarketRange {
  high: number;
  low: number;
  /** epoch ms of the last candle included */
  asOf: number;
  /** ET date string YYYY-MM-DD the range belongs to */
  date: string;
  /** how many pre-market candles went into the range */
  candles: number;
}

type Listener = () => void;

const store = new Map<string, PremarketRange>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribePremarketRange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getPremarketRange(ticker: string | null | undefined): PremarketRange | null {
  if (!ticker) return null;
  return store.get(ticker.toUpperCase()) ?? null;
}

/** Re-render when the range for this ticker arrives or updates. */
export function usePremarketRange(ticker: string | null | undefined): PremarketRange | null {
  const [, force] = useState(0);
  useEffect(() => subscribePremarketRange(() => force((x) => x + 1)), []);
  return getPremarketRange(ticker);
}

/** ET date parts for an epoch-ms instant, via Intl. */
function etParts(ms: number): { y: number; m: number; d: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

/** 'YYYY-MM-DD' in ET for an epoch-ms instant. */
export function etDateStr(ms: number): string {
  const p = etParts(ms);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Minutes ET is behind UTC at this instant (240 in EDT, 300 in EST). */
function etOffsetMinutes(utcMs: number): number {
  const utc = new Date(utcMs);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(utc);
  const etMin =
    (Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24) * 60 +
    Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const utcMin = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  let off = utcMin - etMin;
  if (off > 720) off -= 1440;
  else if (off < -720) off += 1440;
  return off;
}

/** Epoch ms of 00:00 ET on the day containing `now`. */
export function etMidnightMs(now = Date.now()): number {
  const p = etParts(now);
  const midnightUtc = Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0);
  return midnightUtc + etOffsetMinutes(midnightUtc) * 60_000;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Fetch today's pre-market range for ONE ticker. Returns null when there
 * are no pre-market candles yet (before ~07:00 ET) or the fetch fails.
 * `force` re-fetches even when today's range is already cached.
 */
export async function fetchPremarketRange(
  jwt: string,
  rawTicker: string,
  force = false,
): Promise<PremarketRange | null> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker || !jwt) return null;
  const today = etDateStr(Date.now());
  const cached = store.get(ticker);
  if (!force && cached && cached.date === today) return cached;
  const q = new URLSearchParams({
    history: ticker,
    periodType: 'day',
    startDate: String(etMidnightMs()),
    endDate: String(Date.now()),
    frequencyType: 'minute',
    frequency: '1',
    needExtendedHoursData: 'true',
  });
  const res = await fetch(`${SCHWAB_PROXY_URL}?${q.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: 'no-cache',
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const candles = ((json as { candles?: unknown[] })?.candles ?? []) as Record<string, unknown>[];
  let high: number | null = null;
  let low: number | null = null;
  let asOf = 0;
  let n = 0;
  for (const c of candles) {
    const dt = num(c.datetime);
    if (dt == null) continue;
    const p = etParts(dt);
    // Pre-market only: before 09:30 ET (after-hours candles are 16:00+).
    if (p.hour > 9 || (p.hour === 9 && p.minute >= 30)) continue;
    const h = num(c.high);
    const l = num(c.low);
    if (h == null || l == null || h <= 0 || l <= 0) continue;
    high = high == null ? h : Math.max(high, h);
    low = low == null ? l : Math.min(low, l);
    asOf = Math.max(asOf, dt);
    n++;
  }
  if (high == null || low == null || n === 0) return null;
  const range: PremarketRange = { high, low, asOf, date: today, candles: n };
  store.set(ticker, range);
  emit();
  return range;
}

/**
 * Fetch ranges for a list of tickers (5 at a time). Already-cached
 * tickers for today are skipped unless `force` — during the pre-market
 * the caller re-runs this every few minutes with force=true so the
 * range keeps up as the morning progresses. Never throws.
 */
export async function fetchPremarketRanges(
  jwt: string,
  tickers: string[],
  force = false,
): Promise<void> {
  const list = [...new Set(tickers.map((t) => t.toUpperCase()).filter((t) => t.length > 0))].slice(0, 20);
  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(
      list.slice(i, i + 5).map((t) => fetchPremarketRange(jwt, t, force).catch(() => null)),
    );
  }
}
