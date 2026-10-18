import { useEffect } from 'react';
import EmptyState from '../components/EmptyState';
import { DteCard } from '../components/Dte';
import { LottoScanner } from '../components/Lotto';
import { SectionHead, LoadingPanel, ErrorPanel } from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { setQuoteUniverse } from '../lib/quotes';
import type { DailyBrief, LottoFile } from '../types';

export default function OptionsTab() {
  const { data: brief, loading: briefLoading, error: briefError } = useJsonData<DailyBrief>('daily-brief.json');
  const { data: lotto, loading: lottoLoading } = useJsonData<LottoFile>('lotto.json');

  useEffect(() => {
    const tickers = new Set<string>();
    brief?.dte_focus.zero_dte.forEach((p) => tickers.add(p.ticker));
    brief?.dte_focus.one_dte.forEach((p) => tickers.add(p.ticker));
    lotto?.candidates.forEach((c) => tickers.add(c.ticker));
    if (tickers.size > 0) setQuoteUniverse([...tickers]);
  }, [brief, lotto]);

  if (briefLoading) return <LoadingPanel what="options data" />;
  if (briefError || !brief)
    return <ErrorPanel file="public/data/daily-brief.json" error={briefError ?? 'empty file'} />;

  return (
    <section className="tab">
      <SectionHead title="0DTE / 1DTE focus" sub="High-liquidity names · options lens" />
      <h4 className="dte-title">0DTE — expires today</h4>
      <div className="dte-grid">
        {brief.dte_focus.zero_dte.length > 0 ? (
          brief.dte_focus.zero_dte.map((p) => <DteCard key={`0-${p.ticker}`} p={p} />)
        ) : (
          <p className="muted">No 0DTE names flagged.</p>
        )}
      </div>
      <h4 className="dte-title">1DTE — expires tomorrow</h4>
      <div className="dte-grid">
        {brief.dte_focus.one_dte.length > 0 ? (
          brief.dte_focus.one_dte.map((p) => <DteCard key={`1-${p.ticker}`} p={p} />)
        ) : (
          <p className="muted">No 1DTE names flagged.</p>
        )}
      </div>

      <LottoScanner lotto={lotto} />
      {!lottoLoading && !lotto ? (
        <EmptyState
          dataFile="public/data/lotto.json"
          loading={false}
          error={null}
          items={['Lotto scanner data not available in this run.']}
        />
      ) : null}
    </section>
  );
}
