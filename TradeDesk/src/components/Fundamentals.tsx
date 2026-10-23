import type { FundamentalMetrics } from '../types';
import { useFundamentals, peerTone } from '../lib/useFundamentals';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function fmtPct(v: number | null): string {
  return isNum(v) ? `${(v * 100).toFixed(1)}%` : '—';
}

function fmtNum(v: number | null, digits = 2): string {
  return isNum(v) ? v.toFixed(digits) : '—';
}

function fmtCap(v: number | null): string {
  if (!isNum(v)) return '—';
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
    ['revenue_growth_yoy', 'Rev growth YoY', fmtPct(f.revenue_growth_yoy)],
    ['revenue_cagr_3y', 'Rev 3Y CAGR', fmtPct(f.revenue_cagr_3y)],
    ['eps_growth_expected', 'EPS growth (est)', fmtPct(f.eps_growth_expected)],
    ['beta', 'Beta', fmtNum(f.beta)],
    ['div_yield', 'Div yield', fmtPct(f.div_yield)],
    ['market_cap', 'Mkt cap', fmtCap(f.market_cap)],
  ];

  const upsideTone = (v: number | null) =>
    !isNum(v) ? '' : v > 5 ? 'fund-good' : v < -5 ? 'fund-bad' : '';

  const fmtMoney2 = (v: number | null) => (isNum(v) ? `$${v.toFixed(2)}` : '—');
  const fmtUpside = (v: number | null) =>
    isNum(v) ? `${v > 0 ? '+' : ''}${v}%` : '—';

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
      {(isNum(f.graham_number) || isNum(f.peer_fair_value)) && (
        <div className="valuation-block">
          <span className="detail-label">Intrinsic value vs price</span>
          <div className="valuation-rows">
            {isNum(f.graham_number) && (
              <div className="valuation-row">
                <span>Graham number (deep-value floor)</span>
                <span className="num">
                  {fmtMoney2(f.graham_number)}{' '}
                  <b className={upsideTone(f.graham_upside_pct)}>
                    {fmtUpside(f.graham_upside_pct)}
                  </b>
                </span>
              </div>
            )}
            {isNum(f.peer_fair_value) && (
              <div className="valuation-row">
                <span>
                  Peer fair value
                  {isNum(f.sector_median_fwd_pe) ? (
                    <span className="muted"> · sector fwd P/E {f.sector_median_fwd_pe.toFixed(1)}×</span>
                  ) : null}
                </span>
                <span className="num">
                  {fmtMoney2(f.peer_fair_value)}{' '}
                  <b className={upsideTone(f.peer_upside_pct)}>
                    {fmtUpside(f.peer_upside_pct)}
                  </b>
                </span>
              </div>
            )}
          </div>
          <div className="muted small">
            Graham = √(22.5 × EPS × book value), a conservative floor. Peer fair value =
            forward EPS × sector median forward P/E. Estimates, not targets.
          </div>
        </div>
      )}
    </div>
  );
}
