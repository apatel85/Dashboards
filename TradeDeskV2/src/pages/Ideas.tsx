import SignalsTab from '../tabs/Signals';
import ResearchTab from '../tabs/Research';
import { BreakoutsFeed } from '../tabs/DailyBrief';
import { HowTo } from '../components/HowTo';
import { SubTabs, activeSub, type SubTab } from '../components/SubTabs';
import { LoadingPanel, ErrorPanel } from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import type { DailyBrief, ResearchIdea, SignalsFile } from '../types';

function BreakoutsView() {
  const { data, loading, error } = useJsonData<DailyBrief>('daily-brief.json');
  if (loading) return <LoadingPanel what="breakout candidates" />;
  if (error || !data) return <ErrorPanel file="daily-brief.json" error={error ?? 'empty file'} />;
  return (
    <>
      <HowTo>
        Stocks sitting just under a breakout level, scored 0–100 on trend, earnings and volume.
        The idea is only live <b>above the trigger</b>; the <b>stop</b> is where it is wrong.
        Tap a card for the full reasoning and fundamentals.
      </HowTo>
      <BreakoutsFeed brief={data} />
    </>
  );
}

export default function IdeasPage({ sub }: { sub: string }) {
  // Counts for the sub-tab labels (same files the views read; the browser caches them).
  const { data: brief } = useJsonData<DailyBrief>('daily-brief.json');
  const { data: signals } = useJsonData<SignalsFile>('signals.json');
  const { data: research } = useJsonData<ResearchIdea[]>('research.json');
  const tabs: SubTab[] = [
    { id: 'breakouts', label: 'Breakouts', count: brief?.breakout_candidates.length ?? null },
    { id: 'signals', label: 'Smart-money signals', count: signals?.tickers.length ?? null },
    { id: 'research', label: 'Research', count: research?.length ?? null },
  ];
  const active = activeSub(tabs, sub);
  return (
    <section className="tab">
      <SubTabs page="ideas" tabs={tabs} active={active} />
      {active === 'breakouts' && <BreakoutsView />}
      {active === 'signals' && <SignalsTab />}
      {active === 'research' && <ResearchTab />}
    </section>
  );
}
