import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { Fundamentals } from '../components/Fundamentals';
import { fmtDateY, fmtInt, fmtCompactMoney } from '../lib/format';
import { takeCongressDeepLink } from '../lib/congressDeepLink';
import type { CongressTrade, MemberCommittees } from '../types';

const PAGE_SIZE = 50;
const AGG_PAGE_SIZE = 25;
const NOTABLE_LIMIT = 100;

/** Minimum trade size (midpoint of the disclosed range) filter. */
const AMOUNT_FILTERS = [
  { id: 'any', label: 'Any size', min: 0 },
  { id: '15k', label: '$15k+', min: 15000 },
  { id: '50k', label: '$50k+', min: 50000 },
  { id: '100k', label: '$100k+', min: 100000 },
  { id: '250k', label: '$250k+', min: 250000 },
  { id: '500k', label: '$500k+', min: 500000 },
];

type Branch = 'congress' | 'executive';
type ChamberFilter = 'all' | 'House' | 'Senate';
type TypeFilter = 'all' | 'buy' | 'sell' | 'exchange';
type View = 'agg' | 'notable' | 'trades';
type AggSort = 'amount' | 'officials';
type NotableWindow = 7 | 30 | 90;
type TradeSortKey = 'date' | 'amount' | 'member' | 'asset';

const TYPE_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  buy: 'green',
  sell: 'red',
  exchange: 'amber',
};

/** Never invent tickers: group by tradeable ticker when known, else the asset. */
function aggKey(t: CongressTrade): string {
  return t.agg_key ?? t.ticker ?? `DESC:${t.asset_name.toUpperCase()}`;
}

/** Stable identity for one trade row — the deep link from the Daily Brief
 * targets this key so the exact row can be highlighted and scrolled to. */
function tradeKey(t: CongressTrade): string {
  return `${t.member}|${t.ticker ?? t.asset_name}|${t.disclosed_date ?? t.tx_date}`;
}

function trunc(s: string, n = 42): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function daysAgoLabel(days: number): string {
  if (days < 1) return 'today';
  const d = Math.round(days);
  return d === 1 ? '1d ago' : `${d}d ago`;
}

interface AggRow {
  key: string;
  ticker: string | null;
  name: string;
  trades: number;
  buys: number;
  sells: number;
  officials: number;
  amount: number;
}

interface NotableItem {
  t: CongressTrade;
  daysAgo: number;
  /** true when recency is measured from the filing date, false from trade date */
  byFiling: boolean;
  score: number;
}

/** Small committee chips: at most 2 shown, "+n more" for the rest. */
function CommitteeChips({ committees }: { committees: { name: string; role?: string | null }[] }) {
  if (!committees.length) return null;
  const shown = committees.slice(0, 2);
  return (
    <span className="ctags">
      {shown.map((c) => (
        <span key={c.name} className="ctag" title={c.role && c.role !== 'Member' ? `${c.name} — ${c.role}` : c.name}>
          {c.name}
          {c.role && c.role !== 'Member' ? ` · ${c.role}` : ''}
        </span>
      ))}
      {committees.length > 2 && <span className="ctag dim">+{committees.length - 2} more</span>}
    </span>
  );
}

function MemberSub({ t, committees }: { t: CongressTrade; committees: { name: string; role?: string | null }[] }) {
  const sub =
    t.chamber === 'Executive'
      ? [t.role, t.agency].filter(Boolean).join(' · ')
      : [t.party, t.state].filter(Boolean).join(' · ');
  return (
    <>
      {t.member}
      <span className="subname">{sub || '—'}</span>
      <CommitteeChips committees={committees} />
    </>
  );
}

