import type { FundamentalMetrics } from '../types';
import { useFundamentals, peerTone } from '../lib/useFundamentals';

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

const TONE_CLASS: Record<string, string> = {
  good: 'fund-good',
  bad: 'fund-bad',
  neutral: '',
};

/**
 * Compact fundamentals panel for a ticker, colored vs sector peers:
 * green = better than peers, red = worse, uncolored = in line / neutral metric.
 * Renders nothing when no data. Drop inside any expanded/detail view:
 * <Fundamentals ticker={t} />
 */
export function Fundamentals({ ticker }: { ticker: string }) {
  const { get, peerStats } = useFundamentals();
  const f: FundamentalMetrics | null = get(ticker);
  if (!f) return null;
  const stats = peerStats(ticker);

  const rows: [string, string, string][] = [
    ['pe_trailing', 'P/E (TTM)', fmtNum(f.pe_trailing)],
    ['pe_forward', 'Fwd P/E', fmtNum(f.pe_forward)],
    ['peg', 'PEG', fmtNum(f.peg)],
    ['pb', 'P/B', fmtNum(f.pb)],
    ['ps', 'P/S', fmtNum(f.ps)],
    ['roe', 'ROE', fmtPct(f.roe)],
    ['profit_margin', 'Profit margin', fmtPct(f.profit_margin)],
    ['debt_equity', 'Debt/Equity', fmtNum(f.debt_equity)],
    ['beta', 'Beta', fmtNum(f.beta)],
    ['div_yield', 'Div yield', fmtPct(f.div_yield)],
    ['market_cap', 'Mkt cap', fmtCap(f.market_cap)],
  ];

  return (
    <div className="fundamentals">
      <span className="detail-label">
        Fundamentals
        {stats && stats.peerCount > 0 ? (
          <span className="muted"> · vs {stats.peerCount} {f.sector} peers</span>
        ) : null}
      </span>
      <div className="fundamentals-name">
        {f.name}
        {f.sector ? <span className="muted"> · {f.sector}</span> : null}
        {f.subsector ? <span className="muted"> · {f.subsector}</span> : null}
      </div>
      <div className="fundamentals-grid">
        {rows.map(([key, label, value]) => {
          const rawVal = (f as unknown as Record<string, unknown>)[key];
          const tone = peerTone(
            key,
            typeof rawVal === 'number' ? rawVal : null,
            stats
          );
          return (
            <div className="fundamentals-cell" key={key}>
              <span className="fundamentals-label">{label}</span>
              <span className={`fundamentals-value num ${TONE_CLASS[tone]}`}>{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
