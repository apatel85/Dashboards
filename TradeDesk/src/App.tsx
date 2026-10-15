import { useState } from 'react';
import AuthGate from './auth/AuthGate';
import LiveQuoteButton from './components/LiveQuoteButton';
import DailyBriefTab from './tabs/DailyBrief';
import EarningsTab from './tabs/Earnings';
import CongressGovTab from './tabs/CongressGov';
import ResearchTab from './tabs/Research';
import SignalsTab from './tabs/Signals';
import { supabase } from './lib/supabase';
import type { TabDef, TabId } from './types';

const TABS: TabDef[] = [
  { id: 'brief', label: 'Daily Brief', dataFile: 'daily-brief.json' },
  { id: 'signals', label: 'Signals', dataFile: 'signals.json' },
  { id: 'earnings', label: 'Earnings', dataFile: 'earnings.json' },
  { id: 'congress', label: 'Congress & Gov', dataFile: 'congress.json' },
  { id: 'research', label: 'Research', dataFile: 'research.json' },
];

function Shell() {
  const [active, setActive] = useState<TabId>('brief');

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
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {active === 'brief' && <DailyBriefTab />}
        {active === 'signals' && <SignalsTab />}
        {active === 'earnings' && <EarningsTab />}
        {active === 'congress' && <CongressGovTab />}
        {active === 'research' && <ResearchTab />}
      </main>

      <footer className="footer">
        TradeDesk — research and education only, not financial advice.
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
