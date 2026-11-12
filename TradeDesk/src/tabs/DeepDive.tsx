import '../mockb-deepdive.css';
import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SectionHead, TvLink, Badge } from '../components/ui';
import { Fundamentals } from '../components/Fundamentals';
import { useJsonData } from '../lib/useJsonData';
import { useSchwabSession } from '../lib/quotes';
import { fetchPremarketRange, usePremarketRange } from '../lib/premarketRange';
import { supabase } from '../lib/supabase';
import {
  fetchDeepDive,
  DeepDiveError,
  SCHWAB_AUTH_START_URL,
} from '../lib/schwabDeepDive';
import type { DeepDiveData } from '../lib/schwabDeepDive';
import { fmtDate, fmtDateY, fmtInt, fmtCompactMoney, fmtPct } from '../lib/format';
import type { SignalsFile, EarningsEntry, NewsFile, CongressTrade, FundamentalsFile, FundamentalMetrics } from '../types';

const QUICK_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'MU', 'SNDK', 'TSM'];

interface InsiderTrade {
  ticker: string;
  owner_name: string;
  role: string;
  transaction_code: string; // P = purchase, S = sale
  shares: number;
  price: number | null;
  transaction_date: string;
  filed_date: string | null;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  return n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtUsd(n: number | null | undefined): string {
  return n == null ? '—' : `$${fmtNum(n)}`;
}

/* ── Mock B numbered collapsible card ───────────────────────────── */

function MbCard({ num, title, sub, count, defaultOpen = false, children }: {
  num: string;
  title: ReactNode;
  sub?: ReactNode;
  count?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-card">
      <button
        type="button"
        className="mb-card-head mb-dd-cardhead"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="mb-card-num">{num}</span>
        <span className="mb-card-title">{title}</span>
        {sub ? <span className="mb-card-sub">{sub}</span> : null}
        {count != null && <span className="mb-count-badge">{count}</span>}
        <span className="mb-dd-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mb-dd-body">{children}</div>}
    </div>
  );
}

/* ── quotes.json ────────────────────────────────────────────────── */

interface QuotesFile {
  as_of: string;
  source: string;
  count: number;
  quotes: Record<string, { price: number | null; prev_close: number | null; change_pct: number | null }>;
}

