import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import DataTable from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import type { Column } from '@/components/DataTable';
import type { AuditEvent, AuditPage as AuditPageType } from '@/lib/types';

const EVENT_COLORS: Record<string, string> = {
  'file.labelled': 'text-green-400',
  'file.label_failed': 'text-red-400',
  'file.silent_failure': 'text-orange-400',
  'file.rolled_back': 'text-yellow-400',
  'job.completed': 'text-blue-400',
  'tenant.connected': 'text-green-400',
  'access.granted': 'text-blue-400',
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: '50' });
    if (typeFilter) params.set('event_type', typeFilter);
    try {
      const data = await api.get<AuditPageType>(`/security/audit?${params}`);
      setEvents(data.items);
      setTotal(data.total);
    } catch { setEvents([]); }
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const columns: Column<AuditEvent>[] = [
    {
      key: 'time', header: 'Time', render: (e) => (
        <span className="text-xs text-zinc-500">{new Date(e.created_at).toLocaleString()}</span>
      ),
    },
    {
      key: 'type', header: 'Event', render: (e) => (
        <span className={`text-xs font-mono ${EVENT_COLORS[e.event_type] ?? 'text-zinc-400'}`}>
          {e.event_type}
        </span>
      ),
    },
    {
      key: 'actor', header: 'Actor', render: (e) => (
        <span className="text-xs text-zinc-400">{e.actor_email ?? 'system'}</span>
      ),
    },
    {
      key: 'file', header: 'Target', render: (e) => (
        <span className="text-xs text-zinc-400 truncate max-w-[200px] block">{e.target_file ?? e.target_site ?? '--'}</span>
      ),
    },
    {
      key: 'label', header: 'Label', render: (e) => (
        <span className="text-xs text-zinc-500">{e.label_applied ?? '--'}</span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Audit Log" description="Full activity log across all tenants">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="">All Events</option>
          <option value="file.labelled">file.labelled</option>
          <option value="file.label_failed">file.label_failed</option>
          <option value="file.rolled_back">file.rolled_back</option>
          <option value="job.completed">job.completed</option>
          <option value="tenant.connected">tenant.connected</option>
          <option value="access.granted">access.granted</option>
        </select>
      </PageHeader>

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <DataTable columns={columns} data={events} keyFn={(e) => e.id} emptyMessage="No audit events" />
          </div>
          {total > 50 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">Prev</button>
              <span className="text-sm text-zinc-400 py-1">Page {page} of {Math.ceil(total / 50)}</span>
              <button disabled={page * 50 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
