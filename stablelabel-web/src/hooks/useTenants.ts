/** Hook for loading and selecting customer tenants. */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CustomerTenant } from '@/lib/types';

export function useTenants() {
  const [tenants, setTenants] = useState<CustomerTenant[]>([]);
  const [selected, setSelected] = useState<CustomerTenant | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CustomerTenant[]>('/security/tenants');
      setTenants(data);
      if (!selected && data.length > 0) {
        setSelected(data.find((t) => t.consent_status === 'active') ?? data[0]);
      }
    } catch {
      // silently fail — user may not have access
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { refresh(); }, []);

  return { tenants, selected, setSelected, loading, refresh };
}
