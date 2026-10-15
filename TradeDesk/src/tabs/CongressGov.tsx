import { useMemo, useState } from 'react';
import {
  Badge,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { fmtDate, fmtInt } from '../lib/format';
import type { CongressTrade } from '../types';

const PAGE_SIZE = 50;

type ChamberFilter = 'all' | 'House' | 'Senate';
type TypeFilter = 'all' | 'buy' | 'sell' | 'exchange';

const TYPE_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  buy: 'green',
  sell: 'red',
  exchange: 'amber',
};

function TradeRow({ t }: { t: CongressTrade }) {
  const late = t.lag_days > 45;
  return (
    <tr>
      <td>
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
      <td>
        <Badge tone={t.chamber === 'House' ? 'blue' : 'dim'}>{t.chamber}</Badge>
      </td>
      <td>
        <span className="ticker">{t.ticker}</span>
        <span className="subname" title={t.asset_name}>
          {t.asset_name.length > 42 ? t.asset_name.slice(0, 42) + '…' : t.asset_name}
        </span>
      </td>
      <td>
        <Badge tone={TYPE_TONE[t.trade_type] ?? 'dim'}>{t.trade_type}</Badge>
      </td>
      <td className="num">{t.amount_range}</td>
      <td className="num">{fmtDate(t.tx_date)}</td>
      <td className="num">{fmtDate(t.disclosed_date)}</td>
      <td className={`num${late ? ' lateflag' : ''}`} title={late ? 'Filed after the 45-day deadline' : 'Disclosure lag'}>
        {fmtInt(t.lag_days)}d
      </td>
      <td>{t.cluster ? <Badge tone="amber">Cluster</Badge> : <span className="muted">—</span>}</td>
      <td>
        {t.doc_url ? (
          <a className="doclink" href={t.doc_url} target="_blank" rel="noreferrer">
            PDF
          </a>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}

export default function CongressGovTab() {
  const { data, loading, error } = useJsonData<CongressTrade[]>('congress.json');
  const [chamber, setChamber] = useState<ChamberFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [clusterOnly, setClusterOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

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

  const resetPage = () => setPage(0);

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
      </div>

      <SectionHead
        title="Disclosed trades"
        sub={`${filtered.length.toLocaleString('en-US')} matching · sorted by disclosure date`}
      />
      {pageRows.length > 0 ? (
        <>
          <div className="table-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Chamber</th>
                  <th>Ticker</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Traded</th>
                  <th>Disclosed</th>
                  <th>Lag</th>
                  <th>Signal</th>
                  <th>Filing</th>
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
    </section>
  );
}
