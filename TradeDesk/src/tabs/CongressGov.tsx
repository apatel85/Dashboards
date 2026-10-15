import { useMemo, useState } from 'react';
import {
  Badge,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { fmtDate, fmtInt, fmtCompactMoney } from '../lib/format';
import type { CongressTrade } from '../types';

const PAGE_SIZE = 50;
const AGG_PAGE_SIZE = 25;

type ChamberFilter = 'all' | 'House' | 'Senate';
type TypeFilter = 'all' | 'buy' | 'sell' | 'exchange';
type View = 'trades' | 'agg';
type AggSort = 'amount' | 'officials';

const TYPE_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  buy: 'green',
  sell: 'red',
  exchange: 'amber',
};

interface AggRow {
  ticker: string;
  trades: number;
  buys: number;
  sells: number;
  officials: number;
  amount: number;
}

function TradeRow({ t }: { t: CongressTrade }) {
  const [open, setOpen] = useState(false);
  const late = t.lag_days > 45;
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} title="Tap for detail">
        <td data-th="Member">
          {t.member}
          <span className="subname">
            {[t.party, t.state].filter(Boolean).join(' · ') || '—'}
          </span>
          {t.committee ? (
            <span className="subname" title="Relevant committee">
              {t.committee}
            </span>
          ) : null}
        </td>
        <td data-th="Ticker">
          <span className="ticker">{t.ticker}</span>
          <span className="subname" title={t.asset_name}>
            {t.asset_name.length > 42 ? t.asset_name.slice(0, 42) + '…' : t.asset_name}
          </span>
        </td>
        <td data-th="Type">
          <Badge tone={TYPE_TONE[t.trade_type] ?? 'dim'}>{t.trade_type}</Badge>
        </td>
        <td data-th="Amount" className="num">{t.amount_range}</td>
        <td data-th="Disclosed" className="num">{fmtDate(t.disclosed_date)}</td>
        <td data-th="Chamber" className="hide-sm">
          <Badge tone={t.chamber === 'House' ? 'blue' : 'dim'}>{t.chamber}</Badge>
        </td>
        <td data-th="Traded" className="num hide-sm">{fmtDate(t.tx_date)}</td>
        <td
          data-th="Lag"
          className={`num hide-sm${late ? ' lateflag' : ''}`}
          title={late ? 'Filed after the 45-day deadline' : 'Disclosure lag'}
        >
          {fmtInt(t.lag_days)}d
        </td>
        <td data-th="Signal" className="hide-sm">
          {t.cluster ? <Badge tone="amber">Cluster</Badge> : <span className="muted">—</span>}
        </td>
        <td data-th="Filing" className="hide-sm">
          {t.doc_url ? (
            <a className="doclink" href={t.doc_url} target="_blank" rel="noreferrer">
              PDF
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
                  <span className="detail-label">Chamber</span>
                  <div>{t.chamber}</div>
                </span>
                <span>
                  <span className="detail-label">Traded</span>
                  <div className="num">{fmtDate(t.tx_date)}</div>
                </span>
                <span>
                  <span className="detail-label">Lag</span>
                  <div className={`num${late ? ' lateflag' : ''}`}>{fmtInt(t.lag_days)}d</div>
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
                    Official filing PDF
                  </a>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AggRowView({ r, onSelect }: { r: AggRow; onSelect: (ticker: string) => void }) {
  return (
    <tr className="clickable" onClick={() => onSelect(r.ticker)} title="Show individual trades">
      <td data-th="Ticker">
        <span className="ticker">{r.ticker}</span>
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

export default function CongressGovTab() {
  const { data, loading, error } = useJsonData<CongressTrade[]>('congress.json');
  const [view, setView] = useState<View>('agg');
  const [chamber, setChamber] = useState<ChamberFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [clusterOnly, setClusterOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [aggSort, setAggSort] = useState<AggSort>('amount');

  const chamberFiltered = useMemo(() => {
    if (!data) return [];
    return data.filter((t) => chamber === 'all' || t.chamber === chamber);
  }, [data, chamber]);

  const agg = useMemo((): AggRow[] => {
    const m = new Map<string, { trades: number; buys: number; sells: number; officials: Set<string>; amount: number }>();
    for (const t of chamberFiltered) {
      if (!t.ticker) continue;
      let r = m.get(t.ticker);
      if (!r) {
        r = { trades: 0, buys: 0, sells: 0, officials: new Set(), amount: 0 };
        m.set(t.ticker, r);
      }
      r.trades += 1;
      if (t.trade_type === 'buy') r.buys += 1;
      else if (t.trade_type === 'sell') r.sells += 1;
      if (t.member) r.officials.add(t.member);
      if (t.amount_mid != null && isFinite(t.amount_mid)) r.amount += t.amount_mid;
    }
    const rows: AggRow[] = [...m.entries()].map(([ticker, r]) => ({
      ticker,
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
  }, [chamberFiltered, aggSort]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data
      .filter((t) => chamber === 'all' || t.chamber === chamber)
      .filter((t) => type === 'all' || t.trade_type === type)
      .filter((t) => !clusterOnly || t.cluster)
      .filter(
        (t) =>
          q === '' ||
          t.ticker.toLowerCase().includes(q) ||
          t.member.toLowerCase().includes(q) ||
          t.asset_name.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        a.disclosed_date !== b.disclosed_date
          ? a.disclosed_date < b.disclosed_date
            ? 1
            : -1
          : a.tx_date < b.tx_date
            ? 1
            : -1,
      );
  }, [data, chamber, type, clusterOnly, query]);

  const freshness = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data.reduce((m, t) => (t.disclosed_date > m ? t.disclosed_date : m), data[0].disclosed_date);
  }, [data]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const aggPageCount = Math.max(1, Math.ceil(agg.length / AGG_PAGE_SIZE));
  const aggSafePage = Math.min(page, aggPageCount - 1);
  const aggRows = agg.slice(aggSafePage * AGG_PAGE_SIZE, (aggSafePage + 1) * AGG_PAGE_SIZE);

  const resetPage = () => setPage(0);
  const selectTicker = (ticker: string) => {
    setQuery(ticker);
    setView('trades');
    resetPage();
  };

  if (loading) return <LoadingPanel what="congressional trades" />;
  if (error || !data)
    return <ErrorPanel file="public/data/congress.json" error={error ?? 'empty file'} />;

  return (
    <section className="tab">
      <header className="tab-header">
        <h2>Congress &amp; Gov</h2>
        <p className="muted">
          {data.length.toLocaleString('en-US')} disclosed trades
          {freshness ? (
            <>
              {' '}· latest disclosure <b>{fmtDate(freshness)}</b>
            </>
          ) : null}
        </p>
      </header>

      <div className="callout warn">
        <span className="detail-label">Disclosure lag</span>
        <p>
          Members may legally disclose trades up to 45 days after the transaction —
          many file later. This is a slow research feed for swing ideas, never an
          intraday signal.
        </p>
      </div>

      <div className="panel filterbar">
        <div className="seg" role="tablist" aria-label="Congress view">
          <button
            className={view === 'agg' ? 'active' : ''}
            onClick={() => { setView('agg'); resetPage(); }}
          >
            By stock
          </button>
          <button
            className={view === 'trades' ? 'active' : ''}
            onClick={() => { setView('trades'); resetPage(); }}
          >
            Trades
          </button>
        </div>
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
        {view === 'agg' ? (
          <div className="seg" role="tablist" aria-label="Sort aggregate">
            <button
              className={aggSort === 'amount' ? 'active' : ''}
              onClick={() => { setAggSort('amount'); resetPage(); }}
            >
              By amount
            </button>
            <button
              className={aggSort === 'officials' ? 'active' : ''}
              onClick={() => { setAggSort('officials'); resetPage(); }}
            >
              By officials
            </button>
          </div>
        ) : (
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
              <span>Search ticker / member</span>
              <input
                type="text"
                value={query}
                placeholder="e.g. NVDA or Pelosi"
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
              />
            </label>
          </>
        )}
      </div>

      {view === 'agg' ? (
        <>
          <SectionHead
            title="Most traded stocks"
            sub={`${agg.length.toLocaleString('en-US')} tickers · sorted by ${aggSort === 'amount' ? 'estimated amount' : 'officials involved'} · tap a row for its trades`}
          />
          {aggRows.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="r">Est. amount</th>
                      <th className="r">Officials</th>
                      <th className="r">Trades</th>
                      <th className="r">Buys</th>
                      <th className="r">Sells</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggRows.map((r) => (
                      <AggRowView key={r.ticker} r={r} onSelect={selectTicker} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button
                  className="btn btn-ghost"
                  disabled={aggSafePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Prev
                </button>
                <span className="muted small num">
                  Page {aggSafePage + 1} of {aggPageCount.toLocaleString('en-US')}
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={aggSafePage >= aggPageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
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
            so treat them as estimates. “Cluster” marks tickers bought by 2+
            distinct members within ~7 days.
          </p>
        </>
      ) : (
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
                      <th>Member</th>
                      <th>Ticker</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Disclosed</th>
                      <th className="hide-sm">Chamber</th>
                      <th className="hide-sm">Traded</th>
                      <th className="hide-sm">Lag</th>
                      <th className="hide-sm">Signal</th>
                      <th className="hide-sm">Filing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((t, i) => (
                      <TradeRow key={`${t.member}-${t.ticker}-${t.tx_date}-${t.disclosed_date}-${i}`} t={t} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button
                  className="btn btn-ghost"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Prev
                </button>
                <span className="muted small num">
                  Page {safePage + 1} of {pageCount.toLocaleString('en-US')}
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
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
            Amounts are disclosed as ranges only. “Cluster” marks tickers bought by
            2+ distinct members within ~7 days. Filings link to the official House
            Clerk / Senate disclosure PDFs.
          </p>
        </>
      )}
    </section>
  );
}
