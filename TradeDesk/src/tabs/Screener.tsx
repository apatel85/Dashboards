import { useMemo, useState } from 'react';
import { useJsonData } from '../lib/useJsonData';
import { useFundamentals, peerTone } from '../lib/useFundamentals';
import { Fundamentals } from '../components/Fundamentals';
import { TvLink, LoadingPanel, ErrorPanel, SectionHead } from '../components/ui';
import type { FundamentalsFile, FundamentalMetrics } from '../types';

type SortKey =
  | 'ticker' | 'price' | 'market_cap' | 'pe_trailing' | 'pe_forward' | 'peg'
  | 'roe' | 'revenue_growth_yoy' | 'peer_upside_pct' | 'graham_upside_pct';

const COLUMNS: { key: SortKey; label: string; fmt: (f: FundamentalMetrics & { ticker: string }) => string }[] = [
  { key: 'ticker', label: 'Ticker', fmt: () => '' },
  { key: 'price', label: 'Price', fmt: (f) => (f.price != null ? `$${f.price.toFixed(2)}` : '—') },
  {
    key: 'market_cap', label: 'Mkt Cap',
    fmt: (f) => (f.market_cap == null ? '—' : f.market_cap >= 1e12 ? `$${(f.market_cap / 1e12).toFixed(2)}T` : f.market_cap >= 1e9 ? `$${(f.market_cap / 1e9).toFixed(1)}B` : `$${(f.market_cap / 1e6).toFixed(0)}M`),
  },
  { key: 'pe_trailing', label: 'P/E', fmt: (f) => (f.pe_trailing != null ? f.pe_trailing.toFixed(1) : '—') },
  { key: 'pe_forward', label: 'Fwd P/E', fmt: (f) => (f.pe_forward != null ? f.pe_forward.toFixed(1) : '—') },
  { key: 'peg', label: 'PEG', fmt: (f) => (f.peg != null ? f.peg.toFixed(2) : '—') },
  { key: 'roe', label: 'ROE', fmt: (f) => (f.roe != null ? `${(f.roe * 100).toFixed(1)}%` : '—') },
  { key: 'revenue_growth_yoy', label: 'Rev Gr', fmt: (f) => (f.revenue_growth_yoy != null ? `${(f.revenue_growth_yoy * 100).toFixed(1)}%` : '—') },
  { key: 'peer_upside_pct', label: 'Peer ↑', fmt: (f) => (f.peer_upside_pct != null ? `${f.peer_upside_pct > 0 ? '+' : ''}${f.peer_upside_pct}%` : '—') },
  { key: 'graham_upside_pct', label: 'Graham ↑', fmt: (f) => (f.graham_upside_pct != null ? `${f.graham_upside_pct > 0 ? '+' : ''}${f.graham_upside_pct}%` : '—') },
];

const PRESETS: { id: string; label: string; test: (f: FundamentalMetrics) => boolean }[] = [
  { id: 'value', label: 'Value: P/E < 15', test: (f) => (f.pe_trailing ?? 999) < 15 },
  { id: 'growth', label: 'Growth: Rev +15%', test: (f) => (f.revenue_growth_yoy ?? -1) > 0.15 },
  { id: 'quality', label: 'Quality: ROE > 15%', test: (f) => (f.roe ?? -1) > 0.15 },
  { id: 'cheap', label: 'PEG < 1', test: (f) => (f.peg ?? 999) < 1 },
  { id: 'undervalued', label: 'Peer upside +10%', test: (f) => (f.peer_upside_pct ?? -999) > 10 },
];

function cellTone(key: SortKey, f: FundamentalMetrics, peerStats: (t: string) => ReturnType<ReturnType<typeof useFundamentals>['peerStats']>): string {
  if (key === 'peer_upside_pct' || key === 'graham_upside_pct') {
    const v = (f as unknown as Record<string, number | null>)[key];
    if (v == null) return '';
    return v > 5 ? 'fund-good' : v < -5 ? 'fund-bad' : '';
  }
  return '';
}

export default function ScreenerTab() {
  const { data, loading, error } = useJsonData<FundamentalsFile>('fundamentals.json');
  const { peerStats } = useFundamentals();
  const [sortKey, setSortKey] = useState<SortKey>('peer_upside_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('all');
  const [presets, setPresets] = useState<Set<string>>(new Set());
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data?.fundamentals) return [];
    return Object.entries(data.fundamentals).map(([ticker, f]) => ({ ticker, ...f }));
  }, [data]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.sector) s.add(r.sector);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter((r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    if (sector !== 'all') out = out.filter((r) => r.sector === sector);
    for (const pid of presets) {
      const p = PRESETS.find((x) => x.id === pid);
      if (p) out = out.filter((r) => p.test(r));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return dir * (av - bv);
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * String(av).localeCompare(String(bv));
    });
    return out;
  }, [rows, query, sector, presets, sortKey, sortDir]);

  const togglePreset = (id: string) => {
    setPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'ticker' ? 'asc' : 'desc'); }
  };

  if (loading) return <LoadingPanel what="fundamentals screener" />;
  if (error) return <ErrorPanel file="fundamentals.json" error={error} />;
  if (!rows.length) {
    return (
      <div className="panel">
        <div className="empty-title">No fundamentals yet</div>
        <p className="muted">The pipeline builds fundamentals.json on its morning run.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <SectionHead
        title="🔍 Fundamentals screener"
        sub={`${filtered.length} of ${rows.length} tickers · tap a header to sort · tap a row for full fundamentals`}
      />
      <div className="screener-filters">
        <input
          className="screener-search"
          placeholder="Search ticker or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="screener-select">
          <option value="all">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="chip-row screener-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip-btn${presets.has(p.id) ? ' on' : ''}`}
            onClick={() => togglePreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        {presets.size > 0 && (
          <button className="link-btn" onClick={() => setPresets(new Set())}>Clear</button>
        )}
      </div>
      <div className="table-wrap">
        <table className="data-table screener-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className="sortable">
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <>
                <tr
                  key={r.ticker}
                  onClick={() => setOpenTicker((t) => (t === r.ticker ? null : r.ticker))}
                  className="clickable"
                >
                  <td data-th="Ticker"><TvLink ticker={r.ticker} /></td>
                  {COLUMNS.slice(1).map((c) => (
                    <td key={c.key} data-th={c.label} className={`num ${cellTone(c.key, r, peerStats)}`}>
                      {c.fmt(r)}
                    </td>
                  ))}
                </tr>
                {openTicker === r.ticker && (
                  <tr className="detail-row" key={`${r.ticker}-detail`}>
                    <td colSpan={COLUMNS.length}>
                      <Fundamentals ticker={r.ticker} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small footnote-line">
        Green/red on Peer ↑ and Graham ↑ = upside vs estimate. Fundamentals as of{' '}
        {data.as_of ? new Date(data.as_of).toLocaleDateString() : '—'} · {data.source}
      </p>
    </div>
  );
}
