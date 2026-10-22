'use client';

import * as React from 'react';

import { formatErrorMessage } from '@/lib/format';

/**
 * Small helper hook for loading a resource from the API.
 *
 * The loader is re-run whenever `deps` change; `reload()` re-runs it on demand.
 */
export function useApiResource<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
} {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const loaderRef = React.useRef(loader);
  loaderRef.current = loader;

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      setData(result);
    } catch (cause) {
      setError(formatErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, deps);

  return { data, loading, error, reload, setData };
}
