import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

/**
 * Senior pattern: data-fetching hook with loading/error + cancel-on-unmount.
 * Replaces copy-pasted `load().catch(showToast)` in every page.
 */
export function useApiList(fetcher, { pollMs = 0, onError } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcher(api);
      if (!alive.current) return result;
      setData(result);
      setError('');
      return result;
    } catch (err) {
      if (!alive.current) return null;
      setError(err.message || 'Failed to load');
      onError?.(err);
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [fetcher, onError]);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    refresh();
    let timer = null;
    if (pollMs > 0) timer = setInterval(() => { refresh(); }, pollMs);
    return () => { alive.current = false; if (timer) clearInterval(timer); };
  }, [refresh, pollMs]);

  return { data, loading, error, refresh };
}

/**
 * Donor dashboard data: donations + matches in one call-site.
 */
export function useDonorDashboard(donorKey) {
  const fetcher = useCallback(async (client) => {
    const [donations, matches] = await Promise.all([client.get('/donations'), client.get('/matches')]);
    return { donations, matches };
  }, []);
  const { data, loading, error, refresh } = useApiList(fetcher);
  const donations = data?.donations ?? [];
  const matches = data?.matches ?? [];
  const myDonations = donorKey
    ? donations.filter((d) => d.donor_id === donorKey.id || d.donor_name === donorKey.name)
    : donations;
  return { donations, myDonations, matches, loading, error, refresh };
}
