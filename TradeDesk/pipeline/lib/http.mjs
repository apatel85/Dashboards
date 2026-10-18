#!/usr/bin/env node
/**
 * lib/http.mjs — shared polite HTTP helper for the TradeDesk keyless pipeline.
 *
 * - Rotates browser User-Agents (many free endpoints block bare curl / node UAs).
 * - Enforces a minimum interval between requests PER HOST (default 1100 ms).
 * - Retries 429 / 5xx / timeouts with exponential backoff (1s, 2s, 4s, 8s).
 * - 404 and other 4xx (except 429) fail FAST — no retry, caller decides.
 * - Every failure is logged LOUDLY to stderr. Silent catches are forbidden:
 *   callers must log or rethrow.
 *
 * Usage:
 *   import { fetchJson, fetchText, sleep } from './lib/http.mjs';
 *   const data = await fetchJson(url, { minIntervalMs: 150 }); // SEC allows 10/s
 */
import { setTimeout as sleep } from 'timers/promises';

export { sleep };

const BROWSER_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
];

const lastReqByHost = new Map();
let uaCursor = Math.floor(Math.random() * BROWSER_UAS.length);

export function pickUA() {
  uaCursor = (uaCursor + 1) % BROWSER_UAS.length;
  return BROWSER_UAS[uaCursor];
}

const DEFAULT_MIN_INTERVAL_MS = 1100;
const DEFAULT_RETRIES = 4;

/**
 * Fetch with politeness + retries. Returns the raw Response.
 * Throws on final failure (after logging loudly).
 */
export async function politeFetch(url, opts = {}) {
  const {
    headers = {},
    retries = DEFAULT_RETRIES,
    timeoutMs = 30000,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    label = '',
  } = opts;

  const host = new URL(url).host;
  const tag = label || url.slice(0, 90);

  // Per-host rate limiting
  const since = Date.now() - (lastReqByHost.get(host) || 0);
  if (since < minIntervalMs) await sleep(minIntervalMs - since);

  let delayMs = 1000;
  for (let attempt = 1; ; attempt++) {
    lastReqByHost.set(host, Date.now());
    let res;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': pickUA(), ...headers },
          signal: ctrl.signal,
          redirect: 'follow',
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      // Network error / timeout — retryable
      if (attempt > retries) {
        console.error(`[HTTP-FAIL] ${tag} → network error after ${attempt} attempts: ${e.message}`);
        throw new Error(`fetch failed: ${url} — ${e.message}`);
      }
      console.warn(`[HTTP-RETRY] ${tag} → ${e.name === 'AbortError' ? 'timeout' : e.message} (attempt ${attempt}/${retries}), backoff ${delayMs}ms`);
      await sleep(delayMs);
      delayMs *= 2;
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt > retries) {
        console.error(`[HTTP-FAIL] ${tag} → HTTP ${res.status} after ${attempt} attempts (no more retries)`);
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || delayMs, 30000) : delayMs;
      console.warn(`[HTTP-RETRY] ${tag} → HTTP ${res.status} (attempt ${attempt}/${retries}), backoff ${waitMs}ms`);
      await sleep(waitMs);
      delayMs *= 2;
      continue;
    }

    if (!res.ok) {
      // 4xx (except 429): fail fast, no retry — caller decides what it means
      // (e.g. Yahoo options 404 = "no options listed", not an error to hammer).
      console.error(`[HTTP-FAIL] ${tag} → HTTP ${res.status} ${res.statusText} (not retried)`);
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }

    return res;
  }
}

/** GET JSON. Throws (loudly) on failure. */
export async function fetchJson(url, opts = {}) {
  const res = await politeFetch(url, opts);
  try {
    return await res.json();
  } catch (e) {
    console.error(`[HTTP-FAIL] ${opts.label || url} → response was not valid JSON: ${e.message}`);
    throw new Error(`invalid JSON from ${url}`);
  }
}

/** GET text. Throws (loudly) on failure. */
export async function fetchText(url, opts = {}) {
  const res = await politeFetch(url, opts);
  return await res.text();
}
