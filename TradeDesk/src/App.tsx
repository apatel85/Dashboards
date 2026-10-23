import { useEffect, useState } from 'react';
import AuthGate from './auth/AuthGate';
import LiveQuoteButton from './components/LiveQuoteButton';
import { TabErrorBoundary } from './components/ErrorBoundary';
import DailyBriefTab from './tabs/DailyBrief';
import OptionsTab from './tabs/Options';
import EarningsTab from './tabs/Earnings';
import CongressGovTab from './tabs/CongressGov';
import ResearchTab from './tabs/Research';
import SignalsTab from './tabs/Signals';
import PerformanceTab from './tabs/Performance';
import ScreenerTab from './tabs/Screener';
import { supabase } from './lib/supabase';
import type { TabDef, TabId } from './types';

const TABS: TabDef[] = [
  { id: 'brief', label: 'Daily Brief', dataFile: 'daily-brief.json' },
  { id: 'options', label: 'Options', dataFile: 'lotto.json' },
  { id: 'signals', label: 'Signals', dataFile: 'signals.json' },
  { id: 'earnings', label: 'Earnings', dataFile: 'earnings.json' },
  { id: 'congress', label: 'Congress & Gov', dataFile: 'congress.json' },
  { id: 'research', label: 'Research', dataFile: 'research.json' },
  { id: 'performance', label: 'Performance', dataFile: 'performance.json' },
  { id: 'screener', label: 'Screener', dataFile: 'fundamentals.json' },
];

const TAB_IDS = TABS.map((t) => t.id);

/** Build version — bump on every push so we can confirm what's live. */
export const BUILD_VERSION = '2026-10-23c';

/** Read the active tab from the URL hash (#options), defaulting to brief. */
function tabFromHash(): TabId {
  const h = window.location.hash.replace('#', '') as TabId;
  return (TAB_IDS as string[]).includes(h) ? h : 'brief';
}

function Shell() {
  const [active, setActive] = useState<TabId>(tabFromHash);

  // Keep the URL hash in sync so refresh stays on the same tab.
  // Listen for hash changes too (back/forward buttons).
  useEffect(() => {
    const onHash = () => setActive(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (id: TabId) => {
    setActive(id);
    window.location.hash = id === 'brief' ? '' : id;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">◈</span>
          <h1 className="brand">TradeDesk</h1>
        </div>
        <div className="topbar-actions">
          <LiveQuoteButton />
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabnav" role="tablist" aria-label="TradeDesk sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={`tabbtn${active === t.id ? ' active' : ''}`}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        <TabErrorBoundary tabName="Daily Brief" key={`brief-${active}`}>
          {active === 'brief' && <DailyBriefTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Options" key={`options-${active}`}>
          {active === 'options' && <OptionsTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Signals" key={`signals-${active}`}>
          {active === 'signals' && <SignalsTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Earnings" key={`earnings-${active}`}>
          {active === 'earnings' && <EarningsTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Congress & Gov" key={`congress-${active}`}>
          {active === 'congress' && <CongressGovTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Research" key={`research-${active}`}>
          {active === 'research' && <ResearchTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Performance" key={`performance-${active}`}>
          {active === 'performance' && <PerformanceTab />}
        </TabErrorBoundary>
        <TabErrorBoundary tabName="Screener" key={`screener-${active}`}>
          {active === 'screener' && <ScreenerTab />}
        </TabErrorBoundary>
      </main>

      <footer className="footer">
        TradeDesk — research and education only, not financial advice.
        <span className="muted"> · v{BUILD_VERSION}</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}
