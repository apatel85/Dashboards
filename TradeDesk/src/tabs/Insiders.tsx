import '../mockb-insiders.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { TvLink, LoadingPanel } from '../components/ui';
import { Fundamentals } from '../components/Fundamentals';
import { useJsonData } from '../lib/useJsonData';
import { fmtDateY, fmtInt, fmtMoney } from '../lib/format';

/**
 * Insiders tab (Mock B card 05) — company insiders' own trades, from the
 * SEC Form 4 filings in `public/data/insiders.json`. Live data only.
 * Research / education only — never financial advice.
 */

interface InsiderRow {
  ticker: string;
  owner_name: string | null;
  role: string | null;
  transaction_code: string | null;
  shares: number | null;
  price: number | null;
  transaction_date: string | null;
  filed_date: string | null;
  cik: string | null;
  accession: string | null;
}

const PAGE_SIZE = 50;

type CodeFilter = 'all' | 'P' | 'S' | 'other';
type SortKey = 'filed' | 'txn' | 'shares' | 'ticker';

/** Plain-English meaning of each SEC Form 4 transaction code. */
const CODE_LABEL: Record<string, string> = {
  P: 'Open-market purchase',
  S: 'Open-market sale',
  M: 'Option exercised',
  F: 'Shares kept for taxes',
  A: 'Grant or award',
  C: 'Conversion',
  D: 'Given back to the company',
  G: 'Gift',
  J: 'Other',
};

function codeLabel(code: string | null): string {
  if (!code) return 'Not stated';
  return CODE_LABEL[code] ?? `Other (${code})`;
}

function codeGroup(code: string | null): 'P' | 'S' | 'other' {
  if (code === 'P') return 'P';
  if (code === 'S') return 'S';
  return 'other';
}

function rowKey(r: InsiderRow, i: number): string {
  return `${r.accession ?? 'no-acc'}-${r.ticker}-${r.transaction_date ?? ''}-${r.shares ?? ''}-${i}`;
}

function sortRows(rows: InsiderRow[], sort: SortKey): InsiderRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'filed':
      return copy.sort((a, b) => (b.filed_date ?? '').localeCompare(a.filed_date ?? ''));
    case 'txn':
      return copy.sort((a, b) =>
        (b.transaction_date ?? '').localeCompare(a.transaction_date ?? ''),
      );
    case 'shares':
      return copy.sort((a, b) => (b.shares ?? 0) - (a.shares ?? 0));
    case 'ticker':
      return copy.sort((a, b) => (a.ticker ?? '').localeCompare(b.ticker ?? ''));
  }
}

