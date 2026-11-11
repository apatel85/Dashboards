import { useEffect, useState } from 'react';
import AuthGate from './auth/AuthGate';
import LiveQuoteButton from './components/LiveQuoteButton';
import { DefinitionsDrawer, FundamentalsPill } from './components/DefinitionsDrawer';
import { TabErrorBoundary } from './components/ErrorBoundary';
import DailyBriefTab from './tabs/DailyBrief';
import OptionsTab from './tabs/Options';
import EarningsTab from './tabs/Earnings';
import CongressGovTab from './tabs/CongressGov';
import ResearchTab from './tabs/Research';
import SignalsTab from './tabs/Signals';
import PerformanceTab from './tabs/Performance';
import ScreenerTab from './tabs/Screener';
import DeepDiveTab from './tabs/DeepDive';
import { supabase } from './lib/supabase';
import { SCHWAB_AUTH_START_URL, useSchwabLive } from './lib/useSchwabLive';
import type { TabDef, TabId } from './types';

const TABS: TabDef[] = [
  { id: 'brief', label: 'Daily Brief', dataFile: 'daily-brief.json' },
  { id: 'options', label: 'Options', dataFile: 'lotto.json' },
  { id: 'signals', label: 'Signals', dataFile: 'signals.json' },
  { id: 'earnings', label: 'Earnings', dataFile: 'earnings.json' },
  { id: 'congress', label: 'Congress & Gov', dataFile: 'congress.json' },
  { id: 'research', label: 'Research', dataFile: 'research.json' },
  { id: 'deepdive', label: 'Deep Dive', dataFile: 'signals.json' },
  { id: 'performance', label: 'Performance', dataFile: 'performance.json' },
  { id: 'screener', label: 'Screener', dataFile: 'fundamentals.json' },
];

const TAB_IDS = TABS.map((t) => t.id);

/** Build version — bump on every push so we can confirm what's live. */
export const BUILD_VERSION = '2026-11-10i';

/** "14:32:05" in ET for the Schwab pill's updated time. */
function fmtClockET(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Footer status pill for the Schwab live feed. Mounting it starts the
 * 60-second poll (useSchwabLive). Hidden when there is no session.
 */
function SchwabPill() {
  const s = useSchwabLive();
  if (s.status === 'no-session') return null;
  const time = s.lastOk ? fmtClockET(s.lastOk) : null;
  if (s.status === 'reauth') {
    return (
      <a
        className="badge b-red schwab-pill"
        href={SCHWAB_AUTH_START_URL}
        title="Schwab login expired — tap to reconnect (about 30 seconds)"
      >
        Schwab ● Reconnect
      </a>
    );
  }
  const tone =
    s.status === 'live'
      ? 'b-green'
      : s.status === 'stale'
        ? 'b-amber'
        : s.status === 'premarket' || s.status === 'afterhours'
          ? 'b-amber'
          : 'b-dim';
  const label =
    s.status === 'live'
      ? 'Schwab ● Live'
      : s.status === 'premarket'
        ? 'Schwab ● Pre-market'
        : s.status === 'afterhours'
          ? 'Schwab ● After-hours'
          : s.status === 'stale'
            ? 'Schwab ● Delayed'
            : 'Schwab ● Off-hours';
  return (
    <span
      className={`badge ${tone} schwab-pill`}
      title={
        s.lastError
          ? `Schwab poll: ${s.lastError}`
          : s.status === 'premarket'
            ? 'Schwab pre-market quotes (mark price, 60 s poll)'
            : s.status === 'afterhours'
              ? 'Schwab after-hours quotes (mark price, 60 s poll)'
              : 'Schwab live quotes (60 s poll)'
      }
    >
      {label}
      {time ? ` · updated ${time}` : ''}
    </span>
  );
}

/** Read the active tab from the URL hash (#options), defaulting to brief. */
function tabFromHash(): TabId {
  const h = window.location.hash.replace('#', '') as TabId;
  return (TAB_IDS as string[]).includes(h) ? h : 'brief';
}

/** Mobile bottom nav: Today / Options / Congress / Search. */
function BottomNav({
  active,
  onTab,
  onSearch,
}: {
  active: TabId;
  onTab: (id: TabId) => void;
  onSearch: () => void;
}) {
  const item = (id: TabId, label: string) => (
    <button
      key={id}
      className={`bottomnav-btn${active === id ? ' active' : ''}`}
      onClick={() => onTab(id)}
      aria-current={active === id ? 'page' : undefined}
    >
      {label}
    </button>
  );
  return (
    <nav className="bottomnav" aria-label="TradeDesk sections">
      {item('brief', 'Today')}
      {item('options', 'Options')}
      {item('congress', 'Congress')}
      <button className="bottomnav-btn" onClick={onSearch}>
        Search
      </button>
    </nav>
  );
}

function Shell() {
  const [active, setActive] = useState<TabId>(tabFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [defsOpen, setDefsOpen] = useState(false);

  // Keep the URL hash in sync so refresh stays on the same tab.
  // Listen for hash changes too (back/forward buttons).
  useEffect(() => {
    const onHash = () => setActive(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Escape closes the side menu; lock body scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const select = (id: TabId) => {
    setActive(id);
    window.location.hash = id === 'brief' ? '' : id;
  };

  const goTab = (id: TabId) => {
    select(id);
    setMenuOpen(false);
  };

  const openDefs = () => {
    setMenuOpen(false);
    setDefsOpen(true);
  };

  /** Bottom-nav Search: jump to the Daily Brief and focus its ticker search. */
  const focusBriefSearch = () => {
    select('brief');
    setMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById('brief-search')?.focus();
    }, 80);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="app">
      {/* Side menu: slide-in drawer on phone/tablet, persistent sidebar on desktop. */}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="TradeDesk sections">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">◈</span>
          <span className="brand">TradeDesk</span>
          <button
            className="sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`sidebar-item${active === t.id ? ' active' : ''}`}
              onClick={() => goTab(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <button className="sidebar-item sidebar-defs" onClick={openDefs}>
            <span aria-hidden="true">📖</span> Understanding Fundamentals
          </button>
        </div>
        <div className="sidebar-foot muted small">
          Research &amp; education only, not financial advice.
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className="main-col">
        <header className="topbar">
          <div className="brand-row">
            <button
              className="hamburger"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>
            <span className="brand-mark" aria-hidden="true">◈</span>
            <h1 className="brand">TradeDesk</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="btn btn-ghost fund-shortcut"
              onClick={() => setDefsOpen(true)}
              title="Understanding Fundamentals — every number in plain English"
            >
              ? Fundamentals
            </button>
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
            {active === 'brief' && <DailyBriefTab onOpenTab={goTab} />}
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
          <TabErrorBoundary tabName="Deep Dive" key={`deepdive-${active}`}>
            {active === 'deepdive' && <DeepDiveTab />}
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
          <SchwabPill />
        </footer>
      </div>

      <BottomNav active={active} onTab={goTab} onSearch={focusBriefSearch} />
      <DefinitionsDrawer open={defsOpen} onClose={() => setDefsOpen(false)} />
      <FundamentalsPill onOpen={() => setDefsOpen(true)} />
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
