import { useState } from 'react';
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

/** Plain-English legend: what each metric is and how to read it. */
const LEGEND: [string, string][] = [
  ['P/E (TTM)', 'Price ÷ the last 12 months of earnings. Lower = cheaper for the profit you get. Under ~15 is cheap, over ~30 is pricey.'],
  ['Fwd P/E', 'Same as P/E, but using next year\u2019s expected earnings instead of last year\u2019s.'],
  ['PEG', 'P/E ÷ expected earnings growth. Under 1 = cheap for how fast it is growing; over 2 = pricey for its growth.'],
  ['P/B', 'Price ÷ book value (what the company owns minus what it owes). Under 1 = selling for less than its net assets.'],
  ['P/S', 'Price ÷ yearly sales. Lower = cheaper for the sales the company brings in.'],
  ['ROE', 'Profit ÷ shareholder equity. How hard the company works its owners\u2019 money. Over 15% is strong.'],
  ['Profit margin', 'Profit kept from each $1 of sales. Higher = the business keeps more of what it earns.'],
  ['Debt/Equity', 'Debt ÷ equity. Under 1 = light debt; over 2 = heavily indebted.'],
  ['Rev growth YoY', 'Sales vs a year ago. Positive = the business is growing.'],
  ['Rev 3Y CAGR', 'Average yearly sales growth over the last 3 years.'],
  ['EPS growth (est)', 'How much analysts expect earnings per share to grow. Positive = more profit ahead.'],
  ['Beta', 'How much the stock swings vs the market. 1 = moves with the market; 2 = twice as jumpy; 0.5 = half as jumpy.'],
  ['Div yield', 'Yearly dividend ÷ price. What the stock pays you each year just for holding it.'],
  ['Mkt cap', 'Total value of all shares. Bigger = bigger company.'],
  ['Graham number', 'A deep-value floor from earnings × book value. Price below it = potentially cheap.'],
  ['Peer fair value', 'What the stock would be worth if it traded at its sector\u2019s typical P/E.'],
];

const METRIC_KEYS = [
  'pe_trailing', 'pe_forward', 'peg', 'pb', 'ps', 'roe', 'profit_margin',
  'debt_equity', 'revenue_growth_yoy', 'revenue_cagr_3y', 'eps_growth_expected',
  'beta', 'div_yield', 'market_cap',
];

/**
 * Compact fundamentals panel for a ticker, colored vs sector peers:
 * green = better than peers, red = worse, uncolored = in line / neutral metric.
 * Renders nothing when no data. Drop inside any expanded/detail view:
 * <Fundamentals ticker={t} />
 */
export function Fundamentals({ ticker }: { ticker: string }) {
  const { get, peerStats } = useFundamentals();
  const [showLegend, setShowLegend] = useState(false);
  const f: FundamentalMetrics | null = get(ticker);
  if (!f) return null;
  // ETFs and indices carry almost no company metrics (only P/E + div yield)
  // — showing a grid of dashes helps nobody, so hide the whole block.
  const presentCount = METRIC_KEYS.filter((k) =>
    isNum((f as unknown as Record<string, unknown>)[k]),
  ).length;
  if (presentCount < 4) return null;
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
      <button className="link-btn fund-legend-toggle" onClick={() => setShowLegend((s) => !s)}>
        {showLegend ? 'Hide what these mean ▾' : 'What do these mean? ▸'}
      </button>
      {showLegend && (
        <div className="fund-legend">
          {LEGEND.map(([label, text]) => (
            <div className="fund-legend-row" key={label}>
              <b>{label}</b>
              <span>{text}</span>
            </div>
          ))}
          <div className="muted small">
            Green = better than its sector peers, red = worse, plain = in line.
          </div>
        </div>
      )}
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