export default function InsidersTab() {
  const { data, loading, error } = useJsonData<InsiderRow[]>('insiders.json');
  const rows: InsiderRow[] = Array.isArray(data) ? data : [];

  const [mixOpen, setMixOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CodeFilter>('all');
  const [sort, setSort] = useState<SortKey>('filed');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const tableCardRef = useRef<HTMLElement>(null);

  // Freshness: latest filing date actually in the file.
  const latestFiled = useMemo(
    () => rows.reduce((max, r) => (r.filed_date && r.filed_date > max ? r.filed_date : max), ''),
    [rows],
  );

  const mix = useMemo(() => {
    const purchases = rows.filter((r) => r.transaction_code === 'P').length;
    const sales = rows.filter((r) => r.transaction_code === 'S').length;
    const other = rows.length - purchases - sales;
    const byCode = new Map<string, number>();
    for (const r of rows) {
      const c = r.transaction_code ?? '—';
      byCode.set(c, (byCode.get(c) ?? 0) + 1);
    }
    const otherCodes = [...byCode.entries()]
      .filter(([c]) => c !== 'P' && c !== 'S')
      .sort((a, b) => b[1] - a[1]);
    return { purchases, sales, other, otherCodes, total: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (filter === 'P' && r.transaction_code !== 'P') return false;
      if (filter === 'S' && r.transaction_code !== 'S') return false;
      if (filter === 'other' && codeGroup(r.transaction_code) !== 'other') return false;
      if (q) {
        const hay = `${r.ticker ?? ''} ${r.owner_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortRows(base, sort);
  }, [rows, filter, query, sort]);

  // Any filter/search/sort change restarts at page 1.
  useEffect(() => {
    setPage(0);
    setExpanded(null);
  }, [filter, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function applyMixFilter(next: CodeFilter) {
    setFilter(next);
    setTableOpen(true);
    requestAnimationFrame(() => {
      tableCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  const pct = (n: number) => (mix.total > 0 ? Math.round((n / mix.total) * 100) : 0);

  if (loading) return <LoadingPanel what="insider filings" />;

  if (error || rows.length === 0) {
    return (
      <div>
        <h2 className="mb-tabhead">Insiders</h2>
        <p className="mb-lede">
          What company insiders — executives, directors and big shareholders — are
          doing with their own company&apos;s stock.
        </p>
        <div className="mb-card">
          <div className="ins-empty">
            <div className="ins-empty-title">No insider filings yet</div>
            <p>
              This tab reads <code>insiders.json</code>, which the scheduled data
              pipeline has not written yet.
              {error ? ` (last fetch: ${error})` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ins-tab">
      <h2 className="mb-tabhead">Insiders</h2>
      <p className="mb-lede">
        What company insiders — executives, directors and big shareholders — are
        doing with their own company&apos;s stock. Buying can mean they think the
        stock is cheap; selling often just means paying tax or taking profits, so
        one sale on its own says little. Filings can lag the actual trade by days,
        and this file only covers the filings the pipeline has collected so far.
      </p>
      <p className="ins-fresh">
        Latest filing in this file: <b>{latestFiled ? fmtDateY(latestFiled) : '—'}</b>
        {' · '}
        {fmtInt(mix.total)} filings across {fmtInt(new Set(rows.map((r) => r.ticker)).size)} tickers
      </p>
      <p className="ins-disclaimer">Research only — not financial advice.</p>

      {/* 01 — Transaction mix */}
      <section className="mb-card" aria-label="Transaction mix">
        <button
          type="button"
          className="mb-card-head ins-card-head"
          onClick={() => setMixOpen((v) => !v)}
          aria-expanded={mixOpen}
        >
          <span className="mb-card-num">01</span>
          <span className="mb-card-title">Transaction mix</span>
          <span className="mb-card-sub">
            {fmtInt(mix.purchases)} buys · {fmtInt(mix.sales)} sells · {fmtInt(mix.other)} other
          </span>
          <span className="mb-count-badge">{fmtInt(mix.total)} filings</span>
          <span className="ins-chevron" aria-hidden="true">{mixOpen ? '▾' : '▸'}</span>
        </button>
        {mixOpen && (
          <div className="ins-card-body">
            <p className="ins-hint">
              Tap a segment to show only those filings in the table below.
            </p>
            <div
              className="ins-mixbar"
              role="img"
              aria-label={`${pct(mix.purchases)}% purchases, ${pct(mix.sales)}% sales, ${pct(mix.other)}% other`}
            >
              <span
                className="ins-mix-seg ins-seg-buy"
                style={{ width: `${pct(mix.purchases)}%` }}
              />
              <span
                className="ins-mix-seg ins-seg-sell"
                style={{ width: `${pct(mix.sales)}%` }}
              />
              <span
                className="ins-mix-seg ins-seg-other"
                style={{ width: `${pct(mix.other)}%` }}
              />
            </div>
            <div className="ins-mix-rows">
              <button
                type="button"
                className={`ins-mix-row${filter === 'P' ? ' ins-mix-active' : ''}`}
                onClick={() => applyMixFilter('P')}
                aria-pressed={filter === 'P'}
              >
                <span className="ins-dot ins-dot-buy" aria-hidden="true" />
                <span className="ins-mix-label">Purchases (P)</span>
                <span className="ins-mix-note">Insiders buying in the open market</span>
                <span className="ins-mix-count num">{fmtInt(mix.purchases)}</span>
                <span className="ins-mix-pct num">{pct(mix.purchases)}%</span>
              </button>
              <button
                type="button"
                className={`ins-mix-row${filter === 'S' ? ' ins-mix-active' : ''}`}
                onClick={() => applyMixFilter('S')}
                aria-pressed={filter === 'S'}
              >
                <span className="ins-dot ins-dot-sell" aria-hidden="true" />
                <span className="ins-mix-label">Sales (S)</span>
                <span className="ins-mix-note">Insiders selling in the open market</span>
                <span className="ins-mix-count num">{fmtInt(mix.sales)}</span>
                <span className="ins-mix-pct num">{pct(mix.sales)}%</span>
              </button>
              <button
                type="button"
                className={`ins-mix-row${filter === 'other' ? ' ins-mix-active' : ''}`}
                onClick={() => applyMixFilter('other')}
                aria-pressed={filter === 'other'}
              >
                <span className="ins-dot ins-dot-other" aria-hidden="true" />
                <span className="ins-mix-label">Other filings</span>
                <span className="ins-mix-note">
                  Option exercises, tax withholding, gifts and more
                </span>
                <span className="ins-mix-count num">{fmtInt(mix.other)}</span>
                <span className="ins-mix-pct num">{pct(mix.other)}%</span>
              </button>
            </div>
            {mix.otherCodes.length > 0 && (
              <div className="ins-other-codes">
                <span className="ins-detail-label">What “other” is made of</span>
                <ul className="ins-code-list">
                  {mix.otherCodes.map(([code, count]) => (
                    <li key={code}>
                      <b>{code}</b> — {codeLabel(code)} · {fmtInt(count)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 02 — All transactions */}
      <section className="mb-card" aria-label="All transactions" ref={tableCardRef}>
        <button
          type="button"
          className="mb-card-head ins-card-head"
          onClick={() => setTableOpen((v) => !v)}
          aria-expanded={tableOpen}
        >
          <span className="mb-card-num">02</span>
          <span className="mb-card-title">All transactions</span>
          <span className="mb-card-sub">Tap a row for the full filing detail</span>
          <span className="mb-count-badge">{fmtInt(filtered.length)} shown</span>
          <span className="ins-chevron" aria-hidden="true">{tableOpen ? '▾' : '▸'}</span>
        </button>
        {tableOpen && (
          <div className="ins-card-body">
            <div className="ins-controls">
              <input
                type="search"
                className="ins-search"
                placeholder="Search ticker or insider name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search by ticker or insider name"
              />
              <div className="ins-filter-pills" role="group" aria-label="Transaction type filter">
                {(
                  [
                    ['all', 'All'],
                    ['P', 'Purchases'],
                    ['S', 'Sales'],
                    ['other', 'Other'],
                  ] as [CodeFilter, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`ins-pill${filter === id ? ' ins-pill-active' : ''}`}
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="ins-sort">
                <span>Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Sort transactions"
                >
                  <option value="filed">Filed date (newest first)</option>
                  <option value="txn">Trade date (newest first)</option>
                  <option value="shares">Shares (most first)</option>
                  <option value="ticker">Ticker (A–Z)</option>
                </select>
              </label>
            </div>

            {filtered.length === 0 ? (
              <p className="ins-empty-note">
                No filings match that search or filter. Try clearing the search or
                choosing “All”.
              </p>
            ) : (
              <>
                <div className="ins-table-wrap">
                  <table className="ins-table">
                    <thead>
                      <tr>
                        <th scope="col">Ticker</th>
                        <th scope="col">Insider</th>
                        <th scope="col">Type</th>
                        <th scope="col" className="num">Shares</th>
                        <th scope="col" className="num">Price</th>
                        <th scope="col">Traded</th>
                        <th scope="col">Filed</th>
                        <th scope="col" aria-label="Expand" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => {
                        const key = rowKey(r, safePage * PAGE_SIZE + i);
                        const isOpen = expanded === key;
                        const group = codeGroup(r.transaction_code);
                        const value =
                          r.shares != null && r.price != null ? r.shares * r.price : null;
                        return (
                          <Fragment key={key}>
                            <tr
                              className={`ins-row${isOpen ? ' ins-row-open' : ''}`}
                              onClick={() => setExpanded(isOpen ? null : key)}
                            >
                              <td>
                                <TvLink ticker={r.ticker} />
                              </td>
                              <td className="ins-owner">{r.owner_name ?? '—'}</td>
                              <td>
                                <span
                                  className={`ins-code ins-code-${group}`}
                                  title={codeLabel(r.transaction_code)}
                                >
                                  {r.transaction_code ?? '—'}
                                </span>
                              </td>
                              <td className="num">{fmtInt(r.shares)}</td>
                              <td className="num">{fmtMoney(r.price)}</td>
                              <td>{fmtDateY(r.transaction_date)}</td>
                              <td>{fmtDateY(r.filed_date)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="ins-expand-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(isOpen ? null : key);
                                  }}
                                  aria-expanded={isOpen}
                                  aria-label={`${isOpen ? 'Hide' : 'Show'} filing detail for ${r.ticker}`}
                                >
                                  {isOpen ? '▾' : '▸'}
                                </button>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="ins-detail-row">
                                <td colSpan={8}>
                                  <div className="ins-detail">
                                    <div className="ins-detail-grid">
                                      <div>
                                        <span className="ins-detail-label">Insider</span>
                                        <span className="ins-detail-value">{r.owner_name ?? '—'}</span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Role</span>
                                        <span className="ins-detail-value">{r.role ?? '—'}</span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Type</span>
                                        <span className="ins-detail-value">
                                          {r.transaction_code ?? '—'} —{' '}
                                          {codeLabel(r.transaction_code)}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Shares</span>
                                        <span className="ins-detail-value num">{fmtInt(r.shares)}</span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Price per share</span>
                                        <span className="ins-detail-value num">{fmtMoney(r.price)}</span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Total value</span>
                                        <span className="ins-detail-value num">{fmtMoney(value)}</span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Trade date</span>
                                        <span className="ins-detail-value">
                                          {fmtDateY(r.transaction_date)}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Filed date</span>
                                        <span className="ins-detail-value">
                                          {fmtDateY(r.filed_date)}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">CIK (SEC filer ID)</span>
                                        <span className="ins-detail-value num">{r.cik ?? '—'}</span>
                                      </div>
                                      <div>
                                        <span className="ins-detail-label">Filing ID</span>
                                        <span className="ins-detail-value num">
                                          {r.accession ?? '—'}
                                        </span>
                                      </div>
                                    </div>
                                    <Fundamentals ticker={r.ticker} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="ins-pager">
                  <button
                    type="button"
                    className="ins-page-btn"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span className="ins-page-label">
                    Page {safePage + 1} of {pageCount} · {fmtInt(filtered.length)} filings
                  </span>
                  <button
                    type="button"
                    className="ins-page-btn"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
