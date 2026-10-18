#!/usr/bin/env node
/**
 * lib/yahoo.mjs — Yahoo Finance unofficial APIs (no key, ~15-min delayed).
 *
 * Verified live 2026-10-14:
 *  - v8 chart (quotes/OHLCV, intraday): plain browser UA, NO crumb needed.
 *  - v7 options chain: REQUIRES the crumb flow —
 *      GET https://fc.yahoo.com (capture cookies)
 *      → GET https://query1.finance.yahoo.com/v1/test/getcrumb (with cookies)
 *      → append ?crumb=<crumb> (and send cookies) on v7 calls.
 *    A bare v7 call returns 401 "Invalid Crumb".
 *  - v10 quoteSummary (assetProfile / earningsHistory / earningsTrend):
 *    same crumb session as v7.
 *  - v1 finance search (news headlines): plain browser UA, no crumb.
 *
 * Node fetch has no cookie jar, so we implement a minimal one:
 * capture Set-Cookie from fc.yahoo.com and replay as a Cookie header.
 */
import { politeFetch, fetchJson } from './http.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let session = null; // { crumb, cookie }

function getSetCookies(res) {
  // Node 20 undici exposes getSetCookie(); fall back to raw header parsing.
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

/** Establish (and cache) the crumb session. Throws loudly on failure. */
export async function yahooSession() {
  if (session) return session;
  console.log('[yahoo] establishing crumb session…');
  // NOTE (verified 2026-10-15): fc.yahoo.com returns HTTP 404 ("Not Found on
  // Accelerator") but STILL sets the A3/B cookies that getcrumb needs. So we
  // harvest cookies from ANY response status here and only fail when no
  // cookies arrive at all. politeFetch's fail-fast 404 behavior must NOT be
  // used for this handshake step.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let r1;
  try {
    r1 = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } catch (e) {
    clearTimeout(timer);
    console.error(`[yahoo] FAIL: fc.yahoo.com handshake network error: ${e.message}`);
    throw new Error(`yahoo crumb handshake failed: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  try { await r1.arrayBuffer(); } catch { /* drain best-effort */ }
  const cookie = getSetCookies(r1).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) {
    console.error(`[yahoo] FAIL: fc.yahoo.com (HTTP ${r1.status}) set no cookies — crumb flow cannot proceed`);
    throw new Error('yahoo crumb handshake: no cookies received');
  }
  console.log(`[yahoo] handshake HTTP ${r1.status}, cookies captured (${cookie.length} chars)`);
  const r2 = await politeFetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
    label: 'yahoo getcrumb',
  });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.length > 128) {
    console.error(`[yahoo] FAIL: getcrumb returned unexpected body: ${crumb.slice(0, 120)}`);
    throw new Error('yahoo getcrumb: invalid crumb body');
  }
  session = { crumb, cookie };
  console.log('[yahoo] crumb session established');
  return session;
}

/** Reset the cached session (call after a 401 so the next call re-handshakes). */
export function resetYahooSession() {
  session = null;
}

/**
 * v8 chart: OHLCV + meta. No crumb needed.
 * interval: 1d | 15m | 1h …  range: 5d | 1mo | 3mo | 1y …
 */
export async function yahooChart(ticker, { interval = '1d', range = '3mo' } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  return fetchJson(url, {
    headers: { 'User-Agent': UA },
    label: `yahoo chart ${ticker} ${interval}/${range}`,
  });
}

/**
 * v7 options chain. Returns the parsed JSON (optionChain.result[0]).
 * Pass { date: <unix seconds> } for a specific expiration.
 * Throws err.status === 401 on crumb expiry (caller may reset + retry once);
 * 404 means the ticker has no listed options (fail-fast, no retry).
 */
export async function yahooOptions(ticker, { date = null } = {}) {
  const s = await yahooSession();
  const url =
    `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}` +
    `?crumb=${encodeURIComponent(s.crumb)}${date ? `&date=${date}` : ''}`;
  try {
    const j = await fetchJson(url, {
      headers: { 'User-Agent': UA, Cookie: s.cookie },
      label: `yahoo options ${ticker}${date ? ` @${date}` : ''}`,
    });
    return j?.optionChain?.result?.[0] || null;
  } catch (e) {
    if (e.status === 401) {
      console.warn(`[yahoo] 401 on options ${ticker} — resetting crumb session for one retry`);
      resetYahooSession();
      const s2 = await yahooSession();
      const url2 =
        `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}` +
        `?crumb=${encodeURIComponent(s2.crumb)}${date ? `&date=${date}` : ''}`;
      const j = await fetchJson(url2, {
        headers: { 'User-Agent': UA, Cookie: s2.cookie },
        label: `yahoo options ${ticker} (retry after crumb reset)`,
      });
      return j?.optionChain?.result?.[0] || null;
    }
    throw e;
  }
}

/**
 * v10 quoteSummary. modules e.g. ['assetProfile','earningsHistory','earningsTrend'].
 * Returns quoteSummary.result[0] or null.
 */
export async function yahooQuoteSummary(ticker, modules) {
  const s = await yahooSession();
  const url =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
    `?modules=${modules.join(',')}&crumb=${encodeURIComponent(s.crumb)}`;
  const j = await fetchJson(url, {
    headers: { 'User-Agent': UA, Cookie: s.cookie },
    label: `yahoo quoteSummary ${ticker} [${modules.join(',')}]`,
  });
  if (j?.quoteSummary?.error) {
    console.warn(`[yahoo] quoteSummary ${ticker}: API error ${JSON.stringify(j.quoteSummary.error).slice(0, 160)}`);
    return null;
  }
  return j?.quoteSummary?.result?.[0] || null;
}

/**
 * v1 finance search — news headlines for a ticker. No crumb needed.
 * Returns array of { title, publisher, link, providerPublishTime }.
 */
export async function yahooNews(ticker, newsCount = 5) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${newsCount}`;
  const j = await fetchJson(url, {
    headers: { 'User-Agent': UA },
    label: `yahoo news search ${ticker}`,
  });
  return Array.isArray(j?.news) ? j.news : [];
}