/** Latest quotes — all tickers, live from quotes.json. Sorted by ticker. */
function QuotesBrowser() {
  const { data, loading, error } = useJsonData<QuotesFile>('quotes.json');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    if (!data?.quotes) return [];
    return Object.entries(data.quotes)
      .map(([ticker, q]) => ({ ticker, ...q }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.ticker.includes(q));
  }, [rows, query]);

  return (
    <MbCard
      num="01"
      title="Latest quotes — all tickers"
      sub="Live quotes file · tap to open"
      count={data ? `${filtered.length} of ${rows.length}` : undefined}
    >
      {loading && <p className="mb-dd-empty">Loading quotes…</p>}
      {error && <p className="mb-dd-empty">Couldn&apos;t load quotes.json ({error}). The scheduled pipeline may not have written it yet.</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="mb-dd-empty">No quotes on file yet — the pipeline writes quotes.json on its morning run.</p>
      )}
      {rows.length > 0 && (
        <>
          <div className="mb-dd-filters">
            <label className="mb-dd-field mb-dd-field-search">
              <span className="mb-dd-label">Search ticker</span>
              <input
                className="mb-dd-control"
                type="search"
                placeholder="e.g. NVDA"
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                aria-label="Search quotes by ticker"
              />
            </label>
          </div>
          {filtered.length === 0 ? (
            <p className="mb-dd-empty">No ticker matches &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <div className="mb-dd-scroll">
              <table className="mb-dd-table">
                <thead>
                  <tr>
                    <th scope="col">Ticker</th>
                    <th scope="col" className="num">Price</th>
                    <th scope="col" className="num">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.ticker}>
                      <td><TvLink ticker={r.ticker} /></td>
                      <td className="num">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</td>
                      <td className={`num ${r.change_pct != null ? (r.change_pct > 0 ? 'up' : r.change_pct < 0 ? 'down' : '') : ''}`}>
                        {r.change_pct != null ? `${r.change_pct > 0 ? '+' : ''}${r.change_pct.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mb-dd-foot">
            Quotes as of {data?.as_of ? new Date(data.as_of).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
            {' · '}{data?.source ?? ''}
          </p>
        </>
      )}
    </MbCard>
  );
}

/* ── Fundamentals browser ───────────────────────────────────────── */

type SortKey =
  | 'ticker' | 'price' | 'market_cap' | 'pe_trailing' | 'pe_forward' | 'peg'
  | 'roe' | 'revenue_growth_yoy' | 'peer_upside_pct' | 'graham_upside_pct';

/** Upside figures past ±999% are data errors, not signals — cap the display. */
function fmtUpside(v: number | null): string {
  if (v == null) return '—';
  if (v > 999) return '>999%';
  if (v < -999) return '<-999%';
  return `${v > 0 ? '+' : ''}${v}%`;
}

const FUND_COLUMNS: { key: SortKey; label: string; fmt: (f: FundamentalMetrics & { ticker: string }) => string }[] = [
  { key: 'ticker', label: 'Ticker', fmt: () => '' },
  { key: 'price', label: 'Price', fmt: (f) => (f.price != null ? `$${f.price.toFixed(2)}` : '—') },
  {
    key: 'market_cap', label: 'Mkt Cap',
    fmt: (f) => (f.market_cap == null ? '—' : f.market_cap >= 1e12 ? `$${(f.market_cap / 1e12).toFixed(2)}T` : f.market_cap >= 1e9 ? `$${(f.market_cap / 1e9).toFixed(1)}B` : `$${(f.market_cap / 1e6).toFixed(0)}M`),
  },
  { key: 'pe_trailing', label: 'P/E', fmt: (f) => (f.pe_trailing != null ? f.pe_trailing.toFixed(1) : '—') },
  { key: 'pe_forward', label: 'Fwd P/E', fmt: (f) => (f.pe_forward != null ? f.pe_forward.toFixed(1) : '—') },
  { key: 'peg', label: 'PEG', fmt: (f) => (f.peg != null ? f.peg.toFixed(2) : '—') },
  { key: 'roe', label: 'ROE', fmt: (f) => (f.roe != null ? `${(f.roe * 100).toFixed(1)}%` : '—') },
  { key: 'revenue_growth_yoy', label: 'Rev Gr', fmt: (f) => (f.revenue_growth_yoy != null ? `${(f.revenue_growth_yoy * 100).toFixed(1)}%` : '—') },
  { key: 'peer_upside_pct', label: 'Peer ↑', fmt: (f) => fmtUpside(f.peer_upside_pct) },
  { key: 'graham_upside_pct', label: 'Graham ↑', fmt: (f) => fmtUpside(f.graham_upside_pct) },
];

/** Same five tests as Screener.tsx PRESETS — copied, not imported. */
const FUND_PRESETS: { id: string; label: string; hint: string; test: (f: FundamentalMetrics) => boolean }[] = [
  { id: 'value', label: 'Value: P/E < 15', hint: 'Cheap on earnings — the price is less than 15× last year’s earnings per share', test: (f) => (f.pe_trailing ?? 999) < 15 },
  { id: 'growth', label: 'Growth: Rev +15%', hint: 'Fast-growing sales — revenue grew more than 15% vs last year', test: (f) => (f.revenue_growth_yoy ?? -1) > 0.15 },
  { id: 'quality', label: 'Quality: ROE > 15%', hint: 'Profitable and efficient — earns more than 15% on shareholders’ money', test: (f) => (f.roe ?? -1) > 0.15 },
  { id: 'cheap', label: 'PEG < 1', hint: 'Cheap for its growth — the price is low compared with expected earnings growth', test: (f) => (f.peg ?? 999) < 1 },
  { id: 'undervalued', label: 'Peer upside +10%', hint: 'Peers say it’s cheap — similar companies suggest the price should be 10%+ higher', test: (f) => (f.peer_upside_pct ?? -999) > 10 },
];

function fundCellTone(key: SortKey, f: FundamentalMetrics): string {
  if (key === 'peer_upside_pct' || key === 'graham_upside_pct') {
    const v = (f as unknown as Record<string, number | null>)[key];
    if (v == null) return '';
    return v > 5 ? 'up' : v < -5 ? 'down' : '';
  }
  return '';
}

const FUND_PAGE_SIZE = 50;

function FundamentalsBrowser() {
  const { data, loading, error } = useJsonData<FundamentalsFile>('fundamentals.json');
  const [sortKey, setSortKey] = useState<SortKey>('peer_upside_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('all');
  const [presets, setPresets] = useState<Set<string>>(new Set());
  const [openTicker, setOpenTicker] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    if (!data?.fundamentals) return [];
    return Object.entries(data.fundamentals).map(([ticker, f]) => ({ ticker, ...f }));
  }, [data]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.sector) s.add(r.sector);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter((r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    if (sector !== 'all') out = out.filter((r) => r.sector === sector);
    for (const pid of presets) {
      const p = FUND_PRESETS.find((x) => x.id === pid);
      if (p) out = out.filter((r) => p.test(r));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return dir * (av - bv);
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * String(av).localeCompare(String(bv));
    });
    return out;
  }, [rows, query, sector, presets, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / FUND_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * FUND_PAGE_SIZE, safePage * FUND_PAGE_SIZE + FUND_PAGE_SIZE);

  const togglePreset = (id: string) => {
    setPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(0);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'ticker' ? 'asc' : 'desc'); }
  };

  return (
    <MbCard
      num="02"
      title="Browse all fundamentals"
      sub="Every ticker on file · tap to open"
      count={data ? `${filtered.length} of ${rows.length}` : undefined}
    >
      {loading && <p className="mb-dd-empty">Loading fundamentals…</p>}
      {error && <p className="mb-dd-empty">Couldn&apos;t load fundamentals.json ({error}). The pipeline builds it on its morning run — check back after the next run.</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="mb-dd-empty">No fundamentals on file yet — the pipeline builds fundamentals.json on its morning run.</p>
      )}
      {rows.length > 0 && (
        <>
          <p className="mb-dd-note">
            Find stocks that look cheap or strong on the numbers. <b>Peer ↑</b> = how far the price is
            below what similar companies would imply. <b>Graham ↑</b> = how far below a conservative
            deep-value floor. Green = the numbers say cheap; red = expensive. Tap a row for the full
            fundamentals. Tap a column header to sort. Swipe the table sideways to see all columns.
          </p>
          <div className="mb-dd-filters">
            <label className="mb-dd-field mb-dd-field-search">
              <span className="mb-dd-label">Search ticker or name</span>
              <input
                className="mb-dd-control"
                type="search"
                placeholder="Search ticker or name…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                aria-label="Search fundamentals by ticker or name"
              />
            </label>
            <label className="mb-dd-field">
              <span className="mb-dd-label">Sector</span>
              <select
                className="mb-dd-control"
                value={sector}
                onChange={(e) => { setSector(e.target.value); setPage(0); }}
                aria-label="Filter by sector"
              >
                <option value="all">All sectors</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mb-dd-presets" role="group" aria-label="Screener presets — combine to narrow the list">
            {FUND_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`mb-dd-chip${presets.has(p.id) ? ' on' : ''}`}
                onClick={() => togglePreset(p.id)}
                aria-pressed={presets.has(p.id)}
                title={p.hint}
              >
                {p.label}
              </button>
            ))}
            {presets.size > 0 && (
              <button type="button" className="mb-dd-clear" onClick={() => { setPresets(new Set()); setPage(0); }}>
                Clear
              </button>
            )}
          </div>
          {presets.size > 0 && (
            <p className="mb-dd-note mb-dd-active-filters">
              Showing only stocks that pass all selected presets: {FUND_PRESETS.filter((p) => presets.has(p.id)).map((p) => p.label).join(' + ')}.
            </p>
          )}
          {filtered.length === 0 ? (
            <p className="mb-dd-empty">No tickers match these filters — try clearing a preset or widening the search.</p>
          ) : (
            <>
              <div className="mb-dd-scroll">
                <table className="mb-dd-table">
                  <thead>
                    <tr>
                      {FUND_COLUMNS.map((c) => (
                        <th key={c.key} scope="col" onClick={() => toggleSort(c.key)} className={c.key === 'ticker' ? 'sortable' : 'sortable num'}>
                          {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <Fragment key={r.ticker}>
                        <tr
                          onClick={() => setOpenTicker((t) => (t === r.ticker ? null : r.ticker))}
                          className="clickable"
                        >
                          <td><TvLink ticker={r.ticker} /></td>
                          {FUND_COLUMNS.slice(1).map((c) => (
                            <td key={c.key} className={`num ${fundCellTone(c.key, r)}`}>
                              {c.fmt(r)}
                            </td>
                          ))}
                        </tr>
                        {openTicker === r.ticker && (
                          <tr className="detail-row">
                            <td colSpan={FUND_COLUMNS.length}>
                              <Fundamentals ticker={r.ticker} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mb-dd-pager">
                <button
                  type="button"
                  className="mb-back"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Prev
                </button>
                <span className="mb-dd-pageinfo">
                  Page {safePage + 1} of {pageCount} · {filtered.length} tickers · 50 per page
                </span>
                <button
                  type="button"
                  className="mb-back"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next →
                </button>
              </div>
            </>
          )}
          <p className="mb-dd-foot">
            Fundamentals as of {data?.as_of ? new Date(data.as_of).toLocaleDateString() : '—'}
            {' · '}{data?.source ?? ''}
          </p>
        </>
      )}
    </MbCard>
  );
}

/** Smart-money section: congress + insider trades for one ticker.
 * Loads the two big files only once a ticker is submitted. */
function SmartMoneyPanel({ ticker, flow }: {
  ticker: string;
  flow: { direction: string; flow_score: number; buy_amount: number; sell_amount: number; net_flow: number; officials: number; buy_trades: number; sell_trades: number; cluster: boolean } | null;
}) {
  const { data: congress } = useJsonData<CongressTrade[]>('congress.json');
  const { data: insiders } = useJsonData<InsiderTrade[]>('insiders.json');
  const congTrades = useMemo(() => {
    if (!congress) return [];
    return congress
      .filter((t) => (t.ticker ?? '').toUpperCase() === ticker)
      .sort((a, b) => (a.disclosed_date ?? a.tx_date) < (b.disclosed_date ?? b.tx_date) ? 1 : -1)
      .slice(0, 5);
  }, [congress, ticker]);
  const insiderTrades = useMemo(() => {
    if (!insiders) return [];
    return insiders
      .filter((t) => t.ticker.toUpperCase() === ticker)
      .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
      .slice(0, 5);
  }, [insiders, ticker]);

  return (
    <div>
      <SectionHead title="Smart money" sub="Congress, White House & insider flow for this ticker" />
      {flow ? (
        <p className="muted small plain-note">
          Disclosed flow is <b>{flow.direction}</b> (score {flow.flow_score}/100):{' '}
          {fmtCompactMoney(flow.buy_amount)} bought vs {fmtCompactMoney(flow.sell_amount)} sold
          across {flow.officials} officials, net {fmtCompactMoney(flow.net_flow)}.
          {flow.cluster ? ' Several officials bought it in the same week.' : ''}
        </p>
      ) : (
        <p className="muted small plain-note">No disclosed congressional or White House flow for this ticker in the last 90 days.</p>
      )}
      {congTrades.length > 0 && (
        <>
          <h4 className="sector-title">Recent congressional trades</h4>
          <ul className="dd-list">
            {congTrades.map((t, i) => (
              <li key={i}>
                <b>{t.member}</b> · {t.trade_type} {t.amount_range} · disclosed {fmtDateY(t.disclosed_date)}
              </li>
            ))}
          </ul>
        </>
      )}
      {insiderTrades.length > 0 && (
        <>
          <h4 className="sector-title">Recent insider trades</h4>
          <ul className="dd-list">
            {insiderTrades.map((t, i) => (
              <li key={i}>
                <b>{t.owner_name}</b> ({t.role}) · {t.transaction_code === 'P' ? 'bought' : t.transaction_code === 'S' ? 'sold' : t.transaction_code}{' '}
                {fmtInt(t.shares)} shares @ {fmtUsd(t.price)} · {fmtDate(t.transaction_date)}
              </li>
            ))}
          </ul>
        </>
      )}
      {congTrades.length === 0 && insiderTrades.length === 0 && (
        <p className="muted small">No individual congressional or insider trades on file for this ticker.</p>
      )}
    </div>
  );
}

export default function DeepDiveTab() {
  const [input, setInput] = useState('');
  const [ticker, setTicker] = useState<string | null>(null);
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DeepDiveError | null>(null);

  // Small pipeline files for the context sections (loaded once, cheap).
  const { data: signals } = useJsonData<SignalsFile>('signals.json');
  const { data: earnings } = useJsonData<EarningsEntry[]>('earnings.json');
  const { data: news } = useJsonData<NewsFile>('news.json');

  const run = async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setTicker(t);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const d = await fetchDeepDive(t);
      setData(d);
      // Pre-market range for the S/R section — best effort, never blocks.
      void (async () => {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const jwt = sess.session?.access_token;
          if (jwt) await fetchPremarketRange(jwt, t);
        } catch {
          // No range — the section stays hidden.
        }
      })();
    } catch (e) {
      setError(e instanceof DeepDiveError ? e : new DeepDiveError('fetch', e instanceof Error ? e.message : 'Deep Dive failed.'));
    } finally {
      setLoading(false);
    }
  };

  const flow = useMemo(() => {
    if (!ticker || !signals) return null;
    return signals.tickers.find((s) => s.ticker.toUpperCase() === ticker) ?? null;
  }, [signals, ticker]);

  const nextEarnings = useMemo(() => {
    if (!ticker || !earnings) return null;
    const upcoming = earnings
      .filter((e) => e.ticker.toUpperCase() === ticker && e.eps_actual == null)
      .sort((a, b) => (a.reporting_date < b.reporting_date ? -1 : 1));
    return upcoming[0] ?? null;
  }, [earnings, ticker]);

  const headlines = useMemo(() => {
    if (!ticker || !news) return [];
    return news.items.filter((h) => h.ticker.toUpperCase() === ticker).slice(0, 5);
  }, [news, ticker]);

  const q = data?.quote;
  const tech = data?.technicals;
  const opt = data?.options;
  const ivVsHv = opt?.atmIv != null && tech?.hv30 != null ? opt.atmIv / tech.hv30 : null;
  // This morning's pre-market range (fetched on demand after the dive).
  const range = usePremarketRange(ticker);
  const schwabSession = useSchwabSession();

  return (
    <section className="tab mb-deepdive">
      <header className="tab-header">
        <h2 className="mb-tabhead">09 · Deep Dive</h2>
        <p className="mb-lede">
          Pick any stock. Live Schwab data — real-time price, 2 years of history, the full
          options chain — plus our own flow, fundamentals and news, analysed in plain English.
        </p>
        <p className="muted small plain-note">
          This is separate from the scheduled research agent: no waiting for Sunday or
          Wednesday, no 30-day probability — it is the live picture right now, for any ticker
          you type. The verdicts are computed from the numbers, so they never invent a price.
        </p>
      </header>

      <form
        className="panel filterbar dd-search"
        onSubmit={(e) => { e.preventDefault(); void run(input); }}
      >
        <label className="filter grow">
          <span>Ticker</span>
          <input
            type="text"
            value={input}
            placeholder="e.g. NVDA"
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            aria-label="Ticker to analyse"
          />
        </label>
        <button type="submit" className="btn" disabled={loading || !input.trim()}>
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
        <span className="dd-quick">
          {QUICK_TICKERS.map((t) => (
            <button key={t} type="button" className="chip-btn" onClick={() => { setInput(t); void run(t); }}>
              {t}
            </button>
          ))}
        </span>
      </form>

      <QuotesBrowser />
      <FundamentalsBrowser />

      {loading && (
        <div className="panel">
          <div className="empty-title">Pulling live Schwab data…</div>
          <p className="muted">Quote, 2-year history, SPY comparison and the options chain.</p>
        </div>
      )}

      {error && (
        <div className="panel">
          <div className="empty-title">
            {error.code === 'reauth' || error.code === 'no-session' ? 'Schwab needs a reconnect' : 'Could not analyse that ticker'}
          </div>
          <p className="muted">{error.message}</p>
          {(error.code === 'reauth' || error.code === 'no-session') && (
            <p>
              <a className="btn" href={SCHWAB_AUTH_START_URL}>Reconnect Schwab</a>
            </p>
          )}
        </div>
      )}

      {!loading && !error && !data && (
        <div className="panel">
          <div className="empty-title">Type a ticker to start</div>
          <p className="muted">
            You will get the live price and 52-week range, trend vs its moving averages and
            vs the S&amp;P 500, what the options market is pricing, who has been buying or
            selling it, the fundamentals, the next earnings date and the latest headlines.
          </p>
        </div>
      )}

      {data && q && tech && opt && (
        <>
          <MbCard
            num="03"
            title="Snapshot"
            sub={`Live via Schwab · ${new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET`}
            count={fmtUsd(q.price)}
            defaultOpen
          >
            <SectionHead
              title={<><TvLink ticker={data.ticker} /> · {fmtUsd(q.price)}</>}
              sub={`Live via Schwab · ${new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET`}
            />
            <div className="perf-stats">
              <div className="stat"><span className="stat-label">Today</span><span className="stat-value num">{q.changePct != null ? fmtPct(q.changePct) : '—'}</span></div>
              <div className="stat"><span className="stat-label">52-wk range</span><span className="stat-value num">{fmtUsd(q.week52Low)} – {fmtUsd(q.week52High)}</span></div>
              <div className="stat"><span className="stat-label">P/E</span><span className="stat-value num">{fmtNum(q.peRatio, 1)}</span></div>
              <div className="stat"><span className="stat-label">Market cap</span><span className="stat-value num">{fmtCompactMoney(q.marketCap)}</span></div>
            </div>
            {tech.rangePct != null && (
              <div className="rangebar" title="Where the price sits in its 52-week range">
                <div className="rangebar-fill" style={{ width: `${Math.max(0, Math.min(100, tech.rangePct))}%` }} />
                <div className="rangebar-marker" style={{ left: `${Math.max(0, Math.min(100, tech.rangePct))}%` }} />
              </div>
            )}
            <p className="muted small plain-note">
              Trading at <b>{tech.rangePct != null ? `${Math.round(tech.rangePct)}%` : '—'}</b> of its
              52-week range
              {tech.volVsAvg != null ? <> · today's volume is <b>{tech.volVsAvg.toFixed(1)}×</b> its 10-day average{tech.volVsAvg > 1.5 ? ' — unusually busy' : tech.volVsAvg < 0.6 ? ' — quieter than usual' : ''}</> : ''}.
              Bid {fmtUsd(q.bid)} / ask {fmtUsd(q.ask)}
              {q.divYield != null && q.divYield > 0 ? <> · pays a {fmtPct(q.divYield)} dividend</> : ''}.
            </p>
          </MbCard>

          {/* Pre-market support / resistance: this morning's high and low
              are the first levels the open has to deal with. */}
          {((range && q.price != null) || schwabSession === 'premarket') && (
            <MbCard num="04" title="Pre-market" sub="Before today's open · live via Schwab" defaultOpen>
              {range && q.price != null ? (
                <>
                  <div className="perf-stats">
                    <div className="stat"><span className="stat-label">Pre-market high</span><span className="stat-value num">{fmtUsd(range.high)}</span></div>
                    <div className="stat"><span className="stat-label">Pre-market low</span><span className="stat-value num">{fmtUsd(range.low)}</span></div>
                    <div className="stat"><span className="stat-label">Gap vs yesterday</span><span className="stat-value num">{schwabSession === 'premarket' && q.changePct != null ? fmtPct(q.changePct) : '—'}</span></div>
                  </div>
                  <p className="muted small plain-note">
                    {q.price > range.high ? (
                      <>The price is already <b>above the whole pre-market range</b> — it gapped up and held above the morning&apos;s high. That high ({fmtUsd(range.high)}) is now the first support below.</>
                    ) : q.price < range.low ? (
                      <>The price is already <b>below the whole pre-market range</b> — it gapped down under the morning&apos;s low. That low ({fmtUsd(range.low)}) is now the first resistance above.</>
                    ) : (
                      <>The price is <b>inside this morning&apos;s range</b>. The pre-market high ({fmtUsd(range.high)}) is the first resistance above — clearing it means buyers took control before the open. The pre-market low ({fmtUsd(range.low)}) is the first support below — losing it means the pre-market buyers gave up.</>
                    )}
                    {' '}Pre-market prints run from about 7:00 AM ET.
                  </p>
                </>
              ) : (
                <p className="muted small">No pre-market trading yet — Schwab&apos;s pre-market prints start around 7:00 AM ET.</p>
              )}
            </MbCard>
          )}

          <MbCard num="05" title="Trend & momentum" sub="2 years of daily prices vs its averages and vs the S&P 500" defaultOpen>
            <div className="perf-stats">
              <div className="stat"><span className="stat-label">Trend</span><span className="stat-value">{tech.trend === 'uptrend' ? 'Uptrend' : tech.trend === 'downtrend' ? 'Downtrend' : tech.trend === 'mixed' ? 'Mixed' : '—'}</span></div>
              <div className="stat"><span className="stat-label">50-day avg</span><span className="stat-value num">{fmtUsd(tech.sma50)}</span></div>
              <div className="stat"><span className="stat-label">200-day avg</span><span className="stat-value num">{fmtUsd(tech.sma200)}</span></div>
              <div className="stat"><span className="stat-label">Daily swing (ATR)</span><span className="stat-value num">{tech.atrPct != null ? `${tech.atrPct.toFixed(1)}%` : '—'}</span></div>
            </div>
            <p className="muted small plain-note">
              {tech.trend === 'uptrend' && <>In an uptrend — price above both its 50-day and 200-day averages.</>}
              {tech.trend === 'downtrend' && <>In a downtrend — price below both its 50-day and 200-day averages.</>}
              {tech.trend === 'mixed' && <>No clean trend — price is caught between its 50-day and 200-day averages.</>}
              {tech.rs3m != null && <> Over the last 3 months it has {tech.rs3m >= 0 ? 'beaten' : 'lagged'} the S&amp;P 500 by <b>{Math.abs(tech.rs3m).toFixed(1)} points</b>.</>}
              {tech.rs6m != null && <> Over 6 months: {tech.rs6m >= 0 ? '+' : ''}{tech.rs6m.toFixed(1)} points vs the S&amp;P 500.</>}
              {tech.atrPct != null && <> A typical day moves about {tech.atrPct.toFixed(1)}% — that is the swing to expect.</>}
            </p>
          </MbCard>

          <MbCard
            num="06"
            title="Options market"
            sub={opt.nearestExpiry ? `Nearest expiry ${fmtDate(opt.nearestExpiry)} (${opt.nearestDte ?? '—'} days)` : 'Live option chain via Schwab'}
            defaultOpen
          >
            {opt.contracts === 0 ? (
              <p className="muted small">No listed options for this ticker, or the chain did not load — the rest of the dive is unaffected.</p>
            ) : (
              <>
                <div className="perf-stats">
                  <div className="stat"><span className="stat-label">ATM IV</span><span className="stat-value num">{opt.atmIv != null ? `${(opt.atmIv * 100).toFixed(0)}%` : '—'}</span></div>
                  <div className="stat"><span className="stat-label">IV vs actual moves</span><span className="stat-value num">{ivVsHv != null ? `${ivVsHv.toFixed(1)}×` : '—'}</span></div>
                  <div className="stat"><span className="stat-label">Put/call OI</span><span className="stat-value num">{opt.putCallOi != null ? opt.putCallOi.toFixed(2) : '—'}</span></div>
                  <div className="stat"><span className="stat-label">Max pain</span><span className="stat-value num">{fmtUsd(opt.maxPain)}</span></div>
                </div>
                <p className="muted small plain-note">
                  {opt.atmIv != null && tech.hv30 != null && (
                    <>Options imply about <b>{(opt.atmIv * 100).toFixed(0)}%</b> annualised moves, while the stock has actually moved about <b>{(tech.hv30 * 100).toFixed(0)}%</b> — {ivVsHv != null && ivVsHv > 1.15 ? 'options look expensive' : ivVsHv != null && ivVsHv < 0.85 ? 'options look cheap' : 'options are priced about fairly'}.</>
                  )}
                  {opt.putCallOi != null && <> Put/call open interest is <b>{opt.putCallOi.toFixed(2)}</b> — {opt.putCallOi > 1.2 ? 'traders are hedging hard, leaning cautious' : opt.putCallOi < 0.7 ? 'calls dominate, leaning bullish' : 'roughly balanced'}.</>}
                  {opt.maxPain != null && <> The pain point for the nearest expiry is <b>{fmtUsd(opt.maxPain)}</b> — where option sellers lose the least.</>}
                  {opt.callWall != null && opt.putWall != null && <> Biggest open interest: calls at {fmtUsd(opt.callWall)}, puts at {fmtUsd(opt.putWall)} — those strikes act like magnets and walls.</>}
                </p>
              </>
            )}
          </MbCard>

          {ticker && (
            <MbCard num="07" title="Smart money" sub="Congress, White House & insider flow for this ticker" defaultOpen>
              <SmartMoneyPanel
                ticker={ticker}
                flow={flow ? { direction: flow.direction, flow_score: flow.flow_score, buy_amount: flow.buy_amount, sell_amount: flow.sell_amount, net_flow: flow.net_flow, officials: flow.officials, buy_trades: flow.buy_trades, sell_trades: flow.sell_trades, cluster: flow.cluster } : null}
              />
            </MbCard>
          )}

          <MbCard num="08" title="Fundamentals" sub="Valuation, quality and growth vs its sector" defaultOpen>
            <Fundamentals ticker={data.ticker} />
          </MbCard>

          <MbCard num="09" title="Earnings & news" sub="What is coming up and what people are saying" defaultOpen>
            {nextEarnings ? (
              <p className="muted small plain-note">
                Next earnings: <b>{fmtDate(nextEarnings.reporting_date)}</b> ({nextEarnings.report_time === 'BMO' ? 'before open' : nextEarnings.report_time === 'AMC' ? 'after close' : 'time unknown'})
                {nextEarnings.eps_est != null ? <> · Wall Street expects ${fmtNum(nextEarnings.eps_est)} per share</> : ''}
                {nextEarnings.implied_move_pct != null ? <> · options imply a <b>±{nextEarnings.implied_move_pct.toFixed(1)}%</b> move on the print</> : ''}.
              </p>
            ) : (
              <p className="muted small">No upcoming earnings date on file for this ticker.</p>
            )}
            {headlines.length > 0 && (
              <ul className="dd-list">
                {headlines.map((h, i) => (
                  <li key={i}>
                    <a href={h.url} target="_blank" rel="noreferrer">{h.title}</a>{' '}
                    <span className="muted small">— {h.publisher}</span>
                  </li>
                ))}
              </ul>
            )}
            {headlines.length === 0 && <p className="muted small">No recent headlines for this ticker in the news feed.</p>}
          </MbCard>
        </>
      )}
    </section>
  );
}
