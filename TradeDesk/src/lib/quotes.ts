import { useEffect, useState } from 'react';

/**
 * Live (delayed) quote store — $0, no API key.
 *
 * Primary source: Stooq's free CSV quote endpoint, fetched straight from the
 * user's browser (their network, not our servers). Quotes are ~15 minutes
 * delayed and reflect the last regular-session trade. Manual refresh only, so
 * we never hammer the free endpoint.
 *
 * If Stooq is unreachable from the user's network the store keeps the
 * pipeline prices and surfaces the error honestly — nothing is faked.
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

export function subscribeQuotes(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Fetch one batched CSV from Stooq and fill the cache. */
export async function refreshQuotes(): Promise<void> {
  if (fetching || universe.length === 0) return;
  fetching = true;
  lastError = null;
  emit();
  try {
    await refreshStooq();
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

async function refreshStooq(): Promise<void> {
  const syms = universe.map((t) => `${t.toLowerCase()}.us`).join(',');
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(syms)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`quote feed HTTP ${res.status}`);
  const text = await res.text();
  let n = 0;
  for (const line of text.trim().split('\n').slice(1)) {
    const c = line.split(',');
    const sym = (c[0] ?? '').trim().toUpperCase().replace(/\.US$/, '');
    const close = parseFloat(c[6]);
    if (sym && isFinite(close) && close > 0) {
      cache.set(sym, { price: close, fetchedAt: Date.now() });
      n += 1;
    }
  }
  if (n === 0) throw new Error('quote feed returned no usable rows');
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
