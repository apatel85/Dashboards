import { useMemo, useState } from 'react';
import {
  Badge,
  SectionHead,
  Stat,
  TvLink,
  LoadingPanel,
  ErrorPanel,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { Fundamentals } from '../components/Fundamentals';
import { fmtMoney, fmtPct, fmtDate } from '../lib/format';
import type { PerformanceFile, PerformanceItem } from '../types';

type SortKey = 'date' | 'pct' | 'ticker';
type SortDir = 'asc' | 'desc';

function pctTone(p: number | null): string {
  if (p == null) return '';
  return p > 0 ? 'up' : p < 0 ? 'down' : '';
}

function PerfRow({ item }: { item: PerformanceItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer' }}
        title="Tap for fundamentals"
      >
        <td data-th="Ticker">
          <TvLink ticker={item.ticker} />
          <span className="subname">{item.name}</span>
        </td>
        <td data-th="Recommended" className="num">
          {item.recommended_date ? fmtDate(item.recommended_date) : '—'}
        </td>
        <td data-th="At rec." className="num">
          {item.rec_price != null ? fmtMoney(item.rec_price) : '—'}
        </td>
        <td data-th="Now" className="num">
          {item.current_price != null ? fmtMoney(item.current_price) : '—'}
        </td>
        <td data-th="% since rec." className={`num ${pctTone(item.pct_change)}`}>
          <b>{item.pct_change != null ? fmtPct(item.pct_change / 100) : '—'}</b>
        </td>
        <td data-th="P(up 30d)">
          {item.p_up != null ? <Badge tone={item.p_up >= 60 ? 'green' : item.p_up >= 50 ? 'dim' : 'red'}>{item.p_up}%</Badge> : '—'}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={6}>
            <Fundamentals ticker={item.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function PerformanceTab() {
  const { data, loading, error } = useJsonData<PerformanceFile>('performance.json');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const items = useMemo(() => {
    if (!data?.items) return [];
    const arr = [...data.items];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === 'ticker') return dir * a.ticker.localeCompare(b.ticker);
      if (sortKey === 'pct') {
        const av = a.pct_change ?? -Infinity;
        const bv = b.pct_change ?? -Infinity;
        return dir * (av - bv);
      }
      return dir * String(a.recommended_at || '').localeCompare(String(b.recommended_at || ''));
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const stats = useMemo(() => {
    const scored = (data?.items || []).filter((i) => i.pct_change != null);
    if (!scored.length) return null;
    const avg = scored.reduce((s, i) => s + (i.pct_change as number), 0) / scored.length;
    const pos = scored.filter((i) => (i.pct_change as number) > 0).length;
    const best = scored.reduce((a, b) => ((a.pct_change as number) >= (b.pct_change as number) ? a : b));
    const worst = scored.reduce((a, b) => ((a.pct_change as number) <= (b.pct_change as number) ? a : b));
    return { n: scored.length, avg, winRate: (pos / scored.length) * 100, best, worst };
  }, [data]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  if (loading) return <LoadingPanel what="recommendation performance" />;
  if (error) return <ErrorPanel file="performance.json" error={error} />;
  if (!data || !data.items.length) {
    return (
      <div className="panel">
        <div className="empty-title">No recommendations tracked yet</div>
        <p className="muted">
          The performance tracker fills in once the research agent publishes its first ideas
          and the morning pipeline prices them.
        </p>
      </div>
    );
  }

  return (
    <div className="tabpane">
      <SectionHead
        title="Recommendation performance"
        sub={`${data.count} ideas tracked · prices ${data.quotes_as_of ? `as of ${fmtDate(data.quotes_as_of)}` : 'delayed'} · research only, not financial advice`}
      />

      {stats ? (
        <div className="perf-stats">
          <Stat label="Tracked" value={String(stats.n)} />
          <Stat label="Avg. return" value={fmtPct(stats.avg / 100)} accent={stats.avg > 0 ? 'up' : stats.avg < 0 ? 'down' : undefined} />
          <Stat label="Win rate" value={`${Math.round(stats.winRate)}%`} />
          <Stat label="Best" value={`${stats.best.ticker} ${fmtPct((stats.best.pct_change as number) / 100)}`} accent="up" />
          <Stat label="Worst" value={`${stats.worst.ticker} ${fmtPct((stats.worst.pct_change as number) / 100)}`} accent="down" />
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="dtable slim">
          <thead>
            <tr>
              <th>
                <button className="linklike" onClick={() => toggleSort('ticker')}>
                  Ticker{sortArrow('ticker')}
                </button>
              </th>
              <th>
                <button className="linklike" onClick={() => toggleSort('date')}>
                  Recommended{sortArrow('date')}
                </button>
              </th>
              <th className="r">At rec.</th>
              <th className="r">Now</th>
              <th className="r">
                <button className="linklike" onClick={() => toggleSort('pct')}>
                  % since rec.{sortArrow('pct')}
                </button>
              </th>
              <th>P(up 30d)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <PerfRow key={i.ticker} item={i} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small footnote-line">
        "At rec." = daily close on or before the recommendation date. "Now" = latest pipeline
        quote snapshot (~15-min delayed, {data.quotes_as_of ? fmtDate(data.quotes_as_of) : 'unavailable'}).
        A ticker is tracked from its earliest recommendation. Updated {fmtDate(data.as_of)}.
      </p>
    </div>
  );
}
