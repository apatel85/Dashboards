import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { SCHWAB_PROXY_URL } from './schwab';
import { applySchwabQuotes, primeQuotes, getQuoteUniverse } from './quotes';
import type { SchwabSession } from './quotes';
import { fetchPremarketRanges, etDateStr } from './premarketRange';

export { SCHWAB_PROXY_URL, SCHWAB_AUTH_START_URL } from './schwab';

/**
 * Live Schwab quotes in the browser — 60-second polling, regular session
 * PLUS extended hours (pre-market 4:00–9:30am ET, after-hours 4:00–8:00pm
 * ET). During extended hours the price is Schwab's `mark` (fallback
 * `lastPrice`); yesterday's close rides along so cards can show the gap.
 *
 * Auth is the signed-in Supabase session JWT (Authorization: Bearer). The
 * proxy verifies it with auth.getUser() — the anon key fails that check, so
 * it cannot pass as a user. The Schwab proxy key is NEVER sent from the
 * browser; it is only for the pipeline / verify script.
 *
 * Behaviour contract:
 *  - Polls the proxy quotes endpoint every 60 s while the market is in ANY
 *    session (pre-market, regular, after-hours), Mon–Fri. The session comes
 *    from the proxy's markets endpoint (sessionHours blocks) once on load
 *    (refreshed every 30 min), falling back to a local ET clock when that
 *    call fails or has no sessionHours.
 *  - Live prices merge over the pipeline's quotes.json snapshot in the
 *    shared quote store, so every tab shows them through useLivePrice.
 *    The store also records the session and yesterday's close per ticker.
 *  - While the pre-market is running, the on-screen tickers' pre-market
 *    high/low is fetched (extended-hours 1-min history, refreshed every
 *    5 min); after the open it is fetched once for the final morning range.
 *  - ANY failure falls back to the snapshot silently — the UI never blanks.
 *    Status is exposed for the footer pill: live | premarket | afterhours |
 *    stale | reauth | off-hours | no-session.
 *  - No tokens are stored anywhere by this hook; the JWT lives only in
 *    memory (supabase-js manages the session itself).
 */

export type SchwabStatus =
  | 'live'
  | 'premarket'
  | 'afterhours'
  | 'stale'
  | 'reauth'
  | 'off-hours'
  | 'no-session';

export interface SchwabLiveState {
  status: SchwabStatus;
  /** epoch ms of the last successful poll, null if never */
  lastOk: number | null;
  lastError: string | null;
  /** whether the regular session is open, when known, else null */
  marketOpen: boolean | null;
  /** current session (closed = overnight/weekend) */
  session: SchwabSession;
}

const POLL_MS = 60_000;
const MARKETS_REFRESH_MS = 30 * 60_000;
const RANGE_REFRESH_MS = 5 * 60_000;
const MAX_PER_CALL = 50;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** ET weekday (0=Sun) + minutes since midnight, via Intl. */
function etParts(d = new Date()): { weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find((p) => p.type === 'weekday')?.value ?? '',
  );
  return { weekday: wd, minutes: (get('hour') % 24) * 60 + get('minute') };
}

/** Local-time fallback: pre 4:00–9:30, regular 9:30–16:00, after 16:00–20:00 ET, Mon–Fri. */
function localSession(): SchwabSession {
  const { weekday, minutes } = etParts();
  if (weekday < 1 || weekday > 5) return 'closed';
  if (minutes >= 240 && minutes < 570) return 'premarket';
  if (minutes >= 570 && minutes < 960) return 'regular';
  if (minutes >= 960 && minutes < 1200) return 'afterhours';
  return 'closed';
}

/**
 * Session from the markets endpoint's sessionHours blocks (ISO start/end
 * with offsets — exact). Returns 'closed' when sessionHours is present
 * but now falls in none of its blocks (overnight). Null when the shape
 * is unknown, so the caller falls back to the ET clock.
 */
