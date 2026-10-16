import { useEffect, useState } from 'react';

/**
 * Delayed quote store — $0, no API key.
 *
 * No free quote API sends CORS headers, so the browser cannot fetch quotes
 * directly (Stooq/Yahoo/Nasdaq all fail from the app — verified 2026-10-16).
 * Instead the pipeline snapshots ~15-min-delayed Yahoo prices into
 * `data/quotes.json`; the store loads it on first use and the refresh button
 * re-reads it (cache-busted). Every price carries its as_of time — nothing
 * is presented as live.
 *
 * Extended-hours quotes still attempt CNBC's free batch endpoint straight
 * from the browser (it sends CORS *); failure is non-fatal.
 */

export interface LiveQuote {
  price: number;
  /** epoch ms when this quote was fetched */
  fetchedAt: number;
}

/** Extended-hours quote from CNBC's free batch endpoint (pre/post market). */
export interface PremarketQuote {
  price: number;
  changePct: number | null;
  /** e.g. "8:20 AM EDT" as reported by the feed */
  time: string;
  /** 'PRE_MKT' | 'POST_MKT' */
  session: string;
}

export interface QuoteStatus {
  fetching: boolean;
  /** epoch ms of the last successful refresh, null if never */
  lastOk: number | null;
  lastError: string | null;
  /** tickers currently cached */
  cached: number;
}

type Listener = () => void;

const cache = new Map<string, LiveQuote>();
const premarket = new Map<string, PremarketQuote>();
const listeners = new Set<Listener>();
let universe: string[] = [];
let fetching = false;
let lastOk: number | null = null;
let lastError: string | null = null;
/** as_of from quotes.json — the honest timestamp behind every price. */
let quotesAsOf: string | null = null;
let quotesLoaded = false;

function emit() {
  listeners.forEach((fn) => fn());
}

/** Tabs call this when their data loads; only the active tab is mounted. */
export function setQuoteUniverse(tickers: string[]) {
  universe = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(0, 150);
}

export function getQuote(ticker: string | null | undefined): LiveQuote | null {
  if (!ticker) return null;
  return cache.get(ticker.toUpperCase()) ?? null;
}

/** Extended-hours quote, if the last refresh caught a pre/post session. */
export function getPremarket(ticker: string | null | undefined): PremarketQuote | null {
  if (!ticker) return null;
  return premarket.get(ticker.toUpperCase()) ?? null;
}

export function quoteStatus(): QuoteStatus {
  return { fetching, lastOk, lastError, cached: cache.size };
}

/** When the pipeline snapshot was taken (null until loaded). */
export function quotesTimestamp(): string | null {
  return quotesAsOf;
}

export function subscribeQuotes(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Fetch one batched CSV from Stooq and fill the cache. */
export async function refreshQuotes(): Promise<void> {
  if (fetching) return;
  fetching = true;
  lastError = null;
  emit();
  try {
    await refreshPipelineQuotes();
    // Extended-hours quotes are a separate feed; failure must not kill the
    // regular quotes we just fetched.
    try {
      await refreshPremarket();
    } catch (e) {
      console.warn('[quotes] pre-market feed failed:', e instanceof Error ? e.message : e);
    }
    lastOk = Date.now();
  } catch (e) {
    lastError = e instanceof Error ? e.message : 'quote fetch failed';
  } finally {
    fetching = false;
    emit();
  }
}

/** Load the pipeline snapshot on first price lookup so cards show prices. */
let quotesPrime: Promise<void> | null = null;
export function primeQuotes(): void {
  if (quotesLoaded || quotesPrime) return;
  quotesPrime = refreshPipelineQuotes()
    .then(() => {
      lastOk = Date.now();
      emit();
    })
    .catch((e: unknown) => {
      lastError = e instanceof Error ? e.message : 'quote fetch failed';
      emit();
    })
    .finally(() => {
      quotesPrime = null;
    });
}

/** Fetch the pipeline's quotes.json snapshot and fill the cache. */
async function refreshPipelineQuotes(): Promise<void> {
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}data/quotes.json?ts=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`quotes snapshot HTTP ${res.status}`);
  const json = await res.json();
  const quotes = json?.quotes;
  if (!quotes || typeof quotes !== 'object') throw new Error('quotes snapshot malformed');
  quotesAsOf = typeof json.as_of === 'string' ? json.as_of : null;
  let n = 0;
  for (const [sym, q] of Object.entries(quotes)) {
    const price = (q as { price?: number })?.price;
    if (typeof price === 'number' && isFinite(price) && price > 0) {
      cache.set(String(sym).toUpperCase(), { price, fetchedAt: Date.now() });
      n++;
    }
  }
  if (n === 0) throw new Error('quotes snapshot had no usable rows');
  quotesLoaded = true;
}

/**
 * CNBC's free batch quote endpoint includes an ExtendedMktQuote block during
 * pre-market (4:00–9:30 AM ET) and after-hours (4:00–8:00 PM ET) sessions.
 * One request covers the whole universe. Sends Access-Control-Allow-Origin: *,
 * so it works straight from the browser.
 */
async function refreshPremarket(): Promise<void> {
  const syms = universe.map((t) => t.toUpperCase()).join('|');
  const url =
    `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol` +
    `?symbols=${encodeURIComponent(syms)}&requestMethod=quick&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pre-market feed HTTP ${res.status}`);
  const json = await res.json();
  const quotes = json?.FormattedQuoteResult?.FormattedQuote;
  if (!Array.isArray(quotes)) throw new Error('pre-market feed returned no quotes');
  premarket.clear();
  for (const q of quotes) {
    const sym = String(q.symbol ?? '').toUpperCase();
    const ext = q.ExtendedMktQuote;
    if (!sym || !ext || (ext.type !== 'PRE_MKT' && ext.type !== 'POST_MKT')) continue;
    const price = parseFloat(String(ext.last).replace(/,/g, ''));
    if (!isFinite(price) || price <= 0) continue;
    const pctRaw = String(ext.change_pct ?? '').replace(/[%+]/g, '');
    const changePct = pctRaw ? parseFloat(pctRaw) : null;
    premarket.set(sym, {
      price,
      changePct: isFinite(changePct as number) ? (changePct as number) : null,
      time: String(ext.last_timedate ?? ''),
      session: ext.type,
    });
  }
}

/**
 * Returns the live price when cached, otherwise the pipeline fallback.
 * `live` is true only when the value came from a real quote fetch.
 * `premarket` carries the extended-hours quote when the last refresh
 * caught a pre/post-market session, else null.
 */
export function useLivePrice(
  ticker: string | null | undefined,
  fallback: number | null | undefined,
): {
  price: number | null;
  live: boolean;
  fetchedAt: number | null;
  premarket: PremarketQuote | null;
} {
  const [, force] = useState(0);
  useEffect(() => subscribeQuotes(() => force((x) => x + 1)), []);
  useEffect(() => {
    primeQuotes();
  }, []);
  const q = getQuote(ticker);
  const pm = getPremarket(ticker);
  if (q) return { price: q.price, live: true, fetchedAt: q.fetchedAt, premarket: pm };
  return { price: fallback ?? null, live: false, fetchedAt: null, premarket: pm };
}

/** Re-render when quote store status changes (for the refresh button). */
export function useQuoteStatus(): QuoteStatus {
  const [, force] = useState(0);
  useEffect(() => subscribeQuotes(() => force((x) => x + 1)), []);
  return quoteStatus();
}
