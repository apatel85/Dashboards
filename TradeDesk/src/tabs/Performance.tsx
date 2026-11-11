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
import type {
  PerformanceFile,
  PerformanceItem,
  PredictionPerformanceFile,
  PredictionRow,
} from '../types';

type SortKey = 'date' | 'pct' | 'ticker';
type SortDir = 'asc' | 'desc';

function pctTone(p: number | null): string {
  if (p == null) return '';
  return p > 0 ? 'up' : p < 0 ? 'down' : '';
}

/* ── daily predictions ─────────────────────────────────────────────── */

type PredTypeFilter = 'all' | 'breakout' | 'lotto';
type PredResultFilter = 'all' | 'won' | 'lost' | 'running' | 'other';
type PredSortKey = 'date' | 'ticker' | 'result';

function predResult(row: PredictionRow): { label: string; tone: 'green' | 'red' | 'dim'; key: PredResultFilter } {
  const o = row.outcome;
  if (row.type === 'breakout') {
    if (!o || o.status === 'open') return { label: 'Still running', tone: 'dim', key: 'running' };
    if (o.status === 'trigger-hit') return { label: 'Won — hit trigger', tone: 'green', key: 'won' };
    if (o.status === 'stop-hit') return { label: 'Lost — hit stop', tone: 'red', key: 'lost' };
    return { label: 'Flat — never triggered', tone: 'dim', key: 'other' };
  }
  if (!o || o.status === 'open') return { label: 'Still running', tone: 'dim', key: 'running' };
  if (o.ungradable) return { label: "Can't grade", tone: 'dim', key: 'other' };
  if (o.win === true) return { label: 'Won', tone: 'green', key: 'won' };
  if (o.win === false) return { label: 'Lost', tone: 'red', key: 'lost' };
  return { label: 'No call', tone: 'dim', key: 'other' };
}

function predSaid(row: PredictionRow): string {
  if (row.type === 'breakout') {
    return `Breakout above ${row.trigger != null ? fmtMoney(row.trigger) : '—'} · stop ${row.stop != null ? fmtMoney(row.stop) : '—'} · score ${row.score ?? '—'}`;
  }
  if (row.direction === 'BOTH') {
    return `Move ${row.expected_move_pct != null ? `≥ ${row.expected_move_pct}%` : 'big'} either way · spot ${row.spot != null ? fmtMoney(row.spot) : '—'}`;
  }
  return `${row.direction} $${row.strike ?? '—'} @ ${row.premium != null ? fmtMoney(row.premium) : '—'} · breakeven ${row.breakeven != null ? fmtMoney(row.breakeven) : '—'}`;
}

function predHappened(row: PredictionRow): string {
  const o = row.outcome;
  if (row.type === 'breakout') {
    if (!o || o.status === 'open') {
      return `Running${o?.last_close != null ? ` · now ${fmtMoney(o.last_close)}` : ''}${o?.r_now != null ? ` · ${o.r_now >= 0 ? '+' : ''}${o.r_now.toFixed(1)}R so far` : ''}`;
    }
    if (o.status === 'trigger-hit') return `Hit trigger day ${o.trigger_day}${o.ret_10d != null ? ` · ${fmtPct(o.ret_10d)} at 10 days` : ''}`;
    if (o.status === 'stop-hit') return `Hit stop day ${o.stop_day}`;
    return `Never triggered${o.ret_10d != null ? ` · ${fmtPct(o.ret_10d)} at 10 days` : ''}`;
  }
  if (!o || o.status === 'open') return `Expires ${row.expiry ? fmtDate(row.expiry) : '—'} — not settled yet`;
  if (o.ungradable) return `Couldn't grade — scan ran after the close`;
  return `Closed ${o.expiry_close != null ? fmtMoney(o.expiry_close) : '—'}${o.moved_pct != null ? ` (${o.moved_pct >= 0 ? '+' : ''}${o.moved_pct}%)` : ''}${o.modeled_multiple != null ? ` · ticket worth ${o.modeled_multiple.toFixed(1)}× (modeled)` : ''}`;
}

