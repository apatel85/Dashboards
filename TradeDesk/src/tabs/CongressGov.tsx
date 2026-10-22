import { useMemo, useState } from 'react';
import {
  Badge,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { Fundamentals } from '../components/Fundamentals';
import { fmtDate, fmtInt, fmtCompactMoney } from '../lib/format';
import type { CongressTrade } from '../types';

const PAGE_SIZE = 50;
const AGG_PAGE_SIZE = 25;
const NOTABLE_LIMIT = 100;

type Branch = 'congress' | 'executive';
type ChamberFilter = 'all' | 'House' | 'Senate';
type TypeFilter = 'all' | 'buy' | 'sell' | 'exchange';
type View = 'agg' | 'notable' | 'trades';
type AggSort = 'amount' | 'officials';
type NotableWindow = 7 | 30 | 90;

const TYPE_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  buy: 'green',
  sell: 'red',
  exchange: 'amber',
};

/** Never invent tickers: group by tradeable ticker when known, else the asset. */
function aggKey(t: CongressTrade): string {
  return t.agg_key ?? t.ticker ?? `DESC:${t.asset_name.toUpperCase()}`;
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

function MemberSub({ t }: { t: CongressTrade }) {
  const sub =
    t.chamber === 'Executive'
      ? [t.role, t.agency].filter(Boolean).join(' · ')
      : [t.party, t.state].filter(Boolean).join(' · ');
  return (
    <>
      {t.member}
      <span className="subname">{sub || '—'}</span>
      {t.committee ? (
        <span className="subname" title="Relevant committee">
          {t.committee}
        </span>
      ) : null}
    </>
  );
}

function TradeRow({ t }: { t: CongressTrade }) {
  const [open, setOpen] = useState(false);
  const late = t.lag_days != null && t.lag_days > 45;
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} title="Tap for detail">
        <td data-th="Member">
          <MemberSub t={t} />
        </td>
        <td data-th="Asset">
          {t.ticker ? (
            <>
              <TvLink ticker={t.ticker} />
              <span className="subname" title={t.asset_name}>
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
        <td data-th="Disclosed" className="num">{fmtDate(t.disclosed_date)}</td>
        <td data-th="Chamber" className="hide-sm">
          <Badge tone={t.chamber === 'House' ? 'blue' : t.chamber === 'Senate' ? 'dim' : 'amber'}>
            {t.chamber === 'Executive' ? 'Exec' : t.chamber}
          </Badge>
        </td>
        <td data-th="Traded" className="num hide-sm">{fmtDate(t.tx_date)}</td>
        <td
          data-th="Lag"
          className={`num hide-sm${late ? ' lateflag' : ''}`}
          title={late ? 'Filed after the 45-day deadline' : 'Disclosure lag'}
        >
          {t.lag_days != null ? `${fmtInt(t.lag_days)}d` : '—'}
        </td>
        <td data-th="Signal" className="hide-sm">
          {t.cluster ? <Badge tone="amber">Cluster</Badge> : <span className="muted">—</span>}
        </td>
        <td data-th="Filing" className="hide-sm">
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
                  <div className="num">{fmtDate(t.tx_date)}</div>
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
      <td data-th="Est. amount" className="num">
        <b>{fmtCompactMoney(r.amount)}</b>
      </td>
      <td data-th="Officials" className="num">{fmtInt(r.officials)}</td>
      <td data-th="Trades" className="num">{fmtInt(r.trades)}</td>
      <td data-th="Buys" className="num up">{fmtInt(r.buys)}</td>
      <td data-th="Sells" className="num down">{fmtInt(r.sells)}</td>
    </tr>
  );
}

function NotableRow({ item }: { item: NotableItem }) {
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
        {t.ticker ? (
          <span className="subname" title={t.asset_name}>{trunc(t.asset_name, 60)}</span>
        ) : null}
      </div>
      {open && (
        <div className="notable-detail">
          <div className="mgrid">
            <span>
              <span className="detail-label">Traded</span>
              <div className="num">{fmtDate(t.tx_date)}</div>
            </span>
            <span>
              <span className="detail-label">Disclosed</span>
              <div className="num">{fmtDate(t.disclosed_date)}</div>
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

  const [branch, setBranch] = useState<Branch>('congress');
  const [view, setView] = useState<View>('agg');
  const [chamber, setChamber] = useState<ChamberFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [clusterOnly, setClusterOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState<{ key: string; label: string } | null>(null);
  const [page, setPage] = useState(0);
  const [aggSort, setAggSort] = useState<AggSort>('amount');
  const [notableWindow, setNotableWindow] = useState<NotableWindow>(30);

  const loading = cLoading || eLoading;
  const error = branch === 'congress' ? cError : eError;
  const data = branch === 'congress' ? congressData : execData;

  const branchRows = useMemo(() => {
    if (!data) return [];
    if (branch === 'congress') {
      return data.filter((t) => chamber === 'all' || t.chamber === chamber);
    }
    return data;
  }, [data, branch, chamber]);

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
    return rows;
  }, [branchRows, aggSort]);

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
    for (const t of branchRows) {
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
  }, [branchRows, notableWindow]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data
      .filter((t) => branch === 'executive' || chamber === 'all' || t.chamber === chamber)
      .filter((t) => type === 'all' || t.trade_type === type)
      .filter((t) => !clusterOnly || t.cluster)
      .filter((t) => !keyFilter || aggKey(t) === keyFilter.key)
      .filter(
        (t) =>
          q === '' ||
          (t.ticker ?? '').toLowerCase().includes(q) ||
          t.member.toLowerCase().includes(q) ||
          t.asset_name.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const ka = a.disclosed_date ?? a.tx_date;
        const kb = b.disclosed_date ?? b.tx_date;
        return ka !== kb ? (ka < kb ? 1 : -1) : a.tx_date < b.tx_date ? 1 : -1;
      });
  }, [data, branch, chamber, type, clusterOnly, query, keyFilter]);

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
    resetPage();
  };
  const selectAggRow = (r: AggRow) => {
    setKeyFilter({ key: r.key, label: r.ticker ?? r.name });
    setView('trades');
    resetPage();
  };

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
              {' '}· latest filing <b>{fmtDate(freshness)}</b>
            </>
          ) : null}
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
                <NotableRow key={`${item.t.member}-${item.t.tx_date}-${item.t.disclosed_date}-${i}`} item={item} />
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
            sub={`${filtered.length.toLocaleString('en-US')} matching · sorted by disclosure date · tap a row for detail`}
          />
          {pageRows.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>{isExec ? 'Official' : 'Member'}</th>
                      <th>Asset</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Disclosed</th>
                      <th className="hide-sm">Branch</th>
                      <th className="hide-sm">Traded</th>
                      <th className="hide-sm">Lag</th>
                      <th className="hide-sm">Signal</th>
                      <th className="hide-sm">Filing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((t, i) => (
                      <TradeRow key={`${t.member}-${t.tx_date}-${t.disclosed_date}-${i}`} t={t} />
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
