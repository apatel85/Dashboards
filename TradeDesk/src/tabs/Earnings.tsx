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
import { useFundamentals } from '../lib/useFundamentals';
import PremarketLine from '../components/PremarketLine';
import { Fundamentals } from '../components/Fundamentals';
import { fmtMoney, fmtNum, fmtPct, fmtDayLabel, fmtTimeET, prettify } from '../lib/format';
import type { EarningsEntry, EarningsQuarter } from '../types';

type SortKey = 'date' | 'ticker' | 'move' | 'conviction' | 'health';

const CAP_ORDER = ['Mega', 'Large', 'Mid', 'Small', 'Micro'] as const;

/** Client-side "today" in the user's market timezone (ET), YYYY-MM-DD. */
function etToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDaysStr(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pctTone(v: number | null | undefined): string {
  return v == null ? 'muted' : v >= 0 ? 'up' : 'down';
}

/**
 * The four post-earnings figures, compact: "1D +2.3% · 7D +5.1% · 30D — ·
 * to date +8.4%". Null = the window hasn't elapsed yet (or no baseline).
 */
function PerfSummary({ e }: { e: EarningsEntry }) {
  const parts: [string, number | null | undefined][] = [
    ['1D', e.perf_1d_pct],
    ['7D', e.perf_7d_pct],
    ['30D', e.perf_30d_pct],
    ['to date', e.perf_to_date_pct],
  ];
  return (
    <span className="mb-perf-summary">
      {parts.map(([label, v], i) => (
        <span key={label}>
          {i > 0 ? ' · ' : ''}
          <span className="muted small">{label} </span>
          <span className={`num small ${pctTone(v)}`}>{fmtPct(v, 1)}</span>
        </span>
      ))}
    </span>
  );
}

/** Full "After the report" block for the expanded detail of a reported row. */
function AfterReportBlock({ e }: { e: EarningsEntry }) {
  const row = (label: string, pct: number | null | undefined, date: string | null | undefined, note?: string) => (
    <span>
      {label}{' '}
      <b className={`num ${pctTone(pct)}`}>{fmtPct(pct, 1)}</b>
      <span className="muted small">
        {' '}
        {date ? fmtDayLabel(date) : '—'}
        {note ? ` · ${note}` : ''}
      </span>
    </span>
  );
  return (
    <div className="mb-after-report">
      <span className="detail-label">After the report — reported {fmtDayLabel(e.reporting_date)}</span>
      <div className="detail-facts">
        <span>
          Baseline (close {e.baseline_date ? fmtDayLabel(e.baseline_date) : '—'}){' '}
          <b className="num">{fmtMoney(e.baseline_price)}</b>
        </span>
        {row('1 day after', e.perf_1d_pct, e.perf_1d_date)}
        {row('7 days after', e.perf_7d_pct, e.perf_7d_date)}
        {row('30 days after', e.perf_30d_pct, e.perf_30d_date)}
        {row('To date', e.perf_to_date_pct, e.perf_as_of)}
      </div>
      <p className="muted small">
        EPS actual {fmtNum(e.eps_actual)} vs est {fmtNum(e.eps_est)}
        {e.surprise_pct != null ? ` (${fmtPct(e.surprise_pct, 1)} surprise)` : ''}. “—” means
        that window hasn&rsquo;t elapsed yet.
      </p>
    </div>
  );
}

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

/** Expected figures for the report coming up (upcoming rows only): EPS and
 * revenue estimates plus the dollar implied move, and the market context
 * from the T3 template — YTD, from the 52-week high, analyst ratings,
 * average target. Each item renders only when its field exists; the
 * pipeline leaves a field null when the source has no value for it.
 * Revenue est is "—" when the sources carry none — never invented. */
function ExpectedBlock({ e }: { e: EarningsEntry }) {
  const dollarMove =
    e.current_price != null && e.implied_move_pct != null
      ? (e.current_price * e.implied_move_pct) / 100
      : null;
  return (
    <div className="mb-expected">
      <span className="detail-label">Expected this report</span>
      <div className="stat-strip">
        <span className="stat-item">
          <span className="stat-item-label">EPS est</span>
          <b className="num">{fmtNum(e.eps_est)}</b>
        </span>
        <span className="stat-item">
          <span className="stat-item-label">Revenue est</span>
          <b className="num">{e.rev_est_b != null ? `$${fmtNum(e.rev_est_b, 1)}B` : '—'}</b>
        </span>
        <span className="stat-item">
          <span className="stat-item-label">Implied move</span>
          <b className="num">
            {fmtPct(e.implied_move_pct, 1, false)}
            {dollarMove != null ? ` (±${fmtMoney(dollarMove)})` : ''}
          </b>
        </span>
      </div>
      {(e.ytd_pct != null || e.from_high_pct != null || e.ratings_buy != null || e.target_mean != null) && (
        <div className="stat-strip mb-context-strip">
          {e.ytd_pct != null ? (
            <span className="stat-item">
              <span className="stat-item-label">Year to date</span>
              <b className={`num ${e.ytd_pct >= 0 ? 'up' : 'down'}`}>{fmtPct(e.ytd_pct, 1, false)}</b>
            </span>
          ) : null}
          {e.from_high_pct != null ? (
            <span className="stat-item">
              <span className="stat-item-label">From 52w high</span>
              <b className={`num ${e.from_high_pct >= 0 ? 'up' : 'down'}`}>{fmtPct(e.from_high_pct, 1, false)}</b>
            </span>
          ) : null}
          {e.ratings_buy != null || e.ratings_hold != null || e.ratings_sell != null ? (
            <span className="stat-item">
              <span className="stat-item-label">Analyst ratings</span>
              <b className="num">
                {e.ratings_buy ?? '—'} Buy · {e.ratings_hold ?? '—'} Hold · {e.ratings_sell ?? '—'} Sell
              </b>
            </span>
          ) : null}
          {e.target_mean != null ? (
            <span className="stat-item">
              <span className="stat-item-label">Avg target</span>
              <b className="num">
                {fmtMoney(e.target_mean)}
                {e.target_analysts != null ? <span className="muted"> ({e.target_analysts} analysts)</span> : null}
              </b>
            </span>
          ) : null}
        </div>
      )}
      {e.rev_est_b == null && (
        <p className="muted small">
          No revenue estimate is published for this report in the free sources we use.
        </p>
      )}
    </div>
  );
}

/**
 * Per-stock post-earnings history, computed from the streak (v2026-11-17a):
 * beats, average surprise, share that rose the next day, average moves.
 * The reaction aggregates and per-quarter reactions render when the
 * pipeline supplies perf fields per quarter (v2026-11-17c: report dates
 * from the Nasdaq calendar backfill + 1D/7D/30D moves from Yahoo bars).
 * A quarter with no report date in the calendar keeps null reactions and
 * the honest line says so. Never renders a zero for missing data.
 */
function StreakPerformance({ streak }: { streak: EarningsQuarter[] }) {
  if (!streak || streak.length === 0) return null;
  const beats = streak.filter((q) => q.eps_result === 'beat').length;
  const surps = streak.map((q) => q.surprise_pct).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgSurp = avg(surps);
  const r1d = streak.map((q) => q.perf_1d_pct).filter((v): v is number => v != null);
  const r7d = streak.map((q) => q.perf_7d_pct).filter((v): v is number => v != null);
  const r30d = streak.map((q) => q.perf_30d_pct).filter((v): v is number => v != null);
  const hasReactions = r1d.length > 0 || r7d.length > 0 || r30d.length > 0;
  const rose1d = r1d.filter((v) => v > 0).length;
  const avg1d = avg(r1d);
  const avg7d = avg(r7d);
  const avg30d = avg(r30d);
  const avgAbs1d = r1d.length ? r1d.reduce((a, b) => a + Math.abs(b), 0) / r1d.length : null;
  const reacted = streak.filter(
    (q) => q.perf_1d_pct != null || q.perf_7d_pct != null || q.perf_30d_pct != null,
  );
  return (
    <div className="mb-streak-perf">
      <span className="perf-line">
        Beats{' '}
        <b className="num">
          {beats} of {streak.length}
        </b>
        {avgSurp != null ? (
          <>
            {' · '}avg surprise{' '}
            <b className={`num ${pctTone(avgSurp)}`}>{fmtPct(avgSurp, 1)}</b>
          </>
        ) : null}
        {hasReactions ? (
          <>
            {' · '}rose the next day{' '}
            <b className="num">
              {rose1d} of {r1d.length}
            </b>
          </>
        ) : null}
      </span>
      {hasReactions ? (
        <>
          <span className="perf-line">
            Avg move after past reports:{' '}
            {avg1d != null ? (
              <>
                1D <b className={`num ${pctTone(avg1d)}`}>{fmtPct(avg1d, 1)}</b>
              </>
            ) : null}
            {avg7d != null ? (
              <>
                {' · '}7D <b className={`num ${pctTone(avg7d)}`}>{fmtPct(avg7d, 1)}</b>
              </>
            ) : null}
            {avg30d != null ? (
              <>
                {' · '}30D <b className={`num ${pctTone(avg30d)}`}>{fmtPct(avg30d, 1)}</b>
              </>
            ) : null}
            {avgAbs1d != null ? (
              <>
                {' · '}avg |1D| <b className="num">±{fmtPct(avgAbs1d, 1, false)}</b>
              </>
            ) : null}
          </span>
          <ul className="mb-streak-react">
            {reacted.map((q) => (
              <li key={q.quarter}>
                <span className="muted">{q.quarter}</span>
                {' · '}
                <ResultBadge result={q.eps_result} />
                {q.surprise_pct != null ? ` ${fmtPct(q.surprise_pct, 1)}` : ''}
                {q.report_date ? ` · reported ${fmtDayLabel(q.report_date)}` : ''}
                {` · 1D ${fmtPct(q.perf_1d_pct, 1)} · 7D ${fmtPct(q.perf_7d_pct, 1)} · 30D ${fmtPct(q.perf_30d_pct, 1)}`}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span className="perf-line muted small">
          No price reactions found for these quarters — their report dates
          aren&rsquo;t in the free calendar we use. Beats and surprises above
          are from today&rsquo;s data.
        </span>
      )}
    </div>
  );
}

/**
 * Same-industry peers that often move with this stock around earnings
 * (T3 cheat-sheet idea). From fundamentals.json only — same subsector as
 * the row's industry, largest first, top 12. Hidden when the data has no
 * peers; never padded with invented names.
 */
function SympathyBlock({ ticker, industry }: { ticker: string; industry: string }) {
  const { sympathy } = useFundamentals();
  const peers = sympathy(ticker, industry, 12);
  if (peers.length === 0) return null;
  return (
    <div className="mb-sympathy">
      <span className="detail-label">Should move in sympathy — {industry}</span>
      <div className="sympathy-list">
        {peers.map((p) => (
          <span key={p.ticker} title={p.name}>
            <TvLink ticker={p.ticker} />
          </span>
        ))}
      </div>
      <p className="muted small">
        Same {industry} industry, largest first. These often move with {ticker} around
        earnings — a watchlist, not a recommendation.
      </p>
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
          {e.status === 'reported' ? (
            <>
              <Badge tone="dim">Reported</Badge>
              <span className="subname">{fmtDayLabel(e.reporting_date)}</span>
              <PerfSummary e={e} />
            </>
          ) : (
            <>
              <Badge tone={timeTone}>{e.report_time}</Badge>
              <span className="subname">{fmtDayLabel(e.reporting_date)}</span>
            </>
          )}
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
          {e.implied_move_pct != null && e.current_price != null ? (
            <span className="subname">
              ±{fmtMoney((e.current_price * e.implied_move_pct) / 100)}
            </span>
          ) : null}
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
            {e.status === 'reported' && <AfterReportBlock e={e} />}
            {e.status === 'upcoming' && <ExpectedBlock e={e} />}
            <div className="detail-grid">
              <div>
                <span className="detail-label">
                  {e.streak.length > 0
                    ? `Last ${e.streak.length} quarters (EPS result · surprise)`
                    : 'Last quarters (EPS result · surprise)'}
                </span>
                <StreakCell streak={e.streak} />
                <StreakPerformance streak={e.streak} />
                <div className="detail-facts">
                  <span>
                    Sector <b>{e.sector}</b> · {e.industry}
                  </span>
                  <span>
                    Cap <b>{e.cap_tier}</b>
                  </span>
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
            <SympathyBlock ticker={e.ticker} industry={e.industry} />
            <Fundamentals ticker={e.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function EarningsTab() {
  const { data, loading, error } = useJsonData<EarningsEntry[]>('earnings.json');
  const [query, setQuery] = useState('');
  const [capFilter, setCapFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('date');
  // Date buckets: Today + Tomorrow start expanded, everything else collapsed.
  const today = etToday();
  const tomorrow = addDaysStr(today, 1);
  const [openBuckets, setOpenBuckets] = useState<Set<string>>(() => new Set([today, tomorrow]));

  useEffect(() => {
    if (data) setQuoteUniverse(data.map((e) => e.ticker));
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
  }, [data, query, capFilter, sort]);

  /**
   * Buckets by reporting date: upcoming dates ascending first (today,
   * tomorrow, …), then reported dates descending (most recent first).
   * A bucket's kind follows its rows — a date can mix reported + upcoming
   * only on "today" itself.
   */
  const buckets = useMemo(() => {
    const byDate = new Map<string, EarningsEntry[]>();
    for (const e of filtered) {
      const arr = byDate.get(e.reporting_date) ?? [];
      arr.push(e);
      byDate.set(e.reporting_date, arr);
    }
    const upcoming = [...byDate.keys()].filter((d) => d >= today).sort();
    const reported = [...byDate.keys()].filter((d) => d < today).sort().reverse();
    return [...upcoming, ...reported].map((date) => ({
      date,
      rows: byDate.get(date)!,
      isReported: (byDate.get(date) ?? []).every((e) => e.status === 'reported'),
    }));
  }, [filtered, today]);

  const toggleBucket = (date: string) =>
    setOpenBuckets((cur) => {
      const next = new Set(cur);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const bucketTitle = (b: { date: string; isReported: boolean }) => {
    if (b.date === today) return `Today · ${fmtDayLabel(b.date)}`;
    if (b.date === tomorrow) return `Tomorrow · ${fmtDayLabel(b.date)}`;
    if (b.isReported) return `Reported · ${fmtDayLabel(b.date)}`;
    return fmtDayLabel(b.date);
  };

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
          Reported dates show what the stock actually did after the announcement
          (1 day, 7 days, 30 days, and to date). Tap a date to open its reports.
        </p>
      </header>

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
        {query || capFilter !== 'all' ? ' — filters applied' : ''}
      </p>
      <p className="mb-legend">
        <b>H</b> = company health · <b>P</b> = chance the stock goes up ·{' '}
        <b>C</b> = setup strength · <b>Impl. move</b> = how much the options
        market expects the stock to move
      </p>

      {filtered.length === 0 ? (
        <p className="mb-empty">No companies match these filters. Clear the search or pick a different size.</p>
      ) : (
        buckets.map((b, i) => {
          const open = openBuckets.has(b.date);
          return (
            <div className="mb-card" key={b.date}>
              <div
                className="mb-card-head"
                onClick={() => toggleBucket(b.date)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    toggleBucket(b.date);
                  }
                }}
                aria-expanded={open}
              >
                <span className="mb-card-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="mb-card-title">{bucketTitle(b)}</span>
                <span className="mb-card-sub">
                  {b.isReported ? 'reported · tap a row for what happened after' : 'tap a row for streak, news & detail'}
                </span>
                <span className="mb-count-badge">{b.rows.length}</span>
                <span className="mb-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
              </div>

              {open && (
                <div className="mb-card-body">
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
                        {b.rows.map((e) => (
                          <EarningsRow key={e.ticker} e={e} maxMove={maxMove} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
