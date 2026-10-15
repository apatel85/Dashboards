import { useEffect, useState } from 'react';

export interface JsonDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a static JSON file from `public/data/` (served relative to the
 * Vite base path). Missing/placeholder files resolve to `null` so tabs can
 * render their empty-state panels instead of crashing.
 */
export function useJsonData<T>(file: string): JsonDataState<T> {
  const [state, setState] = useState<JsonDataState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const url = `${import.meta.env.BASE_URL}data/${file}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setState({ data: json as T, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : 'fetch failed',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return state;
}
