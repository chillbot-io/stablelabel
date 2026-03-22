import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import StatusBadge from '@/components/StatusBadge';
import type { Policy } from '@/lib/types';

export default function PoliciesPage() {
  const { user } = useAuth();
  const { tenants, selected, setSelected } = useTenants();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadPolicies = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const data = await api.get<Policy[]>(`/tenants/${selected.id}/policies`);
      setPolicies(data);
    } catch { setPolicies([]); }
    setLoading(false);
  }, [selected]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const togglePolicy = async (policy: Policy) => {
    if (!selected) return;
    await api.patch(`/tenants/${selected.id}/policies/${policy.id}`, { is_enabled: !policy.is_enabled });
    loadPolicies();
  };

  const deletePolicy = async (policy: Policy) => {
    if (!selected || policy.is_builtin) return;
    await api.delete(`/tenants/${selected.id}/policies/${policy.id}`);
    loadPolicies();
  };

  const createPolicy = async (name: string, targetLabelId: string, priority: number) => {
    if (!selected) return;
    await api.post(`/tenants/${selected.id}/policies`, {
      name, target_label_id: targetLabelId, priority, rules: { conditions: [], match_mode: 'any' },
    });
    setShowCreate(false);
    loadPolicies();
  };

  return (
    <div className="p-6">
      <PageHeader title="Policies" description="Classification-to-label mapping rules">
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
        {user?.role !== 'Viewer' && (
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm rounded-md transition-colors">
            New Policy
          </button>
        )}
      </PageHeader>

      {showCreate && <CreatePolicyDialog onSubmit={createPolicy} onClose={() => setShowCreate(false)} />}

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <div className="space-y-2">
          {policies.length === 0 && <p className="text-center py-12 text-zinc-500 text-sm">No policies configured</p>}
          {policies.map((p) => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.is_builtin && <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">built-in</span>}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Priority: {p.priority} &middot; Target: {p.target_label_id}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.is_enabled ? 'active' : 'pending'} />
                <button onClick={() => togglePolicy(p)} className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                  {p.is_enabled ? 'Disable' : 'Enable'}
                </button>
                {!p.is_builtin && user?.role !== 'Viewer' && (
                  <button onClick={() => deletePolicy(p)} className="px-2 py-1 text-xs rounded bg-red-900/50 hover:bg-red-900 text-red-400">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePolicyDialog({ onSubmit, onClose }: { onSubmit: (name: string, labelId: string, priority: number) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [labelId, setLabelId] = useState('');
  const [priority, setPriority] = useState(0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Create Policy</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Policy Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Target Label ID</label>
            <input value={labelId} onChange={(e) => setLabelId(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Priority</label>
            <input type="number" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 0)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button onClick={() => name && labelId && onSubmit(name, labelId, priority)} disabled={!name || !labelId} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
