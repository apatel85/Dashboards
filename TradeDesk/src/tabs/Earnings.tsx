import '../mockb-earnings.css';
import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState';
import {
  ScoreBar,
  Badge,
  SignalBadge,
  ResultBadge,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { setQuoteUniverse, useLivePrice } from '../lib/quotes';
import PremarketLine from '../components/PremarketLine';
import { Fundamentals } from '../components/Fundamentals';
import { fmtMoney, fmtNum, fmtPct, fmtDayLabel, fmtTimeET, prettify } from '../lib/format';
import type { EarningsEntry, EarningsQuarter } from '../types';

type SortKey = 'date' | 'ticker' | 'move' | 'conviction' | 'health';

const CAP_ORDER = ['Mega', 'Large', 'Mid', 'Small', 'Micro'] as const;

function StreakCell({ streak }: { streak: EarningsQuarter[] }) {
  if (!streak || streak.length === 0) return <span className="muted">—</span>;
  return (
    <div className="streak">
      {streak.map((q) => (
        <div className="streak-q" key={q.quarter}>
          <span className="streak-label">{q.quarter}</span>
          <span className="streak-line">
            <span className="muted small">EPS</span> <ResultBadge result={q.eps_result} />
          </span>
          {q.revenue_result ? (
            <span className="streak-line">
              <span className="muted small">Rev</span> <ResultBadge result={q.revenue_result} />
            </span>
          ) : null}
          <span className={`num small ${q.surprise_pct != null ? (q.surprise_pct >= 0 ? 'up' : 'down') : 'muted'}`}>
            {fmtPct(q.surprise_pct, 1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EarningsRow({ e, maxMove }: { e: EarningsEntry; maxMove: number }) {
  const [open, setOpen] = useState(false);
  const lp = useLivePrice(e.ticker, e.current_price);
  const timeTone = e.report_time === 'BMO' ? 'blue' : e.report_time === 'AMC' ? 'amber' : 'dim';
  // Current-report result vs estimate (live data only — no hardcoded verdicts).
  const epsResult =
    e.eps_actual != null && e.eps_est != null
      ? e.eps_actual > e.eps_est
        ? ('beat' as const)
        : e.eps_actual < e.eps_est
          ? ('miss' as const)
          : ('in-line' as const)
      : null;
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} title="Click for detail">
        <td data-th="Ticker">
          <TvLink ticker={e.ticker} />
          <span className="subname">{e.name}</span>
        </td>
        <td data-th="Reports">
          <Badge tone={timeTone}>{e.report_time}</Badge>
          <span className="subname">{fmtDayLabel(e.reporting_date)}</span>
        </td>
        <td data-th="Price" className="num r">
          {lp.live ? <span className="livedot" title="Live ~15-min delayed quote" /> : null}
          {fmtMoney(lp.price)}
          <span className="subname">
            {lp.live && lp.fetchedAt
              ? `live ${fmtTimeET(new Date(lp.fetchedAt).toISOString())}`
              : e.price_ts
                ? fmtTimeET(e.price_ts)
                : ''}
          </span>
          <PremarketLine pm={lp.premarket} />
        </td>
        <td data-th="Impl. move" className="num r">
          <span className="mb-move-num">{fmtPct(e.implied_move_pct, 1, false)}</span>
          {e.implied_move_pct != null && maxMove > 0 ? (
            <span
              className="mb-move-bar"
              title={`Options market expects about ${fmtPct(e.implied_move_pct, 1, false)} move by expiry`}
            >
              <span
                className="mb-move-fill"
                style={{ width: `${Math.min(100, (e.implied_move_pct / maxMove) * 100)}%` }}
              />
            </span>
          ) : null}
        </td>
        <td data-th="EPS" className="num r hide-sm">
          {e.eps_actual != null ? (
            <>
              <span title="Actual">{fmtNum(e.eps_actual)}</span>
              <span className="subname">act · est {fmtNum(e.eps_est)}</span>
              <span className="mb-eps-chip">
                <ResultBadge result={epsResult} />
              </span>
            </>
          ) : (
            <>
              {fmtNum(e.eps_est)}
              <span className="subname">est</span>
            </>
          )}
        </td>
        <td data-th="H / P / C" className="hide-sm">
          <div className="minibars mb-hpc">
            <span className="minibar" title={`Health ${e.health_score ?? '—'} — how solid the company's finances are`}>
              <span className="minibar-label">H</span>
              <ScoreBar value={e.health_score} small />
            </span>
            <span className="minibar" title={`Chance the stock goes up ${e.prob_up_pct ?? '—'}%`}>
              <span className="minibar-label">P</span>
              <ScoreBar value={e.prob_up_pct} small />
            </span>
            <span className="minibar" title={`Conviction ${e.conviction ?? '—'} — how strong the setup looks`}>
              <span className="minibar-label">C</span>
              <ScoreBar value={e.conviction} small />
            </span>
          </div>
        </td>
        <td data-th="Signals" className="hide-sm">
          <div className="sigstack">
            <span title="Insider signal">
              <SignalBadge signal={e.insider_signal} />
            </span>
            <span title="Political signal">
              <SignalBadge signal={e.political_signal} />
            </span>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Last 4 quarters (EPS result · surprise)</span>
                <StreakCell streak={e.streak} />
                <div className="detail-facts">
                  <span>
                    Sector <b>{e.sector}</b> · {e.industry}
                  </span>
                  <span>
                    Cap <b>{e.cap_tier}</b>
                  </span>
                  {e.rev_est_b != null ? (
                    <span>
                      Rev est <b className="num">${fmtNum(e.rev_est_b)}B</b>
                    </span>
                  ) : null}
                  {e.iv_rank != null ? (
                    <span>
                      IV rank <b className="num">{e.iv_rank}</b>
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <span className="detail-label">News</span>
                {e.news.length > 0 ? (
                  <ul className="news-list">
                    {e.news.map((n, i) => (
                      <li key={i}>
                        <span
                          className={`sentdot s-${n.sentiment}`}
                          title={prettify(n.sentiment)}
                        />
                        <span className="news-head">{n.headline}</span>
                        <span className="muted small">
                          {' '}
                          · {n.source} · {n.date}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
            <Fundamentals ticker={e.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function EarningsTab() {
  const { data, loading, error } = useJsonData<EarningsEntry[]>('earnings.json');
  const [cardOpen, setCardOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [capFilter, setCapFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('date');

  useEffect(() => {
    if (data) setQuoteUniverse(data.map((e) => e.ticker));
  }, [data]);

  const dates = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((e) => e.reporting_date))].sort();
  }, [data]);

  const caps = useMemo(() => {
    if (!data) return [];
    const present = new Set(data.map((e) => e.cap_tier));
    return CAP_ORDER.filter((c) => present.has(c));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = data.filter((e) => {
      if (dateFilter !== 'all' && e.reporting_date !== dateFilter) return false;
      if (capFilter !== 'all' && e.cap_tier !== capFilter) return false;
      if (q) {
        const hay = `${e.ticker} ${e.name} ${e.sector}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const num = (v: number | null | undefined) => (v == null ? -Infinity : v);
    rows.sort((a, b) => {
      switch (sort) {
        case 'ticker':
          return a.ticker.localeCompare(b.ticker);
        case 'move':
          return num(b.implied_move_pct) - num(a.implied_move_pct);
        case 'conviction':
          return num(b.conviction) - num(a.conviction);
        case 'health':
          return num(b.health_score) - num(a.health_score);
        case 'date':
        default:
          return (
            a.reporting_date.localeCompare(b.reporting_date) ||
            num(b.conviction) - num(a.conviction)
          );
      }
    });
    return rows;
  }, [data, query, dateFilter, capFilter, sort]);

  const maxMove = useMemo(
    () => filtered.reduce((m, e) => Math.max(m, e.implied_move_pct ?? 0), 0),
    [filtered],
  );

  if (loading) return <LoadingPanel what="earnings calendar" />;
  if (error || !data)
    return <ErrorPanel file="public/data/earnings.json" error={error ?? 'empty file'} />;
  if (data.length === 0)
    return (
      <EmptyState
        dataFile="public/data/earnings.json"
        loading={false}
        error={null}
        items={['No companies reporting in the current window.']}
      />
    );

  return (
    <section className="tab mb-earnings">
      <header className="tab-header">
        <h2 className="mb-tabhead">Earnings calendar</h2>
        <p className="mb-lede">
          Companies reporting earnings soon — prices often jump or drop hard around the
          announcement. <b>Conviction</b> = how strong the setup looks; <b>Health</b> =
          how solid the company&rsquo;s finances are. Tap a row for the full detail.
        </p>
      </header>

      <div className="mb-card">
        <div
          className="mb-card-head"
          onClick={() => setCardOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              setCardOpen((o) => !o);
            }
          }}
          aria-expanded={cardOpen}
        >
          <span className="mb-card-num">01</span>
          <span className="mb-card-title">All {data.length} reports</span>
          <span className="mb-card-sub">rolling window · tap a row for streak, news &amp; detail</span>
          <span className="mb-count-badge">{filtered.length} shown</span>
          <span className="mb-chev" aria-hidden="true">{cardOpen ? '▾' : '▸'}</span>
        </div>

        {cardOpen && (
          <div className="mb-card-body">
            <div className="mb-toolbar" role="search">
              <input
                className="mb-search"
                type="search"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder="Search ticker, company or sector"
                aria-label="Search by ticker, company or sector"
              />
              <label className="mb-filter">
                <span className="mb-filter-label">Report date</span>
                <select
                  value={dateFilter}
                  onChange={(ev) => setDateFilter(ev.target.value)}
                  aria-label="Filter by report date"
                >
                  <option value="all">All dates</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {fmtDayLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mb-filter">
                <span className="mb-filter-label">Company size</span>
                <select
                  value={capFilter}
                  onChange={(ev) => setCapFilter(ev.target.value)}
                  aria-label="Filter by company size"
                >
                  <option value="all">All sizes</option>
                  {caps.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mb-filter">
                <span className="mb-filter-label">Sort by</span>
                <select
                  value={sort}
                  onChange={(ev) => setSort(ev.target.value as SortKey)}
                  aria-label="Sort rows"
                >
                  <option value="date">Report date</option>
                  <option value="ticker">Ticker A–Z</option>
                  <option value="move">Implied move</option>
                  <option value="conviction">Conviction</option>
                  <option value="health">Health</option>
                </select>
              </label>
            </div>
            <p className="mb-showing">
              Showing {filtered.length} of {data.length} rows
              {query || dateFilter !== 'all' || capFilter !== 'all'
                ? ' — filters applied'
                : ''}
            </p>
            <p className="mb-legend">
              <b>H</b> = company health · <b>P</b> = chance the stock goes up ·{' '}
              <b>C</b> = setup strength · <b>Impl. move</b> = how much the options
              market expects the stock to move
            </p>

            {filtered.length === 0 ? (
              <p className="mb-empty">No companies match these filters. Clear the search or pick a different date or size.</p>
            ) : (
              <div className="table-scroll mb-table-scroll">
                <table className="dtable mb-earnings-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Reports</th>
                      <th className="r">Price</th>
                      <th className="r">Impl. move</th>
                      <th className="r hide-sm">EPS</th>
                      <th className="r hide-sm mb-hpc-head" title="Health / chance the stock goes up / setup strength">
                        H / P / C
                      </th>
                      <th className="hide-sm">Signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <EarningsRow key={e.ticker} e={e} maxMove={maxMove} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
