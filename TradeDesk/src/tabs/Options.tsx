import '../mockb-options.css';
import { useEffect, useState, type ReactNode } from 'react';
import EmptyState from '../components/EmptyState';
import { DteCard } from '../components/Dte';
import { LottoScanner } from '../components/Lotto';
import { LoadingPanel, ErrorPanel } from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { setQuoteUniverse } from '../lib/quotes';
import type { DailyBrief, LottoFile } from '../types';

/** One numbered, collapsed-by-default Mock B card. */
function MbCard({
  num,
  title,
  sub,
  count,
  open,
  onToggle,
  children,
}: {
  num: string;
  title: string;
  sub?: string;
  count?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-card">
      <button
        type="button"
        className="mb-card-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="mb-card-num">{num}</span>
        <span className="mb-card-title">{title}</span>
        {sub ? <span className="mb-card-sub">{sub}</span> : null}
        {count ? <span className="mb-count-badge">{count}</span> : null}
        <span className="mb-card-chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? <div className="mb-card-body">{children}</div> : null}
    </div>
  );
}

export default function OptionsTab() {
  const { data: brief, loading: briefLoading, error: briefError } = useJsonData<DailyBrief>('daily-brief.json');
  const { data: lotto, loading: lottoLoading } = useJsonData<LottoFile>('lotto.json');
  const [open01, setOpen01] = useState(false);
  const [open02, setOpen02] = useState(false);
  const [open03, setOpen03] = useState(false);
  const [open04, setOpen04] = useState(false);

  useEffect(() => {
    const tickers = new Set<string>();
    brief?.dte_focus?.zero_dte?.forEach((p) => tickers.add(p.ticker));
    brief?.dte_focus?.one_dte?.forEach((p) => tickers.add(p.ticker));
    lotto?.candidates.forEach((c) => tickers.add(c.ticker));
    if (tickers.size > 0) setQuoteUniverse([...tickers]);
  }, [brief, lotto]);

  if (briefLoading) return <LoadingPanel what="options data" />;
  if (briefError || !brief)
    return <ErrorPanel file="public/data/daily-brief.json" error={briefError ?? 'empty file'} />;

  const zeroDte = brief.dte_focus?.zero_dte ?? [];
  const oneDte = brief.dte_focus?.one_dte ?? [];

  return (
    <section className="tab mb-options">
      <h2 className="mb-tabhead">Options</h2>
      <p className="mb-lede">
        High-liquidity names, through an options lens — what expires today and
        tomorrow, and the lotto scanner&apos;s backtested setups.
      </p>
      <p className="muted small plain-note mb-options-note">
        Options expiring <b>today</b> (0DTE) or <b>tomorrow</b> (1DTE) on the most liquid
        names. They move fast and can go to zero the same day, so this is the riskiest
        corner of the app. The lotto scanner below only flags setups our backtests showed
        actually had an edge — most days it flags nothing.
      </p>

      <MbCard
        num="01"
        title="0DTE focus — expires today"
        count={`${zeroDte.length} ${zeroDte.length === 1 ? 'name' : 'names'}`}
        open={open01}
        onToggle={() => setOpen01((o) => !o)}
      >
        <div className="dte-grid mb-options-grid">
          {zeroDte.length > 0 ? (
            zeroDte.map((p) => <DteCard key={`0-${p.ticker}`} p={p} />)
          ) : (
            <p className="muted">No 0DTE names flagged.</p>
          )}
        </div>
      </MbCard>

      <MbCard
        num="02"
        title="1DTE focus — expires tomorrow"
        count={`${oneDte.length} ${oneDte.length === 1 ? 'name' : 'names'}`}
        open={open02}
        onToggle={() => setOpen02((o) => !o)}
      >
        <div className="dte-grid mb-options-grid">
          {oneDte.length > 0 ? (
            oneDte.map((p) => <DteCard key={`1-${p.ticker}`} p={p} />)
          ) : (
            <p className="muted">No 1DTE names flagged.</p>
          )}
        </div>
      </MbCard>

      <MbCard
        num="03"
        title="How to read the focus lists"
        sub="Plain-English guide"
        open={open03}
        onToggle={() => setOpen03((o) => !o)}
      >
        <ul className="mb-guide-list">
          <li>
            <strong>0DTE — expires today.</strong> An option contract that stops
            existing at today&apos;s close. There is no tomorrow for it to recover.
          </li>
          <li>
            <strong>1DTE — expires tomorrow.</strong> Same idea, with one extra
            day of life. Still very short-dated, still fast-moving.
          </li>
          <li>
            <strong>IV rank — how expensive options are right now.</strong>{' '}
            A 0–100 score against the past year. High means options are pricey
            compared with their own history; low means they are cheap.
          </li>
          <li>
            <strong>Expected move — how far the stock might move by expiry.</strong>{' '}
            The up-or-down move option prices are implying, in percent. It is a
            market guess, not a promise.
          </li>
          <li>
            <strong>Why these options can go to zero the same day.</strong> An
            option is only the right to buy or sell at a set price before expiry.
            If the stock never reaches that price by expiry, the right is worth
            nothing — and on the final day its value drains away hour by hour.
          </li>
        </ul>
      </MbCard>

      <MbCard
        num="04"
        title="Lotto scanner"
        sub="Backtested cheap-option setups"
        count={
          lotto
            ? `${lotto.candidates.length} ${lotto.candidates.length === 1 ? 'candidate' : 'candidates'}`
            : lottoLoading
              ? 'loading…'
              : 'no data'
        }
        open={open04}
        onToggle={() => setOpen04((o) => !o)}
      >
        <div className="mb-lotto-wrap">
          <LottoScanner lotto={lotto} />
          {lottoLoading ? (
            <p className="muted small">Loading lotto scanner…</p>
          ) : null}
          {!lottoLoading && !lotto ? (
            <EmptyState
              dataFile="public/data/lotto.json"
              loading={false}
              error={null}
              items={['Lotto scanner data not available in this run.']}
            />
          ) : null}
        </div>
      </MbCard>
    </section>
  );
}
