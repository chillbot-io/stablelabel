import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useAuth } from '@/hooks/useAuth';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import RuleBuilder from '@/components/RuleBuilder';
import type { PolicyRules } from '@/components/RuleBuilder';
import type { Policy, SensitivityLabel } from '@/lib/types';
import { ChevronDown, ChevronRight, Copy, Pencil } from 'lucide-react';

const DEFAULT_RULES: PolicyRules = { conditions: [], match_mode: 'any' };

export default function PoliciesPage() {
  const { user } = useAuth();
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [labels, setLabels] = useState<SensitivityLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const data = await api.get<Policy[]>(`/tenants/${selected.id}/policies`);
      setPolicies(data);
    } catch (err) {
      setPolicies([]);
      showError(err instanceof Error ? err.message : 'Failed to load policies');
    }
    setLoading(false);
  }, [selected, showError]);

  // Load labels for the label picker
  useEffect(() => {
    if (!selected) return;
    api.get<SensitivityLabel[]>(`/tenants/${selected.id}/labels?appliable_only=true`)
      .then(setLabels)
      .catch(() => setLabels([]));
  }, [selected]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const togglePolicy = async (policy: Policy) => {
    if (!selected) return;
    try {
      await api.patch(`/tenants/${selected.id}/policies/${policy.id}`, { is_enabled: !policy.is_enabled });
      await loadPolicies();
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to update policy'); }
  };

  const deletePolicy = async (policy: Policy) => {
    if (!selected || policy.is_builtin) return;
    try {
      await api.delete(`/tenants/${selected.id}/policies/${policy.id}`);
      await loadPolicies();
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to delete policy'); }
  };

  const savePolicy = async (name: string, targetLabelId: string, priority: number, rules: PolicyRules, policyId?: string) => {
    if (!selected) return;
    try {
      if (policyId) {
        await api.patch(`/tenants/${selected.id}/policies/${policyId}`, {
          name, target_label_id: targetLabelId, priority, rules,
        });
      } else {
        await api.post(`/tenants/${selected.id}/policies`, {
          name, target_label_id: targetLabelId, priority, rules,
        });
      }
      setShowCreate(false);
      setEditing(null);
      await loadPolicies();
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to save policy'); }
  };

  const duplicatePolicy = async (policy: Policy) => {
    if (!selected) return;
    try {
      await api.post(`/tenants/${selected.id}/policies`, {
        name: `${policy.name} (copy)`,
        target_label_id: policy.target_label_id,
        priority: policy.priority,
        rules: policy.rules,
        is_enabled: false,
      });
      await loadPolicies();
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to duplicate policy'); }
  };

  const getLabelName = (labelId: string) => {
    const label = labels.find((l) => l.id === labelId);
    return label ? label.display_name || label.name : labelId;
  };

  const conditionSummary = (rules: Record<string, unknown>) => {
    const conditions = (rules.conditions ?? []) as Array<{ type: string; entity_types?: string[]; patterns?: string[] }>;
    if (conditions.length === 0) return 'No conditions';
    const parts = conditions.map((c) => {
      if (c.type === 'entity_detected') return `${(c.entity_types ?? []).length} entity type(s)`;
      if (c.type === 'file_pattern') return `${(c.patterns ?? []).length} pattern(s)`;
      if (c.type === 'no_label') return 'Unlabelled files';
      return c.type;
    });
    const mode = (rules.match_mode as string) === 'all' ? ' AND ' : ' OR ';
    return parts.join(mode);
  };

  const isOperator = user?.role !== 'Viewer';

  return (
    <div className="p-6">
      <PageHeader title="Policies" description="Auto-labelling rules — classify content and apply the right sensitivity label">
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
        {isOperator && (
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm rounded-md transition-colors">
            New Policy
          </button>
        )}
      </PageHeader>

      {(showCreate || editing) && (
        <PolicyDialog
          policy={editing ?? undefined}
          labels={labels}
          onSubmit={savePolicy}
          onClose={() => { setShowCreate(false); setEditing(null); }}
        />
      )}

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <div className="space-y-2">
          {policies.length === 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No policies configured. Create one to start auto-labelling files.
            </div>
          )}
          {policies.map((p) => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              {/* Policy header row */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  >
                    {expanded === p.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {p.is_builtin && <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">built-in</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>Priority: {p.priority}</span>
                      <span>&middot;</span>
                      <span>Target: {getLabelName(p.target_label_id)}</span>
                      <span>&middot;</span>
                      <span>{conditionSummary(p.rules)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={p.is_enabled ? 'active' : 'pending'} />
                  <button onClick={() => togglePolicy(p)} className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                    {p.is_enabled ? 'Disable' : 'Enable'}
                  </button>
                  {isOperator && (
                    <>
                      <button
                        onClick={() => duplicatePolicy(p)}
                        className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      {!p.is_builtin && (
                        <>
                          <button
                            onClick={() => setEditing(p)}
                            className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => deletePolicy(p)} className="px-2 py-1 text-xs rounded bg-red-900/50 hover:bg-red-900 text-red-400">
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Expanded rule view */}
              {expanded === p.id && (
                <div className="border-t border-zinc-800 p-4 bg-zinc-950/50">
                  <RuleBuilder
                    value={(p.rules as PolicyRules) ?? DEFAULT_RULES}
                    onChange={() => {}}
                    readOnly
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Policy create/edit dialog ─────────────────────────────────

function PolicyDialog({
  policy,
  labels,
  onSubmit,
  onClose,
}: {
  policy?: Policy;
  labels: SensitivityLabel[];
  onSubmit: (name: string, labelId: string, priority: number, rules: PolicyRules, policyId?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(policy?.name ?? '');
  const [labelId, setLabelId] = useState(policy?.target_label_id ?? '');
  const [priority, setPriority] = useState(policy?.priority ?? 0);
  const [rules, setRules] = useState<PolicyRules>(
    (policy?.rules as PolicyRules) ?? DEFAULT_RULES,
  );

  const isValid = name.trim() && labelId.trim() && rules.conditions.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">{policy ? 'Edit Policy' : 'Create Policy'}</h2>

        <div className="space-y-4">
          {/* Name + Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm text-zinc-400 block mb-1">Policy Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PCI Data Protection"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Target label picker */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Target Label</label>
            {labels.length > 0 ? (
              <select
                value={labelId}
                onChange={(e) => setLabelId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a sensitivity label...</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.display_name || l.name} {l.has_protection ? '(encrypted)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={labelId}
                onChange={(e) => setLabelId(e.target.value)}
                placeholder="Label GUID"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Conditions */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Conditions</label>
            <RuleBuilder value={rules} onChange={setRules} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">
            Cancel
          </button>
          <button
            onClick={() => isValid && onSubmit(name, labelId, priority, rules, policy?.id)}
            disabled={!isValid}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {policy ? 'Save Changes' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}
