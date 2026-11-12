import { useMemo, useState } from 'react';
import '../mockb-news.css';
import type { NewsFile } from '../types';
import { useJsonData } from '../lib/useJsonData';
import { ErrorPanel, LoadingPanel, TvLink } from '../components/ui';

const PAGE_SIZE = 25;

/** "2h ago", "45m ago", "3d ago" — "—" when the date is unknown. */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** e.g. "Nov 10, 2026, 1:06 PM ET" — "—" when the timestamp is missing. */
function fmtAsOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '—';
  return (
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    }) + ' ET'
  );
}

export default function NewsTab() {
  const { data, loading, error } = useJsonData<NewsFile>('news.json');
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const items = useMemo(() => data?.items ?? [], [data]);

  const tickers = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      if (item.ticker) seen.add(item.ticker);
    }
    return [...seen].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => (ticker === 'ALL' ? true : item.ticker === ticker))
      .filter((item) => (q ? item.title.toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) => {
        const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
        const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
        return tb - ta;
      });
  }, [items, ticker, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const setTickerAndReset = (value: string) => {
    setTicker(value);
    setPage(0);
  };
  const setQueryAndReset = (value: string) => {
    setQuery(value);
    setPage(0);
  };

  if (loading) return <LoadingPanel what="news" />;
  if (error) return <ErrorPanel file="news.json" error={error} />;

  const total = data?.count ?? items.length;

  return (
    <div className="mb-news">
      <h1 className="mb-tabhead">News</h1>
      <p className="mb-lede">
        The latest headlines for the stocks this app tracks — newest first.
        Tap a headline to read the full story on the publisher&apos;s site.
        This is research, not financial advice.
      </p>
      <p className="mb-news-asof">
        Updated {fmtAsOf(data?.as_of)} · {total} headline{total === 1 ? '' : 's'}
      </p>

      <section className="mb-card" aria-label="All headlines">
        <button
          type="button"
          className="mb-card-head mb-news-cardhead"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="mb-card-num">01</span>
          <span className="mb-card-title">All headlines</span>
          <span className="mb-count-badge">
            {filtered.length} headline{filtered.length === 1 ? '' : 's'}
          </span>
          <span className="mb-news-chevron" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </button>

        {open && (
          <div className="mb-news-body">
            {items.length === 0 ? (
              <p className="mb-news-empty">
                No headlines in the feed right now — check back after the next
                news run.
              </p>
            ) : (
              <>
                <div className="mb-news-filters">
                  <label className="mb-news-field">
                    <span className="mb-news-label">Stock</span>
                    <select
                      className="mb-news-control"
                      value={ticker}
                      onChange={(e) => setTickerAndReset(e.target.value)}
                      aria-label="Filter headlines by stock"
                    >
                      <option value="ALL">All tickers</option>
                      {tickers.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mb-news-field mb-news-field-search">
                    <span className="mb-news-label">Search headlines</span>
                    <input
                      type="search"
                      className="mb-news-control"
                      value={query}
                      onChange={(e) => setQueryAndReset(e.target.value)}
                      placeholder="Search headline text…"
                      aria-label="Search headlines by title"
                    />
                  </label>
                </div>

                {filtered.length === 0 ? (
                  <div className="mb-news-empty">
                    <p>
                      No headlines match that stock or search.
                    </p>
                    <button
                      type="button"
                      className="mb-back"
                      onClick={() => {
                        setTicker('ALL');
                        setQuery('');
                        setPage(0);
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="mb-news-list">
                      {pageItems.map((item, i) => (
                        <li key={`${item.url}-${i}`} className="mb-news-row">
                          <a
                            className="mb-news-title"
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.title}
                          </a>
                          <div className="mb-news-meta">
                            <TvLink ticker={item.ticker} />
                            <span className="mb-news-publisher">
                              {item.publisher || '—'}
                            </span>
                            <span className="mb-news-time">
                              {timeAgo(item.published_at)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {pageCount > 1 && (
                      <nav
                        className="mb-news-pager"
                        aria-label="Headline pages"
                      >
                        <button
                          type="button"
                          className="mb-back"
                          disabled={safePage === 0}
                          onClick={() => setPage(safePage - 1)}
                        >
                          ← Prev
                        </button>
                        <span className="mb-news-pageinfo">
                          Page {safePage + 1} of {pageCount}
                        </span>
                        <button
                          type="button"
                          className="mb-back"
                          disabled={safePage >= pageCount - 1}
                          onClick={() => setPage(safePage + 1)}
                        >
                          Next →
                        </button>
                      </nav>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