function parseMarketsSession(json: unknown): SchwabSession | null {
  const eq = (json as { equity?: unknown } | null)?.equity;
  if (!eq || typeof eq !== 'object') return null;
  const entry =
    (eq as Record<string, unknown>).EQ ?? Object.values(eq as Record<string, unknown>)[0];
  if (!entry || typeof entry !== 'object') return null;
  const rec = entry as Record<string, unknown>;
  const hours = rec.sessionHours as
    | Record<string, { start?: unknown; end?: unknown }[]>
    | undefined;
  if (hours && typeof hours === 'object') {
    const now = Date.now();
    const blocks: [string, SchwabSession][] = [
      ['preMarket', 'premarket'],
      ['regularMarket', 'regular'],
      ['postMarket', 'afterhours'],
    ];
    for (const [key, session] of blocks) {
      const list = hours[key];
      if (!Array.isArray(list)) continue;
      for (const b of list) {
        const s = typeof b.start === 'string' ? Date.parse(b.start) : NaN;
        const e = typeof b.end === 'string' ? Date.parse(b.end) : NaN;
        if (Number.isFinite(s) && Number.isFinite(e) && now >= s && now < e) return session;
      }
    }
    return 'closed';
  }
  if (typeof rec.isOpen === 'boolean') return rec.isOpen ? 'regular' : null;
  return null;
}

/** Ticker universe = quotes.json keys PLUS Daily Brief breakout candidates.
 * The brief's candidates are not all in quotes.json (only 98 tickers), so
 * polling quotes.json alone leaves their rows on the stale snapshot price
 * (the brief is a pre-market snapshot — its price_ts is the prior day). */
