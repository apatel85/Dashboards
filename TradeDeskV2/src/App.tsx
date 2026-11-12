import { useEffect, useState, type FormEvent } from 'react';
import AuthGate, { useInvite } from './auth/AuthGate';
import LiveQuoteButton from './components/LiveQuoteButton';
import { DefinitionsDrawer } from './components/DefinitionsDrawer';
import { TabErrorBoundary } from './components/ErrorBoundary';
import TodayPage from './pages/Today';
import OptionsPage from './pages/Options';
import IdeasPage from './pages/Ideas';
import LookupPage from './pages/Lookup';
import EarningsTab from './tabs/Earnings';
import CongressGovTab from './tabs/CongressGov';
import PerformanceTab from './tabs/Performance';
import AdminTab from './tabs/Admin';
import { supabase } from './lib/supabase';
import { SCHWAB_AUTH_START_URL, useSchwabLive } from './lib/useSchwabLive';
import { hrefFor, navigate, useRoute, type PageId } from './lib/route';

interface NavItem {
  id: PageId;
  label: string;
  /** One line under the page title — what this page is for. */
  blurb: string;
  icon: string;
}

/** Navigation, grouped by what you are trying to do. */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Start here',
    items: [{ id: 'today', label: 'Today', blurb: 'The market read, key levels and best setups — on one screen.', icon: 'M3 12l9-8 9 8M5 10v10h14V10' }],
  },
  {
    group: 'Trade',
    items: [
      { id: 'options', label: 'Options', blurb: 'Gamma levels, 0DTE / 1DTE focus and the lotto scanner.', icon: 'M4 19V5m0 14h16M8 15l4-5 3 3 5-7' },
      { id: 'ideas', label: 'Stock ideas', blurb: 'Breakouts, smart-money flow and researched ideas.', icon: 'M12 3a6 6 0 00-4 10.5V17h8v-3.5A6 6 0 0012 3zM9 21h6' },
    ],
  },
  {
    group: 'Research',
    items: [
      { id: 'lookup', label: 'Lookup', blurb: 'Deep dive on any ticker, or screen the whole universe.', icon: 'M11 4a7 7 0 105.2 11.7L21 20M11 4a7 7 0 010 14' },
      { id: 'earnings', label: 'Earnings', blurb: 'Who reports when, and how big a move is priced in.', icon: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4' },
      { id: 'money', label: 'Smart money', blurb: 'Disclosed trades by Congress and the White House.', icon: 'M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6' },
    ],
  },
  {
    group: 'Review',
    items: [{ id: 'record', label: 'Track record', blurb: 'Did the calls work? Every suggestion, graded.', icon: 'M5 13l4 4L19 7' }],
  },
];

const ADMIN_ITEM: NavItem = { id: 'admin', label: 'Admin', blurb: 'Who can use TradeDesk.', icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z' };

/** Phone bottom bar: the four daily destinations + More (opens the full menu). */
const BOTTOM: PageId[] = ['today', 'options', 'ideas', 'lookup'];

function Icon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Build version — bump on every push so we can confirm what's live. */
export const BUILD_VERSION = 'v2-2026-11-12a';

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

/** Top-bar ticker search → Lookup deep dive. */
function TickerSearch() {
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim().toUpperCase();
    if (!t) return;
    navigate('lookup', 'dive', t);
    setQ('');
  };
  return (
    <form className="topsearch" onSubmit={submit} role="search">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Look up a ticker…"
        aria-label="Look up a ticker"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={12}
      />
    </form>
  );
}

function Shell() {
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [defsOpen, setDefsOpen] = useState(false);

  const invite = useInvite();
  const isAdmin = invite?.isAdmin ?? false;
  // A non-admin who types #/admin lands on Today instead.
  const page: PageId = route.page === 'admin' && !isAdmin ? 'today' : route.page;
  const allItems = [...NAV.flatMap((g) => g.items), ADMIN_ITEM];
  const current = allItems.find((i) => i.id === page) ?? allItems[0];

  // Close the phone menu whenever the page changes.
  useEffect(() => setMenuOpen(false), [route.page, route.sub]);

  // Escape closes the menu; lock body scroll while it is open.
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

  useEffect(() => {
    document.title = `${current.label} · TradeDesk`;
  }, [current.label]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const link = (item: NavItem) => (
    <a
      key={item.id}
      href={hrefFor(item.id)}
      className={`nav-item${page === item.id ? ' active' : ''}`}
      aria-current={page === item.id ? 'page' : undefined}
    >
      <Icon d={item.icon} />
      {item.label}
    </a>
  );

  return (
    <div className="v2-app">
      <aside className={`v2-side${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="v2-brand">
          <span className="brand-mark" aria-hidden="true">◈</span>
          <span className="brand">TradeDesk</span>
          <button className="v2-side-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
        </div>
        <nav className="v2-nav">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-label">{g.group}</div>
              {g.items.map(link)}
            </div>
          ))}
          {isAdmin ? (
            <div className="nav-group">
              <div className="nav-group-label">Manage</div>
              {link(ADMIN_ITEM)}
            </div>
          ) : null}
        </nav>
        <div className="v2-side-foot">
          <button className="nav-item" onClick={() => { setMenuOpen(false); setDefsOpen(true); }}>
            <Icon d="M12 17v.01M9.5 9a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.5M12 3a9 9 0 100 18 9 9 0 000-18z" />
            Glossary
          </button>
          <button className="nav-item" onClick={signOut}>
            <Icon d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
            Sign out
          </button>
          <SchwabPill />
          <p className="muted small v2-legal">
            Research and education only — not financial advice. {BUILD_VERSION}
          </p>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className="v2-col">
        <header className="v2-top">
          <div className="v2-title">
            <h1>{current.label}</h1>
            <p className="muted">{current.blurb}</p>
          </div>
          <div className="v2-top-actions">
            <TickerSearch />
            <LiveQuoteButton />
          </div>
        </header>

        <main className="v2-main">
          <TabErrorBoundary tabName={current.label} key={`${page}-${route.sub}`}>
            {page === 'today' && <TodayPage sub={route.sub} />}
            {page === 'options' && <OptionsPage sub={route.sub} />}
            {page === 'ideas' && <IdeasPage sub={route.sub} />}
            {page === 'lookup' && <LookupPage sub={route.sub} ticker={route.ticker} />}
            {page === 'earnings' && <EarningsTab />}
            {page === 'money' && <CongressGovTab />}
            {page === 'record' && <PerformanceTab />}
            {page === 'admin' && isAdmin && <AdminTab />}
          </TabErrorBoundary>
        </main>
      </div>

      <nav className="v2-bottom" aria-label="Main navigation">
        {allItems.filter((i) => BOTTOM.includes(i.id)).map((i) => (
          <a key={i.id} href={hrefFor(i.id)} className={`v2-bottom-btn${page === i.id ? ' active' : ''}`} aria-current={page === i.id ? 'page' : undefined}>
            <Icon d={i.icon} />
            <span>{i.id === 'ideas' ? 'Ideas' : i.label}</span>
          </a>
        ))}
        <button className={`v2-bottom-btn${BOTTOM.includes(page) ? '' : ' active'}`} onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
          <Icon d="M4 7h16M4 12h16M4 17h16" />
          <span>More</span>
        </button>
      </nav>

      <DefinitionsDrawer open={defsOpen} onClose={() => setDefsOpen(false)} />
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
