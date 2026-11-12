import { useEffect, useState } from 'react';
import { DATA_BASE } from './dataBase';

export interface JsonDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface Loaded<T> {
  /** Which file this result belongs to. */
  file: string | null;
  data: T | null;
  error: string | null;
}

/**
 * Fetches a static JSON file from the data folder (see dataBase.ts).
 * Missing/placeholder files resolve to `null` so views can render their
 * empty-state panels instead of crashing.
 *
 * Pass `null` to skip the fetch — used to hold back large files (the 15 MB
 * executive.json) until the view that needs them is actually opened.
 */
export function useJsonData<T>(file: string | null): JsonDataState<T> {
  const [state, setState] = useState<Loaded<T>>({ file: null, data: null, error: null });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    // no-cache: the pipeline rewrites these files daily; always revalidate.
    fetch(`${DATA_BASE}${file}`, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setState({ file, data: json as T, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ file, data: null, error: err instanceof Error ? err.message : 'fetch failed' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return { data: null, loading: false, error: null };
  // Until the result for THIS file arrives, report loading (never a stale file's data).
  if (state.file !== file) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}
