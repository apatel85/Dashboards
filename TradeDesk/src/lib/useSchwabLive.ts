import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { applySchwabQuotes, primeQuotes } from './quotes';

/**
 * Live Schwab quotes in the browser — 60-second polling, market hours only.
 *
 * Auth is the signed-in Supabase session JWT (Authorization: Bearer). The
 * proxy verifies it with auth.getUser() — the anon key fails that check, so
 * it cannot pass as a user. The Schwab proxy key is NEVER sent from the
 * browser; it is only for the pipeline / verify script.
 *
 * Behaviour contract:
 *  - Polls the proxy quotes endpoint every 60 s ONLY while the market is
 *    open (9:30–16:00 ET, Mon–Fri). Open/closed comes from the proxy's
 *    markets endpoint once on load (refreshed every 30 min), falling back
 *    to a local ET clock when that call fails.
 *  - Live prices merge over the pipeline's quotes.json snapshot in the
 *    shared quote store, so every tab shows them through useLivePrice.
 *  - ANY failure falls back to the snapshot silently — the UI never blanks.
 *    Status is exposed for the footer pill: live | stale | reauth |
 *    off-hours | no-session.
 *  - No tokens are stored anywhere by this hook; the JWT lives only in
 *    memory (supabase-js manages the session itself).
 */

export const SCHWAB_PROXY_URL =
  'https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/schwab-market-data';
export const SCHWAB_AUTH_START_URL =
  'https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/schwab-auth-start';

export type SchwabStatus = 'live' | 'stale' | 'reauth' | 'off-hours' | 'no-session';

export interface SchwabLiveState {
  status: SchwabStatus;
  /** epoch ms of the last successful poll, null if never */
  lastOk: number | null;
  lastError: string | null;
  /** markets endpoint's isOpen when known, else null */
  marketOpen: boolean | null;
}

const POLL_MS = 60_000;
const MARKETS_REFRESH_MS = 30 * 60_000;
const MAX_PER_CALL = 50;

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

/** Local-time fallback: Mon–Fri 9:30–16:00 ET. */
function localMarketOpen(): boolean {
  const { weekday, minutes } = etParts();
  return weekday >= 1 && weekday <= 5 && minutes >= 570 && minutes < 960;
}

/** Defensive parse of GET /markets — shape varies; null when unknown. */
function parseMarketsIsOpen(json: unknown): boolean | null {
  const eq = (json as { equity?: unknown } | null)?.equity;
  if (!eq || typeof eq !== 'object') return null;
  const entry =
    (eq as Record<string, unknown>).EQ ?? Object.values(eq as Record<string, unknown>)[0];
  if (!entry || typeof entry !== 'object') return null;
  const isOpen = (entry as Record<string, unknown>).isOpen;
  return typeof isOpen === 'boolean' ? isOpen : null;
}

/** Ticker universe = the keys of the pipeline's quotes.json snapshot. */
async function fetchQuoteUniverse(): Promise<string[]> {
  const base = import.meta.env.BASE_URL || '/';
  const res = await fetch(`${base}data/quotes.json?ts=${Date.now()}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`quotes.json HTTP ${res.status}`);
  const json = await res.json();
  const keys = Object.keys(json?.quotes ?? {});
  return keys.map((k) => k.toUpperCase()).filter((k) => k.length > 0).slice(0, 150);
}

async function fetchSchwabQuotes(
  jwt: string,
  symbols: string[],
): Promise<{ prices: Record<string, number>; reauth: boolean }> {
  const prices: Record<string, number> = {};
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
      const last =
        (v as { quote?: { lastPrice?: unknown }; lastPrice?: unknown })?.quote?.lastPrice ??
        (v as { lastPrice?: unknown })?.lastPrice;
      if (typeof last === 'number') prices[String(sym).toUpperCase()] = last;
    }
  }
  return { prices, reauth };
}

export function useSchwabLive(): SchwabLiveState {
  const [state, setState] = useState<SchwabLiveState>({
    status: 'off-hours',
    lastOk: null,
    lastError: null,
    marketOpen: null,
  });
  const jwtRef = useRef<string | null>(null);
  const universeRef = useRef<string[] | null>(null);
  const marketsOpenRef = useRef<boolean | null>(null);
  const marketsFetchedAtRef = useRef(0);

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
        const open = parseMarketsIsOpen(json);
        if (open !== null) {
          marketsOpenRef.current = open;
          marketsFetchedAtRef.current = Date.now();
          if (!cancelled) setState((s) => ({ ...s, marketOpen: open }));
        }
      } catch {
        // Fall back to the local-time check.
      }
    };

    const isOpen = () =>
      marketsOpenRef.current !== null ? marketsOpenRef.current : localMarketOpen();

    const pollOnce = async () => {
      const jwt = jwtRef.current;
      if (!jwt) {
        if (!cancelled) setState((s) => ({ ...s, status: 'no-session' }));
        return;
      }
      if (!isOpen()) {
        if (!cancelled) setState((s) => (s.status === 'off-hours' ? s : { ...s, status: 'off-hours' }));
        return;
      }
      try {
        if (!universeRef.current) {
          universeRef.current = await fetchQuoteUniverse();
        }
        if (universeRef.current.length === 0) {
          if (!cancelled) setState((s) => ({ ...s, status: 'stale', lastError: 'empty quote universe' }));
          return;
        }
        const { prices, reauth } = await fetchSchwabQuotes(jwt, universeRef.current);
        if (cancelled) return;
        if (reauth) {
          setState((s) => ({ ...s, status: 'reauth', lastError: 'Schwab login expired' }));
          return;
        }
        const n = applySchwabQuotes(prices);
        if (n === 0) throw new Error('no usable prices in Schwab response');
        setState((s) => ({ ...s, status: 'live', lastOk: Date.now(), lastError: null }));
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          status: 'stale',
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