function fmtRate(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

function fmtR(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;
}

function PredRow({ row }: { row: PredictionRow }) {
  const [open, setOpen] = useState(false);
  const res = predResult(row);
  return (
    <>
      <tr onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer' }} title="Tap for details">
        <td data-th="Date" className="num">{fmtDate(row.date)}</td>
        <td data-th="Ticker">
          <TvLink ticker={row.ticker} />
          {row.name ? <span className="subname">{row.name}</span> : null}
          <span className="subname">{row.type === 'breakout' ? 'Breakout' : `Option · ${row.expiry_kind ?? ''}`}</span>
        </td>
        <td data-th="What we said">{predSaid(row)}</td>
        <td data-th="What happened">{predHappened(row)}</td>
        <td data-th="Result">
          <Badge tone={res.tone}>{res.label}</Badge>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={5}>
            <div className="muted small" style={{ marginBottom: 8 }}>
              <b>{row.setup ?? '—'}</b> · score {row.score ?? '—'}
              {row.type === 'breakout' ? (
                <>
                  {' · '}suggested at {row.price != null ? fmtMoney(row.price) : '—'}
                  {' · '}trigger {row.trigger != null ? fmtMoney(row.trigger) : '—'}
                  {' · '}stop {row.stop != null ? fmtMoney(row.stop) : '—'}
                  {row.outcome ? (
                    <>
                      <br />
                      Best move in 10 days: {row.outcome.mfe != null ? fmtPct(row.outcome.mfe) : '—'}
                      {' · '}worst dip: {row.outcome.mae != null ? fmtPct(row.outcome.mae) : '—'}
                      <br />
                      Return: 5 days {row.outcome.ret_5d != null ? fmtPct(row.outcome.ret_5d) : '—'}
                      {' · '}10 days {row.outcome.ret_10d != null ? fmtPct(row.outcome.ret_10d) : '—'}
                      {' · '}30 days {row.outcome.ret_30d != null ? fmtPct(row.outcome.ret_30d) : '—'}
                      {' · '}R at 10 days: {fmtR(row.outcome.r_10d)}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {' · '}spot {row.spot != null ? fmtMoney(row.spot) : '—'}
                  {' · '}strike {row.strike != null ? `$${row.strike}` : '—'}
                  {' · '}premium {row.premium != null ? fmtMoney(row.premium) : '—'}
                  {' · '}expected move {row.expected_move_pct != null ? `±${row.expected_move_pct}%` : '—'}
                  {' · '}expires {row.expiry ? fmtDate(row.expiry) : '—'}
                  {row.outcome ? (
                    <>
                      <br />
                      Closed at expiry: {row.outcome.expiry_close != null ? fmtMoney(row.outcome.expiry_close) : '—'}
                      {' · '}trigger hit: {row.outcome.triggered == null ? '—' : row.outcome.triggered ? 'yes' : 'no'}
                      {' · '}modeled ticket value: {row.outcome.modeled_multiple != null ? `${row.outcome.modeled_multiple.toFixed(1)}× the premium (${fmtPct(row.outcome.modeled_return ?? 0)})` : '—'}
                      <br />
                      <span className="muted">Option values are modeled, not real trades — we estimate what the ticket would be worth from the stock's actual move. No real money was involved.</span>
                    </>
                  ) : null}
                </>
              )}
            </div>
            <Fundamentals ticker={row.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}

function PredictionSection() {
  const { data, loading, error } = useJsonData<PredictionPerformanceFile>('prediction-performance.json');
  const [typeFilter, setTypeFilter] = useState<PredTypeFilter>('all');
  const [resultFilter, setResultFilter] = useState<PredResultFilter>('all');
  const [sortKey, setSortKey] = useState<PredSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    let arr = [...(data?.rows || [])];
    if (typeFilter !== 'all') arr = arr.filter((r) => r.type === typeFilter);
    if (resultFilter !== 'all') arr = arr.filter((r) => predResult(r).key === resultFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    const rank = (r: PredictionRow) => {
      const k = predResult(r).key;
      return k === 'won' ? 0 : k === 'lost' ? 1 : k === 'other' ? 2 : 3;
    };
    arr.sort((a, b) => {
      if (sortKey === 'ticker') return dir * a.ticker.localeCompare(b.ticker);
      if (sortKey === 'result') return dir * (rank(a) - rank(b));
      return dir * String(a.date).localeCompare(String(b.date));
    });
    return arr;
  }, [data, typeFilter, resultFilter, sortKey, sortDir]);

  const toggleSort = (key: PredSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'ticker' ? 'asc' : 'desc'); }
  };
  const sortArrow = (key: PredSortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  if (loading) return <LoadingPanel what="daily prediction tracking" />;
  if (error || !data) {
    return (
      <div className="panel">
        <SectionHead title="Daily predictions — did they work?" sub="Breakout candidates and 0DTE option plays, graded against what actually happened" />
        <div className="empty-title">Tracking starts with the next morning pipeline run</div>
        <p className="muted">
          Every breakout candidate and 0DTE option play the app suggests will be recorded here
          and graded as the market answers — no history has been published yet.
        </p>
      </div>
    );
  }

  const b = data.summary.breakout;
  const l = data.summary.lotto;

  return (
    <div className="panel">
      <SectionHead
        title="Daily predictions — did they work?"
        sub={`Tracking since ${data.history_since ? fmtDate(data.history_since) : 'today'} · ${b.tracked + l.tracked} suggestions recorded · updated ${fmtDate(data.as_of)}`}
      />
      <p className="muted small plain-note">
        Every breakout candidate and 0DTE option play the app suggests gets recorded the morning
        it appears, then graded against what the stock actually did. <b>Breakout</b> = the stock
        was near its 52-week high and we said it would break higher. <b>Option</b> = a 0DTE/1DTE
        lottery ticket — a small, cheap bet on a big same-day move. A breakout <b>wins</b> when the
        price hits the trigger before the stop within 10 trading days. An option <b>wins</b> when
        the ticket would be worth more than it cost.
      </p>

      <div className="muted small" style={{ margin: '10px 0 4px' }}><b>Breakouts</b></div>
      <div className="perf-stats">
        <Stat label="Tracked" value={String(b.tracked)} />
        <Stat label="Finished" value={String(b.graded)} />
        <Stat label="Hit trigger" value={fmtRate(b.trigger_rate)} accent={b.trigger_rate != null && b.trigger_rate >= 50 ? 'up' : undefined} />
        <Stat label="Win rate" value={fmtRate(b.win_rate)} accent={b.win_rate != null && b.win_rate >= 50 ? 'up' : b.win_rate != null ? 'down' : undefined} />
        <Stat label="Avg R (10d)" value={fmtR(b.avg_r_10d)} accent={b.avg_r_10d != null && b.avg_r_10d > 0 ? 'up' : b.avg_r_10d != null ? 'down' : undefined} />
      </div>

      <div className="muted small" style={{ margin: '10px 0 4px' }}><b>0DTE / 1DTE options</b></div>
      <div className="perf-stats">
        <Stat label="Tracked" value={String(l.tracked)} />
        <Stat label="Finished" value={String(l.graded)} />
        <Stat label="Hit trigger" value={fmtRate(l.trigger_rate)} accent={l.trigger_rate != null && l.trigger_rate >= 50 ? 'up' : undefined} />
        <Stat label="Win rate" value={fmtRate(l.win_rate)} accent={l.win_rate != null && l.win_rate >= 50 ? 'up' : l.win_rate != null ? 'down' : undefined} />
        <Stat label="Avg ticket" value={l.avg_modeled_multiple != null ? `${l.avg_modeled_multiple.toFixed(1)}×` : '—'} accent={l.avg_modeled_multiple != null && l.avg_modeled_multiple > 1 ? 'up' : l.avg_modeled_multiple != null ? 'down' : undefined} />
      </div>

      <div className="chips" style={{ marginTop: 12 }}>
        {(['all', 'breakout', 'lotto'] as PredTypeFilter[]).map((t) => (
          <button key={t} className={`chip-btn${typeFilter === t ? ' on' : ''}`} onClick={() => setTypeFilter(t)}>
            {t === 'all' ? 'All' : t === 'breakout' ? 'Breakouts' : 'Options'}
          </button>
        ))}
        <span style={{ width: 12 }} />
        {(['all', 'won', 'lost', 'running', 'other'] as PredResultFilter[]).map((t) => (
          <button key={t} className={`chip-btn${resultFilter === t ? ' on' : ''}`} onClick={() => setResultFilter(t)}>
            {t === 'all' ? 'Any result' : t === 'won' ? 'Won' : t === 'lost' ? 'Lost' : t === 'running' ? 'Still running' : 'Other'}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>Nothing matches these filters yet.</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="dtable slim">
            <thead>
              <tr>
                <th>
                  <button className="linklike" onClick={() => toggleSort('date')}>
                    Date{sortArrow('date')}
                  </button>
                </th>
                <th>
                  <button className="linklike" onClick={() => toggleSort('ticker')}>
                    Ticker{sortArrow('ticker')}
                  </button>
                </th>
                <th>What we said</th>
                <th>What happened</th>
                <th>
                  <button className="linklike" onClick={() => toggleSort('result')}>
                    Result{sortArrow('result')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PredRow key={`${r.date}|${r.type}|${r.ticker}`} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small footnote-line">
        Breakouts are graded on daily closing prices over the 10 trading days after the suggestion
        (returns also shown at 5 / 10 / 30 days). <b>R</b> = how much the trade made or lost as a
        multiple of what was risked — +1R means it made back its risk, −1R means the stop was hit.
        Option values are <b>modeled</b>, not real trades: the ticket's worth is estimated from the
        stock's actual close on expiry day, with no bid/ask or slippage. Some plays can't be graded
        when the scan ran after the market closed that day — those are marked "Can't grade" and
        left out of the win rates. History starts {data.history_since ? fmtDate(data.history_since) : 'today'} and grows every morning.
      </p>
    </div>
  );
}

/* ── research recommendations (existing) ─────────────────────────── */

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

function ResearchSection() {
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
      return dir * String(a.recommended_at || '').localeCompare(String(a.recommended_at || ''));
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
      <p className="muted small plain-note">
        This grades our own research: how every past idea actually did after we published
        it. It tells us which kinds of ideas work and which do not, so the research keeps
        getting better. <b>P(up 30d)</b> is what the research guessed at the time.
      </p>

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

export default function PerformanceTab() {
  return (
    <div className="tabpane">
      <PredictionSection />
      <ResearchSection />
    </div>
  );
}
