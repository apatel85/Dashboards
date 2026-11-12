import { useEffect } from 'react';
import { DteCard } from '../components/Dte';
import { LottoScanner } from '../components/Lotto';
import { FuturesGamma, GexAlerts, useWatchlist } from '../components/Gamma';
import { Playbook } from '../components/Playbook';
import { HowTo } from '../components/HowTo';
import { SubTabs, activeSub, type SubTab } from '../components/SubTabs';
import { LoadingPanel, ErrorPanel } from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { setQuoteUniverse } from '../lib/quotes';
import type { DailyBrief, GexChangesFile, GexFile, LottoFile } from '../types';

function GammaView() {
  const { data: gex, loading, error } = useJsonData<GexFile>('gex.json');
  const { data: changes } = useJsonData<GexChangesFile>('gex-changes.json');
  const [watched] = useWatchlist();
  if (loading) return <LoadingPanel what="gamma levels" />;
  if (error || !gex) return <ErrorPanel file="gex.json" error={error ?? 'empty file'} />;
  return (
    <>
      <HowTo title="What is dealer gamma?">
        When dealers are <b>long gamma</b> they trade against moves, so price tends to pin and
        fades at the walls work. When they are <b>short gamma</b> they trade with moves, so
        breaks run further. The <b>call wall</b> and <b>put wall</b> are the strikes with the
        most dealer exposure — the day's likely ceiling and floor. The <b>flip</b> is where
        the regime changes sign.
      </HowTo>
      <FuturesGamma gex={gex} />
      <GexAlerts changes={changes ?? null} watched={watched} />
    </>
  );
}

function FocusView() {
  const { data: brief, loading, error } = useJsonData<DailyBrief>('daily-brief.json');
  useEffect(() => {
    const t = new Set<string>();
    brief?.dte_focus?.zero_dte?.forEach((p) => t.add(p.ticker));
    brief?.dte_focus?.one_dte?.forEach((p) => t.add(p.ticker));
    if (t.size > 0) setQuoteUniverse([...t]);
  }, [brief]);
  if (loading) return <LoadingPanel what="options focus list" />;
  if (error || !brief) return <ErrorPanel file="daily-brief.json" error={error ?? 'empty file'} />;
  const zero = brief.dte_focus?.zero_dte ?? [];
  const one = brief.dte_focus?.one_dte ?? [];
  return (
    <>
      <HowTo>
        Options expiring <b>today</b> (0DTE) or <b>tomorrow</b> (1DTE) on the most liquid
        names. They move fast and can go to zero the same day — this is the riskiest corner of
        the app. Bias is the pipeline's read of trend and levels, not a trade instruction.
      </HowTo>
      <h4 className="dte-title">0DTE — expires today</h4>
      <div className="dte-grid">
        {zero.length > 0 ? zero.map((p) => <DteCard key={`0-${p.ticker}`} p={p} />) : <p className="muted">No 0DTE names flagged.</p>}
      </div>
      <h4 className="dte-title">1DTE — expires tomorrow</h4>
      <div className="dte-grid">
        {one.length > 0 ? one.map((p) => <DteCard key={`1-${p.ticker}`} p={p} />) : <p className="muted">No 1DTE names flagged.</p>}
      </div>
    </>
  );
}

function LottoView() {
  const { data: lotto, loading, error } = useJsonData<LottoFile>('lotto.json');
  useEffect(() => {
    if (lotto) setQuoteUniverse(lotto.candidates.map((c) => c.ticker));
  }, [lotto]);
  if (loading) return <LoadingPanel what="lotto scanner" />;
  if (error || !lotto) return <ErrorPanel file="lotto.json" error={error ?? 'empty file'} />;
  return (
    <>
      <HowTo>
        Small, cheap same-day or next-day option tickets ranked by score. Only setups marked{' '}
        <b>Validated</b> showed a positive edge after costs in the backtest — the others are
        shown for context. Most tickets lose; the edge comes from the few that pay several
        times over. Tap a card for the trigger, the invalidation level and targets.
      </HowTo>
      <LottoScanner lotto={lotto} />
    </>
  );
}

const TABS: SubTab[] = [
  { id: 'gamma', label: 'Gamma levels' },
  { id: 'focus', label: '0DTE / 1DTE focus' },
  { id: 'lotto', label: 'Lotto scanner' },
  { id: 'playbook', label: 'Playbook' },
];

export default function OptionsPage({ sub }: { sub: string }) {
  const active = activeSub(TABS, sub);
  return (
    <section className="tab">
      <SubTabs page="options" tabs={TABS} active={active} />
      {active === 'gamma' && <GammaView />}
      {active === 'focus' && <FocusView />}
      {active === 'lotto' && <LottoView />}
      {active === 'playbook' && <Playbook />}
    </section>
  );
}
