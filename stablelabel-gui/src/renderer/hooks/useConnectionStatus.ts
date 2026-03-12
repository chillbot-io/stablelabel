import { useState, useEffect, useCallback } from 'react';
import type { ConnectionStatus } from '../lib/types';

/**
 * Polls connection status every 30 seconds.
 */
export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await window.stablelabel.invoke('Get-SLConnectionStatus');
      if (result.success && result.data) {
        setStatus(result.data as ConnectionStatus);
      }
    } catch {
      // Connection status unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { status, loading, refresh };
}