function TradeRow({
  t,
  committees,
  highlight,
}: {
  t: CongressTrade;
  committees: { name: string; role?: string | null }[];
  /** Deep-linked row: starts open and stays visibly marked. */
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(highlight ?? false);
  const late = t.lag_days != null && t.lag_days > 45;
  return (
    <>
      <tr
        data-trade-key={tradeKey(t)}
        className={`clickable${highlight ? ' trade-highlight' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Tap for detail"
      >
        <td data-th="Member">
          <MemberSub t={t} committees={committees} />
        </td>
        <td data-th="Asset">
          {t.ticker ? (
            <>
              <TvLink ticker={t.ticker} />
              <span className="subname asset-sub" title={t.asset_name}>
                {trunc(t.asset_name)}
              </span>
            </>
          ) : (
            <span className="assetname" title={t.asset_name}>
              {trunc(t.asset_name, 60)}
            </span>
          )}
        </td>
        <td data-th="Type">
          <Badge tone={TYPE_TONE[t.trade_type] ?? 'dim'}>{t.trade_type}</Badge>
        </td>
        <td data-th="Amount" className="num">{t.amount_range}</td>
        <td data-th="Disclosed" className="num">{fmtDateY(t.disclosed_date)}</td>
        <td data-th="Chamber" className="hide-md">
          <Badge tone={t.chamber === 'House' ? 'blue' : t.chamber === 'Senate' ? 'dim' : 'amber'}>
            {t.chamber === 'Executive' ? 'Exec' : t.chamber}
          </Badge>
        </td>
        <td data-th="Traded" className="num hide-narrow">{fmtDateY(t.tx_date)}</td>
        <td
          data-th="Lag"
          className={`num hide-md${late ? ' lateflag' : ''}`}
          title={late ? 'Filed after the 45-day deadline' : 'Disclosure lag'}
        >
          {t.lag_days != null ? `${fmtInt(t.lag_days)}d` : '—'}
        </td>
        <td data-th="Signal" className="hide-md">
          {t.cluster ? <Badge tone="amber">Cluster</Badge> : <span className="muted">—</span>}
        </td>
        <td data-th="Filing" className="hide-md">
          {t.doc_url ? (
            <a className="doclink" href={t.doc_url} target="_blank" rel="noreferrer">
              {t.chamber === 'Executive' ? 'Record' : 'PDF'}
            </a>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={10}>
            <div className="mdetail">
              <div className="only-sm mgrid">
                <span>
                  <span className="detail-label">Branch</span>
                  <div>{t.chamber === 'Executive' ? 'White House' : t.chamber}</div>
                </span>
                <span>
                  <span className="detail-label">Traded</span>
                  <div className="num">{fmtDateY(t.tx_date)}</div>
                </span>
                <span>
                  <span className="detail-label">Lag</span>
                  <div className={`num${late ? ' lateflag' : ''}`}>
                    {t.lag_days != null ? `${fmtInt(t.lag_days)}d` : '—'}
                  </div>
                </span>
                <span>
                  <span className="detail-label">Signal</span>
                  <div>{t.cluster ? <Badge tone="amber">Cluster</Badge> : <span className="muted">—</span>}</div>
                </span>
              </div>
              <div className="mfull">
                <span className="detail-label">Asset</span>
                <div>{t.asset_name}</div>
                {t.doc_url ? (
                  <a className="doclink" href={t.doc_url} target="_blank" rel="noreferrer">
                    {t.chamber === 'Executive' ? 'DisclosedCapitol record' : 'Official filing PDF'}
                  </a>
                ) : null}
              </div>
            </div>
            <Fundamentals ticker={t.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}

function AggRowView({ r, onSelect }: { r: AggRow; onSelect: (r: AggRow) => void }) {
  return (
    <tr className="clickable" onClick={() => onSelect(r)} title="Show individual trades">
      <td data-th="Asset">
        {r.ticker ? (
          <>
            <TvLink ticker={r.ticker} />
            {r.name !== r.ticker ? (
              <span className="subname" title={r.name}>{trunc(r.name, 30)}</span>
            ) : null}
          </>
        ) : (
          <span className="assetname" title={r.name}>{trunc(r.name, 44)}</span>
        )}
      </td>
      <td data-th="Est. amount" className="num r">
        <b>{fmtCompactMoney(r.amount)}</b>
      </td>
      <td data-th="Officials" className="num r">{fmtInt(r.officials)}</td>
      <td data-th="Trades" className="num r">{fmtInt(r.trades)}</td>
      <td data-th="Buys" className="num r up">{fmtInt(r.buys)}</td>
      <td data-th="Sells" className="num r down">{fmtInt(r.sells)}</td>
    </tr>
  );
}

function NotableRow({ item, committees }: { item: NotableItem; committees: { name: string; role?: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const { t, daysAgo, byFiling } = item;
  const whenLabel = byFiling ? 'disclosed' : 'traded';
  return (
    <div className={`notable-card${open ? ' open' : ''}`}>
      <div
        className="notable-main"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o);
        }}
      >
        <span className="notable-top">
          {t.ticker ? <TvLink ticker={t.ticker} /> : <span className="assetname">{trunc(t.asset_name, 34)}</span>}
          <Badge tone={TYPE_TONE[t.trade_type] ?? 'dim'}>{t.trade_type}</Badge>
          <span className="notable-amt num">{t.amount_range}</span>
        </span>
        <span className="notable-sub">
          <span className="muted">{t.member}</span>
          <span className="muted">·</span>
          <span>{whenLabel} {daysAgoLabel(daysAgo)}</span>
          {t.cluster ? <Badge tone="amber">Cluster</Badge> : null}
        </span>
        <CommitteeChips committees={committees} />
        {t.ticker ? (
          <span className="subname" title={t.asset_name}>{trunc(t.asset_name, 60)}</span>
        ) : null}
      </div>
      {open && (
        <div className="notable-detail">
          <div className="mgrid">
            <span>
              <span className="detail-label">Traded</span>
              <div className="num">{fmtDateY(t.tx_date)}</div>
            </span>
            <span>
              <span className="detail-label">Disclosed</span>
              <div className="num">{fmtDateY(t.disclosed_date)}</div>
            </span>
            <span>
              <span className="detail-label">{t.chamber === 'Executive' ? 'Role' : 'Chamber'}</span>
              <div>{t.chamber === 'Executive' ? t.role ?? '—' : t.chamber}</div>
            </span>
            <span>
              <span className="detail-label">Filing</span>
              <div>
                {t.doc_url ? (
                  <a className="doclink" href={t.doc_url} target="_blank" rel="noreferrer">
                    {t.chamber === 'Executive' ? 'Record' : 'PDF'}
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CongressGovTab() {
  const { data: congressData, loading: cLoading, error: cError } = useJsonData<CongressTrade[]>('congress.json');
  const { data: execData, loading: eLoading, error: eError } = useJsonData<CongressTrade[]>('executive.json');
  // Committee mapping is a static file (119th Congress); missing file = no
  // chips/filter yet, never an error state.
  const { data: committeesData } = useJsonData<MemberCommittees[]>('congress-committees.json');

  const [branch, setBranch] = useState<Branch>('congress');
  const [view, setView] = useState<View>('agg');
  const [chamber, setChamber] = useState<ChamberFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [clusterOnly, setClusterOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [committee, setCommittee] = useState('all');
  const [minAmount, setMinAmount] = useState(0);
  const [keyFilter, setKeyFilter] = useState<{ key: string; label: string } | null>(null);
  const [page, setPage] = useState(0);
  const [aggSort, setAggSort] = useState<AggSort>('amount');
  const [notableWindow, setNotableWindow] = useState<NotableWindow>(30);
  /** Trades-table sort: date desc (newest first) is the default. */
  const [tradeSort, setTradeSort] = useState<{ key: TradeSortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  /** Deep-linked trade row (from the Daily Brief) to highlight + scroll to. */
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const committeesByMember = useMemo(() => {
    const m = new Map<string, { name: string; role?: string | null }[]>();
    for (const entry of committeesData ?? []) {
      if (entry.member && Array.isArray(entry.committees)) m.set(entry.member, entry.committees);
    }
    return m;
  }, [committeesData]);
  const committeesFor = (member: string) => committeesByMember.get(member) ?? [];
  const allCommittees = useMemo(() => {
    const s = new Set<string>();
    for (const list of committeesByMember.values()) for (const c of list) s.add(c.name);
    return [...s].sort();
  }, [committeesByMember]);

  const loading = cLoading || eLoading;
  const error = branch === 'congress' ? cError : eError;
  const data = branch === 'congress' ? congressData : execData;

  // Base rows for every view: chamber + committee + minimum size.
  // (Type, cluster, key and text search apply per-view below.)
  const branchRows = useMemo(() => {
    if (!data) return [];
    let rows = branch === 'congress'
      ? data.filter((t) => chamber === 'all' || t.chamber === chamber)
      : data;
    if (branch === 'congress' && committee !== 'all') {
      rows = rows.filter((t) => committeesFor(t.member).some((c) => c.name === committee));
    }
    if (minAmount > 0) {
      rows = rows.filter((t) => (t.amount_mid ?? 0) >= minAmount);
    }
    return rows;
  }, [data, branch, chamber, committee, minAmount, committeesByMember]);

  const matchesQuery = (t: CongressTrade, q: string) =>
    q === '' ||
    (t.ticker ?? '').toLowerCase().includes(q) ||
    t.member.toLowerCase().includes(q) ||
    t.asset_name.toLowerCase().includes(q);

  const agg = useMemo((): AggRow[] => {
    const m = new Map<string, { ticker: string | null; name: string; trades: number; buys: number; sells: number; officials: Set<string>; amount: number }>();
    for (const t of branchRows) {
      const key = aggKey(t);
      let r = m.get(key);
      if (!r) {
        r = { ticker: t.ticker, name: t.asset_name, trades: 0, buys: 0, sells: 0, officials: new Set(), amount: 0 };
        m.set(key, r);
      }
      if (!r.ticker && t.ticker) r.ticker = t.ticker;
      r.trades += 1;
      if (t.trade_type === 'buy') r.buys += 1;
      else if (t.trade_type === 'sell') r.sells += 1;
      if (t.member) r.officials.add(t.member);
      if (t.amount_mid != null && isFinite(t.amount_mid)) r.amount += t.amount_mid;
    }
    const rows: AggRow[] = [...m.entries()].map(([key, r]) => ({
      key,
      ticker: r.ticker,
      name: r.name,
      trades: r.trades,
      buys: r.buys,
      sells: r.sells,
      officials: r.officials.size,
      amount: r.amount,
    }));
    rows.sort((a, b) =>
      aggSort === 'amount' ? b.amount - a.amount : b.officials - a.officials || b.amount - a.amount,
    );
    const q = query.trim().toLowerCase();
    if (q) {
      return rows.filter(
        (r) => (r.ticker ?? '').toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [branchRows, aggSort, query]);

  /**
   * Notable: individual recent trades, ranked by size × recency.
   * score = log10(amount) × (0.4 + 0.6 × e^(-days/10)) × cluster-boost.
   * Recency uses the filing date when known, else the trade date — the row
   * always says which one ("disclosed 3d ago" vs "traded 3d ago").
   */
  const notable = useMemo((): NotableItem[] => {
    if (!branchRows) return [];
    const now = Date.now();
    const out: NotableItem[] = [];
    const q = query.trim().toLowerCase();
    for (const t of branchRows) {
      if (!matchesQuery(t, q)) continue;
      const refDate = t.disclosed_date ?? t.tx_date;
      const byFiling = t.disclosed_date != null;
      const daysAgo = (now - Date.parse(`${refDate}T12:00:00Z`)) / 86400000;
      if (!isFinite(daysAgo) || daysAgo < 0 || daysAgo > notableWindow) continue;
      const sizeW = Math.log10((t.amount_mid ?? 1000) + 1);
      const recW = Math.exp(-daysAgo / 10);
      const score = sizeW * (0.4 + 0.6 * recW) * (t.cluster ? 1.2 : 1);
      out.push({ t, daysAgo, byFiling, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, NOTABLE_LIMIT);
  }, [branchRows, notableWindow, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dir = tradeSort.dir;
    return branchRows
      .filter((t) => type === 'all' || t.trade_type === type)
      .filter((t) => !clusterOnly || t.cluster)
      .filter((t) => !keyFilter || aggKey(t) === keyFilter.key)
      .filter((t) => matchesQuery(t, q))
      .sort((a, b) => {
        switch (tradeSort.key) {
          case 'amount':
            return ((a.amount_mid ?? 0) - (b.amount_mid ?? 0)) * dir;
          case 'member':
            return a.member.localeCompare(b.member) * dir;
          case 'asset':
            return (a.ticker ?? a.asset_name).localeCompare(b.ticker ?? b.asset_name) * dir;
          case 'date':
          default: {
            const ka = a.disclosed_date ?? a.tx_date;
            const kb = b.disclosed_date ?? b.tx_date;
            return (ka !== kb ? (ka < kb ? -1 : 1) : a.tx_date < b.tx_date ? -1 : 1) * dir;
          }
        }
      });
  }, [branchRows, type, clusterOnly, query, keyFilter, tradeSort]);

  /** Infographic stats: the whole branch feed (not the filtered subset), so
   * the tiles always show the full picture and act as filters. */
  const flowStats = useMemo(() => {
    let buys = 0, sells = 0, buyAmt = 0, sellAmt = 0, house = 0, senate = 0, clusters = 0;
    for (const t of data ?? []) {
      if (t.trade_type === 'buy') { buys++; buyAmt += t.amount_mid ?? 0; }
      else if (t.trade_type === 'sell') { sells++; sellAmt += t.amount_mid ?? 0; }
      if (t.chamber === 'House') house++;
      else if (t.chamber === 'Senate') senate++;
      if (t.cluster) clusters++;
    }
    return { buys, sells, buyAmt, sellAmt, house, senate, clusters, total: (data ?? []).length };
  }, [data]);

  const freshness = useMemo(() => {
    if (!data || data.length === 0) return null;
    let m = '';
    for (const t of data) {
      const k = t.disclosed_date ?? t.tx_date;
      if (k > m) m = k;
    }
    return m || null;
  }, [data]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const aggPageCount = Math.max(1, Math.ceil(agg.length / AGG_PAGE_SIZE));
  const aggSafePage = Math.min(page, aggPageCount - 1);
  const aggRows = agg.slice(aggSafePage * AGG_PAGE_SIZE, (aggSafePage + 1) * AGG_PAGE_SIZE);

  const resetPage = () => setPage(0);
  const switchBranch = (b: Branch) => {
    setBranch(b);
    setKeyFilter(null);
    setQuery('');
    setCommittee('all');
    setMinAmount(0);
    resetPage();
  };
  const selectAggRow = (r: AggRow) => {
    setKeyFilter({ key: r.key, label: r.ticker ?? r.name });
    setView('trades');
    resetPage();
  };

  /** Trades-table header sort: tap a header to sort, tap again to reverse. */
  const toggleTradeSort = (key: TradeSortKey) => {
    setTradeSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: key === 'date' || key === 'amount' ? -1 : 1 },
    );
    resetPage();
  };
  const sortArrow = (key: TradeSortKey) =>
    tradeSort.key !== key ? '' : tradeSort.dir === 1 ? ' ▲' : ' ▼';

  /** Infographic tile tap: filter the feed (tap again to clear). */
  const pickFlow = (kind: 'buy' | 'sell' | 'house' | 'senate' | 'cluster') => {
    setView('trades');
    resetPage();
    if (kind === 'buy') { setType(type === 'buy' ? 'all' : 'buy'); setClusterOnly(false); }
    else if (kind === 'sell') { setType(type === 'sell' ? 'all' : 'sell'); setClusterOnly(false); }
    else if (kind === 'house') setChamber(chamber === 'House' ? 'all' : 'House');
    else if (kind === 'senate') setChamber(chamber === 'Senate' ? 'all' : 'Senate');
    else if (kind === 'cluster') { setClusterOnly(!clusterOnly); setType('all'); }
  };

  /**
   * Deep link from the Daily Brief's New developments: on mount, take the
   * pending link (if any) and jump straight to that trade — right branch,
   * Trades view, search set to the ticker/member, other filters reset so the
   * trade is actually visible, newest-first sort.
   */
  useEffect(() => {
    const link = takeCongressDeepLink();
    if (!link) return;
    setBranch(link.branch);
    setView('trades');
    setQuery(link.query);
    setChamber('all');
    setType('all');
    setClusterOnly(false);
    setCommittee('all');
    setMinAmount(0);
    setKeyFilter(null);
    setPage(0);
    setTradeSort({ key: 'date', dir: -1 });
    setHighlightKey(link.key);
    // Mount-only: the link is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Once the deep-linked row is rendered, scroll it into view. */
  useEffect(() => {
    if (!highlightKey) return;
    const id = window.setTimeout(() => {
      const el = document.querySelector(`[data-trade-key="${CSS.escape(highlightKey)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(id);
  }, [highlightKey, pageRows]);

  if (loading) return <LoadingPanel what="disclosure data" />;
  if (error || !data)
    return (
      <ErrorPanel
        file={branch === 'congress' ? 'public/data/congress.json' : 'public/data/executive.json'}
        error={error ?? 'empty file'}
      />
    );

  const isExec = branch === 'executive';

  return (
    <section className="tab">
      <header className="tab-header">
        <h2>Congress &amp; Gov</h2>
        <p className="muted">
          {isExec ? (
            <>
              {data.length.toLocaleString('en-US')} White House / executive disclosures
            </>
          ) : (
            <>{data.length.toLocaleString('en-US')} disclosed congressional trades</>
          )}
          {freshness ? (
            <>
              {' '}· latest filing <b>{fmtDateY(freshness)}</b>
            </>
          ) : null}
        </p>
        <p className="muted small plain-note">
          What members of Congress and senior officials bought and sold. Useful for spotting
          where insiders are putting money — but filings can lag the trade by 45 days, so this
          is a slow research feed, never a buy signal on its own. Committee tags show which
          panels a member sits on; a trade in a sector their committee oversees is worth a
          closer look.
        </p>
      </header>

      <div className="seg seg-large" role="tablist" aria-label="Disclosure branch">
        <button className={!isExec ? 'active' : ''} onClick={() => switchBranch('congress')}>
          Congress
        </button>
        <button className={isExec ? 'active' : ''} onClick={() => switchBranch('executive')}>
          White House
        </button>
      </div>

      <div className={`callout${isExec ? '' : ' warn'}`}>
        <span className="detail-label">{isExec ? 'Coverage' : 'Disclosure lag'}</span>
        {isExec ? (
          <p>
            Senior executive-branch officials — the President, Vice President,
            Cabinet and top appointees — file under the STOCK Act just like
            Congress. Parsed from official OGE filings by the DisclosedCapitol
            open dataset. Covers each official's own plus spouse/dependent-child
            transactions as reported on their forms; associates are not covered
            by disclosure law.
          </p>
        ) : (
          <p>
            Members may legally disclose trades up to 45 days after the transaction —
            many file later. This is a slow research feed for swing ideas, never an
            intraday signal.
          </p>
        )}
      </div>

      {/* Flow infographic: the whole feed at a glance. Tap a tile to filter. */}
      <div className="panel flow-info">
        <div className="flow-bar" title={`${flowStats.buys.toLocaleString('en-US')} buys vs ${flowStats.sells.toLocaleString('en-US')} sells`}>
          <div
            className="flow-bar-buy"
            style={{ width: `${flowStats.buys + flowStats.sells > 0 ? (flowStats.buys / (flowStats.buys + flowStats.sells)) * 100 : 50}%` }}
          />
        </div>
        <div className="flow-tiles">
          <button
            type="button"
            className={`flow-tile up${view === 'trades' && type === 'buy' ? ' active' : ''}`}
            onClick={() => pickFlow('buy')}
            title="Show only buys"
          >
            <span className="flow-tile-num">{flowStats.buys.toLocaleString('en-US')}</span>
            <span className="flow-tile-label">Buys · {fmtCompactMoney(flowStats.buyAmt)}</span>
          </button>
          <button
            type="button"
            className={`flow-tile down${view === 'trades' && type === 'sell' ? ' active' : ''}`}
            onClick={() => pickFlow('sell')}
            title="Show only sells"
          >
            <span className="flow-tile-num">{flowStats.sells.toLocaleString('en-US')}</span>
            <span className="flow-tile-label">Sells · {fmtCompactMoney(flowStats.sellAmt)}</span>
          </button>
          {!isExec && (
            <>
              <button
                type="button"
                className={`flow-tile${chamber === 'House' ? ' active' : ''}`}
                onClick={() => pickFlow('house')}
                title="Show only House trades"
              >
                <span className="flow-tile-num">{flowStats.house.toLocaleString('en-US')}</span>
                <span className="flow-tile-label">House</span>
              </button>
              <button
                type="button"
                className={`flow-tile${chamber === 'Senate' ? ' active' : ''}`}
                onClick={() => pickFlow('senate')}
                title="Show only Senate trades"
              >
                <span className="flow-tile-num">{flowStats.senate.toLocaleString('en-US')}</span>
                <span className="flow-tile-label">Senate</span>
              </button>
            </>
          )}
          <button
            type="button"
            className={`flow-tile${view === 'trades' && clusterOnly ? ' active' : ''}`}
            onClick={() => pickFlow('cluster')}
            title="Show only cluster buys (2+ officials, same week)"
          >
            <span className="flow-tile-num">{flowStats.clusters.toLocaleString('en-US')}</span>
            <span className="flow-tile-label">Cluster buys</span>
          </button>
        </div>
        <p className="muted small plain-note">
          Green bar = share of buys. Tap a tile to filter the trades below; tap again to clear.
          Amounts are range midpoints, so treat the dollars as estimates.
        </p>
      </div>

      <div className="panel filterbar">
        <div className="seg" role="tablist" aria-label="View">
          <button className={view === 'agg' ? 'active' : ''} onClick={() => { setView('agg'); resetPage(); }}>
            By stock
          </button>
          <button className={view === 'notable' ? 'active' : ''} onClick={() => { setView('notable'); resetPage(); }}>
            Notable
          </button>
          <button className={view === 'trades' ? 'active' : ''} onClick={() => { setView('trades'); resetPage(); }}>
            Trades
          </button>
        </div>
        {!isExec && (
          <label className="filter">
            <span>Chamber</span>
            <select
              value={chamber}
              onChange={(e) => {
                setChamber(e.target.value as ChamberFilter);
                resetPage();
              }}
            >
              <option value="all">All</option>
              <option value="House">House</option>
              <option value="Senate">Senate</option>
            </select>
          </label>
        )}
        {!isExec && allCommittees.length > 0 && (
          <label className="filter">
            <span>Committee</span>
            <select
              value={committee}
              onChange={(e) => {
                setCommittee(e.target.value);
                resetPage();
              }}
            >
              <option value="all">All committees</option>
              {allCommittees.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        <label className="filter">
          <span>Min size</span>
          <select
            value={AMOUNT_FILTERS.find((f) => f.min === minAmount)?.id ?? 'any'}
            onChange={(e) => {
              setMinAmount(AMOUNT_FILTERS.find((f) => f.id === e.target.value)?.min ?? 0);
              resetPage();
            }}
          >
            {AMOUNT_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="filter grow">
          <span>Search {isExec ? 'official / asset' : 'ticker / member'}</span>
          <input
            type="text"
            value={query}
            placeholder={isExec ? 'e.g. Trump or NVIDIA' : 'e.g. NVDA or Pelosi'}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
          />
        </label>
        {view === 'agg' && (
          <div className="seg" role="tablist" aria-label="Sort aggregate">
            <button className={aggSort === 'amount' ? 'active' : ''} onClick={() => { setAggSort('amount'); resetPage(); }}>
              By amount
            </button>
            <button className={aggSort === 'officials' ? 'active' : ''} onClick={() => { setAggSort('officials'); resetPage(); }}>
              By officials
            </button>
          </div>
        )}
        {view === 'notable' && (
          <div className="seg" role="tablist" aria-label="Recency window">
            {([7, 30, 90] as NotableWindow[]).map((w) => (
              <button
                key={w}
                className={notableWindow === w ? 'active' : ''}
                onClick={() => setNotableWindow(w)}
              >
                {w}d
              </button>
            ))}
          </div>
        )}
        {view === 'trades' && (
          <>
            <label className="filter">
              <span>Type</span>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as TypeFilter);
                  resetPage();
                }}
              >
                <option value="all">All</option>
                <option value="buy">Buys</option>
                <option value="sell">Sells</option>
                <option value="exchange">Exchanges</option>
              </select>
            </label>
            <label className="filter check">
              <input
                type="checkbox"
                checked={clusterOnly}
                onChange={(e) => {
                  setClusterOnly(e.target.checked);
                  resetPage();
                }}
              />
              <span>Cluster buys only</span>
            </label>
          </>
        )}
      </div>

      {keyFilter && view === 'trades' && (
        <div className="activefilter">
          <span>
            Showing trades for <b>{trunc(keyFilter.label, 40)}</b>
          </span>
          <button className="btn btn-ghost" onClick={() => { setKeyFilter(null); resetPage(); }}>
            Clear ×
          </button>
        </div>
      )}

      {view === 'agg' && (
        <>
          <SectionHead
            title={isExec ? 'Most traded assets' : 'Most traded stocks'}
            sub={`${agg.length.toLocaleString('en-US')} ${isExec ? 'assets' : 'tickers'} · sorted by ${aggSort === 'amount' ? 'estimated amount' : 'officials involved'} · tap a row for its trades`}
          />
          {aggRows.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th className="r">Est. amount</th>
                      <th className="r">Officials</th>
                      <th className="r">Trades</th>
                      <th className="r">Buys</th>
                      <th className="r">Sells</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggRows.map((r) => (
                      <AggRowView key={r.key} r={r} onSelect={selectAggRow} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button className="btn btn-ghost" disabled={aggSafePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  ← Prev
                </button>
                <span className="muted small num">
                  Page {aggSafePage + 1} of {aggPageCount.toLocaleString('en-US')}
                </span>
                <button className="btn btn-ghost" disabled={aggSafePage >= aggPageCount - 1} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            </>
          ) : (
            <div className="panel">
              <p className="muted">No trades match the current filters.</p>
            </div>
          )}
          <p className="muted small footnote-line">
            Amounts are disclosed as ranges only — totals use the range midpoint,
            so treat them as estimates. Filings often omit tradeable tickers;
            those assets aggregate by name instead. “Cluster” marks assets bought by
            2+ distinct {isExec ? 'officials' : 'members'} within ~7 days.
          </p>
        </>
      )}

      {view === 'notable' && (
        <>
          <SectionHead
            title="Notable recent trades"
            sub={`Last ${notableWindow} days · ranked by size × recency · tap a card for detail`}
          />
          {notable.length > 0 ? (
            <div className="notable-list">
              {notable.map((item, i) => (
                <NotableRow
                  key={`${item.t.member}-${item.t.tx_date}-${item.t.disclosed_date}-${i}`}
                  item={item}
                  committees={committeesFor(item.t.member)}
                />
              ))}
            </div>
          ) : (
            <div className="panel">
              <p className="muted">
                No trades in the last {notableWindow} days.
                {isExec ? ' The White House dataset currently ends with filings from Jul 2026 — try a wider window.' : ''}
              </p>
            </div>
          )}
          <p className="muted small footnote-line">
            Ranked by trade size weighted toward recency — a large trade from days
            ago outranks a small one from weeks ago. Recency uses the filing date
            when known, otherwise the trade date (each row says which).
          </p>
        </>
      )}

      {view === 'trades' && (
        <>
          <SectionHead
            title="Disclosed trades"
            sub={`${filtered.length.toLocaleString('en-US')} matching · sorted by ${tradeSort.key === 'date' ? 'disclosure date' : tradeSort.key} ${tradeSort.dir === 1 ? '↑' : '↓'} · tap a column header to re-sort · tap a row for detail`}
          />
          {pageRows.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="dtable trades-table">
                  <thead>
                    <tr>
                      <th>
                        <button className="linklike" onClick={() => toggleTradeSort('member')}>
                          {isExec ? 'Official' : 'Member'}{sortArrow('member')}
                        </button>
                      </th>
                      <th>
                        <button className="linklike" onClick={() => toggleTradeSort('asset')}>
                          Asset{sortArrow('asset')}
                        </button>
                      </th>
                      <th>Type</th>
                      <th>
                        <button className="linklike" onClick={() => toggleTradeSort('amount')}>
                          Amount{sortArrow('amount')}
                        </button>
                      </th>
                      <th>
                        <button className="linklike" onClick={() => toggleTradeSort('date')}>
                          Disclosed{sortArrow('date')}
                        </button>
                      </th>
                      <th className="hide-md">Branch</th>
                      <th className="hide-narrow">Traded</th>
                      <th className="hide-md">Lag</th>
                      <th className="hide-md">Signal</th>
                      <th className="hide-md">Filing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((t, i) => (
                      <TradeRow
                        key={`${t.member}-${t.tx_date}-${t.disclosed_date}-${i}`}
                        t={t}
                        committees={committeesFor(t.member)}
                        highlight={highlightKey !== null && highlightKey === tradeKey(t)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button className="btn btn-ghost" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  ← Prev
                </button>
                <span className="muted small num">
                  Page {safePage + 1} of {pageCount.toLocaleString('en-US')}
                </span>
                <button className="btn btn-ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            </>
          ) : (
            <div className="panel">
              <p className="muted">No trades match the current filters.</p>
            </div>
          )}
          <p className="muted small footnote-line">
            Amounts are disclosed as ranges only. “Cluster” marks {isExec ? 'assets' : 'tickers'} bought by
            2+ distinct {isExec ? 'officials' : 'members'} within ~7 days. Filing links go to the
            official {isExec ? 'disclosure record' : 'House Clerk / Senate disclosure PDFs'}.
          </p>
        </>
      )}
    </section>
  );
}
