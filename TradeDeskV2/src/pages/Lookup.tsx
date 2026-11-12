import DeepDiveTab from '../tabs/DeepDive';
import ScreenerTab from '../tabs/Screener';
import { SubTabs, activeSub, type SubTab } from '../components/SubTabs';

const TABS: SubTab[] = [
  { id: 'dive', label: 'Deep dive' },
  { id: 'screener', label: 'Screener' },
];

export default function LookupPage({ sub, ticker }: { sub: string; ticker: string | null }) {
  const active = activeSub(TABS, sub);
  return (
    <section className="tab">
      <SubTabs page="lookup" tabs={TABS} active={active} />
      {active === 'dive' && <DeepDiveTab initialTicker={ticker} />}
      {active === 'screener' && <ScreenerTab />}
    </section>
  );
}