async function fetchQuoteUniverse(): Promise<string[]> {
  const base = import.meta.env.BASE_URL || '/';
  const res = await fetch(`${base}data/quotes.json?ts=${Date.now()}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`quotes.json HTTP ${res.status}`);
  const json = await res.json();
  const keys = Object.keys(json?.quotes ?? {});
  // Brief candidates — best effort, never fatal to polling.
  try {
    const bres = await fetch(`${base}data/daily-brief.json?ts=${Date.now()}`, { cache: 'no-cache' });
    if (bres.ok) {
      const bjson = await bres.json();
      for (const c of bjson?.breakout_candidates ?? []) {
        if (typeof c?.ticker === 'string') keys.push(c.ticker);
      }
    }
  } catch {
    // Brief file missing/unreadable — quotes.json universe still stands.
  }
  return [...new Set(keys.map((k) => k.toUpperCase()).filter((k) => k.length > 0))].slice(0, 150);
}

async function fetchSchwabQuotes(
  jwt: string,
  symbols: string[],
  session: SchwabSession,
): Promise<{ prices: Record<string, number>; prevClose: Record<string, number>; reauth: boolean }> {
  const prices: Record<string, number> = {};
  const prevClose: Record<string, number> = {};
  let reauth = false;
  for (let i = 0; i < symbols.length; i += MAX_PER_CALL) {
    const batch = symbols.slice(i, i + MAX_PER_CALL);
    const q = new URLSearchParams({ symbols: batch.join(',') });
    const res = await fetch(`${SCHWAB_PROXY_URL}?${q.toString()}`, {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-cache',
    });
    if (res.status === 503) {
      const body = await res.json().catch(() => null);
      if (body?.status === 'reauth_needed') {
        reauth = true;
        continue;
      }
    }
    if (!res.ok) throw new Error(`Schwab proxy HTTP ${res.status}`);
    const data = await res.json();
    for (const [sym, v] of Object.entries(data ?? {})) {
      const quote = ((v as { quote?: unknown })?.quote ?? {}) as Record<string, unknown>;
      const last = num(quote.lastPrice);
      const mark = num(quote.mark);
      // Extended hours: the mark is the live pre/post-market price.
      const price = session === 'regular' ? last : (mark ?? last);
      if (price != null) prices[String(sym).toUpperCase()] = price;
      const pc = num(quote.closePrice);
      if (pc != null) prevClose[String(sym).toUpperCase()] = pc;
    }
  }
  return { prices, prevClose, reauth };
}

export function useSchwabLive(): SchwabLiveState {
  const [state, setState] = useState<SchwabLiveState>({
    status: 'off-hours',
    lastOk: null,
    lastError: null,
    marketOpen: null,
    session: 'closed',
  });
  const jwtRef = useRef<string | null>(null);
  const universeRef = useRef<string[] | null>(null);
  const marketsSessionRef = useRef<SchwabSession | null>(null);
  const marketsFetchedAtRef = useRef(0);
  const rangeFetchedAtRef = useRef(0);
  const rangeFetchedDateRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    // Track the session JWT (supabase-js refreshes it automatically).
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      jwtRef.current = data.session?.access_token ?? null;
      if (!jwtRef.current && !cancelled) {
        setState((s) => ({ ...s, status: 'no-session' }));
      }
    };
    void syncSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      jwtRef.current = session?.access_token ?? null;
    });

    // Snapshot first so prices exist before the first live merge.
    primeQuotes();

    const refreshMarkets = async () => {
      const jwt = jwtRef.current;
      if (!jwt) return;
      try {
        const q = new URLSearchParams({ markets: 'equity' });
        const res = await fetch(`${SCHWAB_PROXY_URL}?${q.toString()}`, {
          headers: { Authorization: `Bearer ${jwt}` },
          cache: 'no-cache',
        });
        if (!res.ok) return;
        const json = await res.json();
        const session = parseMarketsSession(json);
        if (session !== null) {
          marketsSessionRef.current = session;
          marketsFetchedAtRef.current = Date.now();
          if (!cancelled)
            setState((s) => ({ ...s, session, marketOpen: session === 'regular' }));
        }
      } catch {
        // Fall back to the local-time check.
      }
    };

    const currentSession = (): SchwabSession =>
      marketsSessionRef.current !== null ? marketsSessionRef.current : localSession();

    /** Pre-market high/low for the tickers on screen (the active tab's
     * universe). Every 5 min while the pre-market runs; once per day
     * after the open for the final morning range. Never blocks polling. */
    const maybeFetchRanges = async (jwt: string, session: SchwabSession) => {
      const tickers = getQuoteUniverse();
      if (tickers.length === 0) return;
      try {
        if (session === 'premarket') {
          const now = Date.now();
          if (now - rangeFetchedAtRef.current < RANGE_REFRESH_MS) return;
          rangeFetchedAtRef.current = now;
          await fetchPremarketRanges(jwt, tickers, true);
        } else {
          const today = etDateStr(Date.now());
          if (rangeFetchedDateRef.current === today) return;
          rangeFetchedDateRef.current = today;
          await fetchPremarketRanges(jwt, tickers, false);
        }
      } catch {
        // Ranges are an overlay — a failed fetch just hides the line.
      }
    };

    const pollOnce = async () => {
      const jwt = jwtRef.current;
      if (!jwt) {
        if (!cancelled) setState((s) => ({ ...s, status: 'no-session' }));
        return;
      }
      const session = currentSession();
      if (session === 'closed') {
        if (!cancelled)
          setState((s) =>
            s.status === 'off-hours' && s.session === 'closed'
              ? s
              : { ...s, status: 'off-hours', session: 'closed', marketOpen: false },
          );
        return;
      }
      try {
        if (!universeRef.current) {
          universeRef.current = await fetchQuoteUniverse();
        }
        if (universeRef.current.length === 0) {
          if (!cancelled) setState((s) => ({ ...s, status: 'stale', session, lastError: 'empty quote universe' }));
          return;
        }
        const { prices, prevClose, reauth } = await fetchSchwabQuotes(jwt, universeRef.current, session);
        if (cancelled) return;
        if (reauth) {
          setState((s) => ({ ...s, status: 'reauth', session, lastError: 'Schwab login expired' }));
          return;
        }
        const n = applySchwabQuotes(prices, { prevClose, session });
        if (n === 0) throw new Error('no usable prices in Schwab response');
        setState((s) => ({
          ...s,
          status: session === 'regular' ? 'live' : session,
          session,
          marketOpen: session === 'regular',
          lastOk: Date.now(),
          lastError: null,
        }));
        void maybeFetchRanges(jwt, session);
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          status: 'stale',
          session,
          lastError: e instanceof Error ? e.message : 'poll failed',
        }));
      }
    };

    const tick = async () => {
      if (Date.now() - marketsFetchedAtRef.current > MARKETS_REFRESH_MS) {
        await refreshMarkets();
      }
      await pollOnce();
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
