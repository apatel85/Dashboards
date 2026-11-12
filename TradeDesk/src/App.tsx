import { useEffect, useState } from 'react';
import AuthGate, { useInvite } from './auth/AuthGate';
import LiveQuoteButton from './components/LiveQuoteButton';
import { DefinitionsDrawer, FundamentalsPill } from './components/DefinitionsDrawer';
import { TabErrorBoundary } from './components/ErrorBoundary';
import DailyBriefTab from './tabs/DailyBrief';
import OptionsTab from './tabs/Options';
import ScannerTab from './tabs/Scanner';
import EarningsTab from './tabs/Earnings';
import CongressGovTab from './tabs/CongressGov';
import InsidersTab from './tabs/Insiders';
import ResearchTab from './tabs/Research';
import PerformanceTab from './tabs/Performance';
import DeepDiveTab from './tabs/DeepDive';
import NewsTab from './tabs/News';
import ReferenceTab from './tabs/Reference';
import AdminTab from './tabs/Admin';
import { supabase } from './lib/supabase';
import { SCHWAB_AUTH_START_URL, useSchwabLive } from './lib/useSchwabLive';
import type { TabDef, TabId } from './types';
import './mockb-tokens.css';
import './mockb-shell.css';

/**
 * Mock B command-center tab order — numbered 01–12, exactly as the mockup.
 * Signals is absorbed by Scanner; Screener's table + presets live in
 * Deep Dive. Reference carries the 33 definitions + data-file inventory.
 */
const TABS: TabDef[] = [
  { id: 'brief', label: 'Daily Brief', dataFile: 'daily-brief.json' },
  { id: 'options', label: 'Options', dataFile: 'lotto.json' },
  { id: 'scanner', label: 'Scanner', dataFile: 'signals.json' },
  { id: 'congress', label: 'Congress', dataFile: 'congress.json' },
  { id: 'insiders', label: 'Insiders', dataFile: 'insiders.json' },
  { id: 'earnings', label: 'Earnings', dataFile: 'earnings.json' },
  { id: 'research', label: 'Research', dataFile: 'research.json' },
  { id: 'performance', label: 'Performance', dataFile: 'performance.json' },
  { id: 'deepdive', label: 'Deep Dive', dataFile: 'signals.json' },
  { id: 'news', label: 'News', dataFile: 'news.json' },
  { id: 'reference', label: 'Reference', dataFile: '' },
];

const TAB_IDS = TABS.map((t) => t.id);

/** Admin tab — only rendered for admins (see Shell). Not in TABS on purpose. */
const ADMIN_TAB: TabDef = { id: 'admin', label: 'Admin', dataFile: 'tradedesk_invites' };

/** Every tab id, including admin — for reading the URL hash. */
const ALL_TAB_IDS = [...TAB_IDS, 'admin'] as TabId[];

/** Build version — bump on every push so we can confirm what's live. */
export const BUILD_VERSION = '2026-11-12b';

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
  return (ALL_TAB_IDS as string[]).includes(h) ? h : 'brief';
}

function Shell() {
  const [active, setActive] = useState<TabId>(tabFromHash);
  const [defsOpen, setDefsOpen] = useState(false);

  // Admin tab: visible only to admins. Non-admins never see it in the tab
  // row — and a #admin hash falls back to brief.
  const invite = useInvite();
  const isAdmin = invite?.isAdmin ?? false;
  const visibleTabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
  const activeTab = active === 'admin' && !isAdmin ? 'brief' : active;

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
    <div className="app mb-shell">
      <div className="main-col">
        <header className="topbar mb-topbar">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">◈</span>
            <h1 className="brand mb-brand">TradeDesk</h1>
            <span className="mb-topbar-sub muted small">Research &amp; education only, not financial advice.</span>
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

        {/* Mock B tab bar: numbered pills under the header, wrapping. */}
        <nav className="tabnav mb-tabbar" role="tablist" aria-label="TradeDesk sections">
          {visibleTabs.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`tabbtn mb-tabbtn${activeTab === t.id ? ' active' : ''}`}
              onClick={() => select(t.id)}
            >
              <span className="mb-tabnum" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {t.label}
            </button>
          ))}
        </nav>

        <main className="content mb-content">
          <TabErrorBoundary tabName="Daily Brief" key={`brief-${activeTab}`}>
            {activeTab === 'brief' && <DailyBriefTab onOpenTab={select} />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Options" key={`options-${activeTab}`}>
            {activeTab === 'options' && <OptionsTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Scanner" key={`scanner-${activeTab}`}>
            {activeTab === 'scanner' && <ScannerTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Congress" key={`congress-${activeTab}`}>
            {activeTab === 'congress' && <CongressGovTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Insiders" key={`insiders-${activeTab}`}>
            {activeTab === 'insiders' && <InsidersTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Earnings" key={`earnings-${activeTab}`}>
            {activeTab === 'earnings' && <EarningsTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Research" key={`research-${activeTab}`}>
            {activeTab === 'research' && <ResearchTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Performance" key={`performance-${activeTab}`}>
            {activeTab === 'performance' && <PerformanceTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Deep Dive" key={`deepdive-${activeTab}`}>
            {activeTab === 'deepdive' && <DeepDiveTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="News" key={`news-${activeTab}`}>
            {activeTab === 'news' && <NewsTab />}
          </TabErrorBoundary>
          <TabErrorBoundary tabName="Reference" key={`reference-${activeTab}`}>
            {activeTab === 'reference' && <ReferenceTab />}
          </TabErrorBoundary>
          {isAdmin && (
            <TabErrorBoundary tabName="Admin" key={`admin-${activeTab}`}>
              {activeTab === 'admin' && <AdminTab />}
            </TabErrorBoundary>
          )}
        </main>

        <footer className="footer">
          TradeDesk — research and education only, not financial advice.
          <span className="muted"> · v{BUILD_VERSION}</span>
          <SchwabPill />
        </footer>
      </div>

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
