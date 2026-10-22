import { useMemo } from 'react';
import { useJsonData } from './useJsonData';
import type { FundamentalMetrics, FundamentalsFile } from '../types';

/**
 * Loads fundamentals.json once and returns a ticker lookup.
 * Missing file or missing ticker → get() returns null (renders nothing).
 */
export function useFundamentals() {
  const { data } = useJsonData<FundamentalsFile>('fundamentals.json');
  const map = useMemo(() => data?.fundamentals ?? {}, [data]);
  const get = (ticker: string): FundamentalMetrics | null => {
    if (!ticker) return null;
    return map[ticker.toUpperCase()] ?? null;
  };
  return { get, asOf: data?.as_of ?? null };
}
