import { useEffect, useState } from 'react';

/** Top-level destinations. Order = nav order. */
export type PageId = 'today' | 'options' | 'ideas' | 'lookup' | 'earnings' | 'money' | 'record' | 'admin';

export interface Route {
  page: PageId;
  /** Sub-view inside the page ('' = the page's first view). */
  sub: string;
  /** ?t=NVDA — ticker handed to Lookup by the global search. */
  ticker: string | null;
}

const PAGES: PageId[] = ['today', 'options', 'ideas', 'lookup', 'earnings', 'money', 'record', 'admin'];

/** Old TradeDesk hashes (#options, #congress…) keep working. */
const LEGACY: Record<string, [PageId, string]> = {
  brief: ['today', ''],
  signals: ['ideas', 'signals'],
  research: ['ideas', 'research'],
  congress: ['money', ''],
  deepdive: ['lookup', 'dive'],
  screener: ['lookup', 'screener'],
  performance: ['record', ''],
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [p = '', sub = ''] = path.split('/');
  const ticker = new URLSearchParams(query).get('t');
  const t = ticker ? ticker.trim().toUpperCase().slice(0, 12) : null;
  if ((PAGES as string[]).includes(p)) return { page: p as PageId, sub, ticker: t };
  const legacy = LEGACY[p];
  if (legacy) return { page: legacy[0], sub: legacy[1], ticker: t };
  return { page: 'today', sub: '', ticker: null };
}

export function hrefFor(page: PageId, sub = '', ticker?: string | null): string {
  let h = `#/${page}`;
  if (sub) h += `/${sub}`;
  if (ticker) h += `?t=${encodeURIComponent(ticker)}`;
  return h;
}

export function navigate(page: PageId, sub = '', ticker?: string | null): void {
  window.location.hash = hrefFor(page, sub, ticker);
  window.scrollTo({ top: 0 });
}

/** The current route, kept in sync with the URL hash (back/forward work). */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
