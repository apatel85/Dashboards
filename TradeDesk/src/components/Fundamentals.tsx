import type { FundamentalMetrics } from '../types';
import { useFundamentals } from '../lib/useFundamentals';

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits);
}

function fmtCap(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

/**
 * Compact fundamentals panel for a ticker. Renders nothing when no data.
 * Drop inside any expanded/detail view: <Fundamentals ticker={t} />
 */
export function Fundamentals({ ticker }: { ticker: string }) {
  const { get } = useFundamentals();
  const f: FundamentalMetrics | null = get(ticker);
  if (!f) return null;

  const rows: [string, string][] = [
    ['P/E (TTM)', fmtNum(f.pe_trailing)],
    ['Fwd P/E', fmtNum(f.pe_forward)],
    ['PEG', fmtNum(f.peg)],
    ['P/B', fmtNum(f.pb)],
    ['P/S', fmtNum(f.ps)],
    ['ROE', fmtPct(f.roe)],
    ['Profit margin', fmtPct(f.profit_margin)],
    ['Beta', fmtNum(f.beta)],
    ['Div yield', fmtPct(f.div_yield)],
    ['Mkt cap', fmtCap(f.market_cap)],
  ];

  return (
    <div className="fundamentals">
      <span className="detail-label">Fundamentals</span>
      <div className="fundamentals-name">
        {f.name}
        {f.sector ? <span className="muted"> · {f.sector}</span> : null}
        {f.subsector ? <span className="muted"> · {f.subsector}</span> : null}
      </div>
      <div className="fundamentals-grid">
        {rows.map(([label, value]) => (
          <div className="fundamentals-cell" key={label}>
            <span className="fundamentals-label">{label}</span>
            <span className="fundamentals-value num">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
