import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import DataTable from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import type { SensitivityLabel } from '@/lib/types';
import { Shield, ShieldAlert } from 'lucide-react';

export default function LabelsPage() {
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [labels, setLabels] = useState<SensitivityLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'appliable'>('all');

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    const query = filter === 'appliable' ? '?appliable_only=true' : '';
    api.get<SensitivityLabel[]>(`/tenants/${selected.id}/labels${query}`)
      .then((data) => { if (!controller.signal.aborted) setLabels(data); })
      .catch((err) => { if (!controller.signal.aborted) { setLabels([]); showError(err.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected, filter, showError]);

  const refresh = () => {
    if (!selected) return;
    setLoading(true);
    api.get<SensitivityLabel[]>(`/tenants/${selected.id}/labels?force_refresh=true`)
      .then(setLabels)
      .catch((err) => showError(err.message))
      .finally(() => setLoading(false));
  };

  const columns: Column<SensitivityLabel>[] = [
    {
      key: 'name', header: 'Label', render: (l) => (
        <div className="flex items-center gap-2">
          {l.color && <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />}
          <div>
            <div className="font-medium">{l.display_name || l.name}</div>
            {l.is_parent && <span className="text-xs text-zinc-500">parent (not appliable)</span>}
          </div>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', render: (l) => <span className="text-zinc-400">{l.priority}</span> },
    {
      key: 'protection', header: 'Protection', render: (l) => (
        l.has_protection
          ? <span className="flex items-center gap-1 text-yellow-400 text-xs"><ShieldAlert size={14} /> Encryption</span>
          : <span className="flex items-center gap-1 text-zinc-500 text-xs"><Shield size={14} /> None</span>
      ),
    },
    {
      key: 'scope', header: 'Scope', render: (l) => (
        <span className="text-xs text-zinc-500">{l.applicable_to.join(', ') || '--'}</span>
      ),
    },
    {
      key: 'active', header: 'Active', render: (l) => (
        <span className={l.is_active ? 'text-green-400' : 'text-zinc-600'}>{l.is_active ? 'Yes' : 'No'}</span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Labels" description="Sensitivity labels from Microsoft Purview">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'appliable')}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="all">All Labels</option>
          <option value="appliable">Appliable Only</option>
        </select>
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
        <button onClick={refresh} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 transition-colors">
          Refresh
        </button>
      </PageHeader>

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <DataTable columns={columns} data={labels} keyFn={(l) => l.id} emptyMessage="No labels found" />
        </div>
      )}
    </div>
  );
}
