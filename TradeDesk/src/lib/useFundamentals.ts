import { useMemo } from 'react';
import { useJsonData } from './useJsonData';
import type { FundamentalMetrics, FundamentalsFile } from '../types';

/** Metric key -> true if higher is better, false if lower is better, null if neutral. */
export const METRIC_DIRECTION: Record<string, boolean | null> = {
  pe_trailing: false,
  pe_forward: false,
  peg: false,
  pb: false,
  ps: false,
  profit_margin: true,
  roe: true,
  debt_equity: false,
  beta: null,
  div_yield: null,
  market_cap: null,
  eps_trailing: null,
  eps_forward: null,
};

export interface PeerStats {
  /** sector median per metric key */
  medians: Record<string, number | null>;
  /** number of peers in the sector */
  peerCount: number;
}

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Loads fundamentals.json once. Returns:
 * - get(ticker): the ticker's metrics or null
 * - peerStats(ticker): sector medians + peer count for coloring vs peers
 */
export function useFundamentals() {
  const { data } = useJsonData<FundamentalsFile>('fundamentals.json');
  const map = useMemo(() => data?.fundamentals ?? {}, [data]);

  const get = (ticker: string): FundamentalMetrics | null => {
    if (!ticker) return null;
    return map[ticker.toUpperCase()] ?? null;
  };

  const peerStats = (ticker: string): PeerStats | null => {
    const f = get(ticker);
    if (!f?.sector) return null;
    const peers = Object.values(map).filter(
      (p) => p.sector === f.sector && p.ticker !== ticker.toUpperCase()
    );
    // include self so the median is stable with small peer sets
    const all = [...peers, f];
    const medians: Record<string, number | null> = {};
    for (const key of Object.keys(METRIC_DIRECTION)) {
      const vals = all
        .map((p) => (p as unknown as Record<string, unknown>)[key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      medians[key] = median(vals);
    }
    return { medians, peerCount: peers.length };
  };

  return { get, peerStats, asOf: data?.as_of ?? null };
}

/**
 * Compare a metric value against its sector median.
 * Returns 'good' | 'bad' | 'neutral':
 * - good: in the better 40% vs peers (with 10% neutral band around median)
 * - bad: in the worse 40% vs peers
 * - neutral: within 10% of median, metric is neutral, or no peer data
 */
export function peerTone(
  key: string,
  value: number | null,
  stats: PeerStats | null
): 'good' | 'bad' | 'neutral' {
  const dir = METRIC_DIRECTION[key];
  if (dir == null || value == null || !stats) return 'neutral';
  const med = stats.medians[key];
  if (med == null || med === 0) return 'neutral';
  // 10% band around the median reads as neutral
  if (value >= med * 0.9 && value <= med * 1.1) return 'neutral';
  // dir=true (higher better): well above median = good; dir=false: well below = good
  if (dir) return value > med ? 'good' : 'bad';
  return value < med ? 'good' : 'bad';
}
