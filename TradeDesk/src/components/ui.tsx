import type { ReactNode } from 'react';
import type { IndexSegment, Signal } from '../types';
import { clampScore } from '../lib/format';

/* ── ScoreBar: 0–100 horizontal bar ───────────────────────────── */

export function ScoreBar({ value, small }: { value: number | null; small?: boolean }) {
  const v = clampScore(value);
  if (v == null) return <span className="muted">—</span>;
  const tone = v >= 70 ? 'hi' : v >= 45 ? 'mid' : 'lo';
  return (
    <span className={`scorebar${small ? ' sm' : ''}`} title={`${v}/100`}>
      <span className={`scorebar-fill ${tone}`} style={{ width: `${v}%` }} />
      <span className="scorebar-num num">{v}</span>
    </span>
  );
}

/* ── Badge ───────────────────────────────────────────────────── */

type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'dim' | 'outline';

export function Badge({ tone = 'dim', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

/* ── IndexBadges: SP500 → "S&P 500" etc. ───────────────────────── */

const INDEX_LABEL: Record<IndexSegment, string> = {
  SP500: 'S&P 500',
  NASDAQ100: 'NDX 100',
  RUSSELL2000: 'R2K',
};

export function IndexBadges({ items }: { items: IndexSegment[] | null | undefined }) {
  if (!items || items.length === 0) return <span className="muted">—</span>;
  return (
    <span className="idxbadges">
      {items.map((i) => (
        <Badge key={i} tone="outline">
          {INDEX_LABEL[i] ?? i}
        </Badge>
      ))}
    </span>
  );
}

/* ── SignalBadge: bullish / bearish / neutral / mixed ──────────── */

const SIGNAL_TONE: Record<string, BadgeTone> = {
  bullish: 'green',
  bearish: 'red',
  neutral: 'dim',
  mixed: 'amber',
  long: 'green',
  short: 'red',
};

export function SignalBadge({ signal }: { signal: string | null | undefined }) {
  if (!signal) return <span className="muted">—</span>;
  const tone = SIGNAL_TONE[signal] ?? 'dim';
  const label = signal.charAt(0).toUpperCase() + signal.slice(1);
  return <Badge tone={tone}>{label}</Badge>;
}

/* ── TrendArrow: up / down / flat ──────────────────────────────── */

export function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' | null | undefined }) {
  if (!trend) return <span className="muted">—</span>;
  if (trend === 'up') return <span className="trend up" title="Up trend">▲</span>;
  if (trend === 'down') return <span className="trend down" title="Down trend">▼</span>;
  return <span className="trend flat" title="Flat">→</span>;
}

/* ── ResultBadge: beat / in-line / miss ────────────────────────── */

export function ResultBadge({ result }: { result: 'beat' | 'in-line' | 'miss' | null | undefined }) {
  if (!result) return <span className="muted">—</span>;
  const tone: BadgeTone = result === 'beat' ? 'green' : result === 'miss' ? 'red' : 'dim';
  return <Badge tone={tone}>{result}</Badge>;
}

/* ── Chip: small label pill for attribute lists, key levels ────── */

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>;
}

/* ── TradingView chart link ────────────────────────────────────── */

const TV_SYMBOL_MAP: Record<string, string> = {
  'ES=F': 'CME:ES1!',
  'NQ=F': 'CME:NQ1!',
  'ES': 'CME:ES1!',
  'NQ': 'CME:NQ1!',
  'YM=F': 'CBOT:YM1!',
  'RTY=F': 'CME:RTY1!',
  '^SPX': 'SP:SPX',
  '^IXIC': 'NASDAQ:IXIC',
  '^DJI': 'DJI',
  '^VIX': 'CBOE:VIX',
  '^RUT': 'TVC:RUT',
};

export function tvUrl(ticker: string): string {
  const t = (ticker || '').trim().toUpperCase();
  const sym = TV_SYMBOL_MAP[t] ?? t;
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`;
}

/** Ticker rendered as a link that opens its TradingView chart in a new tab. */
export function TvLink({ ticker, className }: { ticker: string; className?: string }) {
  return (
    <a
      className={`tv-link${className ? ` ${className}` : ''}`}
      href={tvUrl(ticker)}
      target="_blank"
      rel="noreferrer"
      title={`Open ${ticker} chart in TradingView`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="ticker">{ticker}</span>
      <span className="tv-pill">
        Chart <span aria-hidden="true">↗</span>
      </span>
    </a>
  );
}

/* ── Stat: label + value pair ──────────────────────────────────── */

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: 'up' | 'down' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value num${accent ? ` ${accent}` : ''}`}>{value}</div>
    </div>
  );
}

/* ── Loading / error panels ───────────────────────────────────── */

export function LoadingPanel({ what = 'data' }: { what?: string }) {
  return (
    <div className="panel">
      <p className="muted">Loading {what}…</p>
    </div>
  );
}

export function ErrorPanel({ file, error }: { file: string; error: string }) {
  return (
    <div className="panel">
      <div className="empty-title">Couldn't load data</div>
      <p className="muted">
        <code>{file}</code> failed to load ({error}). The scheduled pipeline may
        not have written it yet — check back after the next run.
      </p>
    </div>
  );
}

/* ── Section heading ───────────────────────────────────────────── */

export function SectionHead({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      {sub ? <span className="muted small">{sub}</span> : null}
    </div>
  );
}

/** Pass/fail pill. */
export function PassFail({ pass, label }: { pass: boolean; label: string }) {
  return <Badge tone={pass ? 'green' : 'red'}>{pass ? `✓ ${label}` : `✗ ${label}`}</Badge>;
}

export type { Signal };
