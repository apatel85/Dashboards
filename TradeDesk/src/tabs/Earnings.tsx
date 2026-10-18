import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState';
import {
  ScoreBar,
  Badge,
  SignalBadge,
  ResultBadge,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { setQuoteUniverse, useLivePrice } from '../lib/quotes';
import PremarketLine from '../components/PremarketLine';
import { fmtMoney, fmtNum, fmtPct, fmtDayLabel, fmtTimeET, prettify } from '../lib/format';
import type { EarningsEntry, EarningsQuarter } from '../types';

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

function EarningsRow({ e }: { e: EarningsEntry }) {
  const [open, setOpen] = useState(false);
  const lp = useLivePrice(e.ticker, e.current_price);
  const timeTone = e.report_time === 'BMO' ? 'blue' : e.report_time === 'AMC' ? 'amber' : 'dim';
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} title="Click for detail">
        <td data-th="Ticker">
          <TvLink ticker={e.ticker} />
          <span className="subname">{e.name}</span>
        </td>
        <td data-th="Reports">
          <Badge tone={timeTone}>{e.report_time}</Badge>
        </td>
        <td data-th="Price" className="num">
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
        <td data-th="Impl. move" className="num">{fmtPct(e.implied_move_pct, 1, false)}</td>
        <td data-th="EPS" className="num hide-sm">
          {e.eps_actual != null ? (
            <>
              <span title="Actual">{fmtNum(e.eps_actual)}</span>
              <span className="subname">act · est {fmtNum(e.eps_est)}</span>
            </>
          ) : (
            <>
              {fmtNum(e.eps_est)}
              <span className="subname">est</span>
            </>
          )}
        </td>
        <td data-th="H / P / C" className="hide-sm">
          <div className="minibars">
            <span className="minibar" title={`Health ${e.health_score ?? '—'}`}>
              <span className="minibar-label">H</span>
              <ScoreBar value={e.health_score} small />
            </span>
            <span className="minibar" title={`Prob up ${e.prob_up_pct ?? '—'}`}>
              <span className="minibar-label">P</span>
              <ScoreBar value={e.prob_up_pct} small />
            </span>
            <span className="minibar" title={`Conviction ${e.conviction ?? '—'}`}>
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
          </td>
        </tr>
      )}
    </>
  );
}

export default function EarningsTab() {
  const { data, loading, error } = useJsonData<EarningsEntry[]>('earnings.json');

  useEffect(() => {
    if (data) setQuoteUniverse(data.map((e) => e.ticker));
  }, [data]);

  const groups = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, EarningsEntry[]>();
    for (const e of data) {
      const arr = map.get(e.reporting_date) ?? [];
      arr.push(e);
      map.set(e.reporting_date, arr);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, entries]) => ({
        date,
        entries: entries.sort((x, y) => (y.conviction ?? -1) - (x.conviction ?? -1)),
      }));
  }, [data]);

  if (loading) return <LoadingPanel what="earnings calendar" />;
  if (error || !data)
    return <ErrorPanel file="public/data/earnings.json" error={error ?? 'empty file'} />;
  if (groups.length === 0)
    return (
      <EmptyState
        dataFile="public/data/earnings.json"
        loading={false}
        error={null}
        items={['No companies reporting in the current window.']}
      />
    );

  return (
    <section className="tab">
      <header className="tab-header">
        <h2>Earnings calendar</h2>
        <p className="muted">
          Rolling window · {data.length} companies · sorted by date, then conviction.
          Click a row for streak, news, and detail.
        </p>
      </header>

      {groups.map((g) => (
        <div key={g.date} className="daygroup">
          <SectionHead
            title={fmtDayLabel(g.date)}
            sub={`${g.entries.length} reporting`}
          />
          <div className="table-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Reports</th>
                  <th>Price</th>
                  <th>Impl. move</th>
                  <th className="hide-sm">EPS</th>
                  <th className="hide-sm">H / P / C</th>
                  <th className="hide-sm">Signals</th>
                </tr>
              </thead>
              <tbody>
                {g.entries.map((e) => (
                  <EarningsRow key={e.ticker} e={e} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
