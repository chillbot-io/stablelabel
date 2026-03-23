import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useAuth } from '@/hooks/useAuth';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import StatusBadge from '@/components/StatusBadge';
import RuleBuilder from '@/components/RuleBuilder';
import SitPicker from '@/components/SitPicker';
import SitRuleViewer from '@/components/SitRuleViewer';
import type { PolicyRules } from '@/components/RuleBuilder';
import type { Policy, SensitivityLabel, SitDefinition, SitRules } from '@/lib/types';
import { ChevronDown, ChevronRight, Copy, Pencil, Shield, Wrench } from 'lucide-react';

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

  const savePolicyFromSit = async (sitId: string, targetLabelId: string, name: string, priority: number) => {
    if (!selected) return;
    try {
      await api.post(`/tenants/${selected.id}/policies/from-sit`, {
        sit_id: sitId,
        target_label_id: targetLabelId,
        name,
        priority,
      });
      setShowCreate(false);
      await loadPolicies();
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to create policy'); }
  };

  const savePolicyCustom = async (name: string, targetLabelId: string, priority: number, rules: PolicyRules, policyId?: string) => {
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

  const ruleSummary = (rules: Record<string, unknown>) => {
    // SIT-aligned format
    const patterns = rules.patterns as Array<Record<string, unknown>> | undefined;
    if (patterns && patterns.length > 0) {
      const entityCount = patterns.reduce((acc, p) => {
        const pm = p.primary_match as Record<string, unknown> | undefined;
        if (pm?.type === 'entity') {
          return acc + ((pm.entity_types as string[]) ?? []).length;
        }
        return acc;
      }, 0);
      const hasEvidence = patterns.some((p) => p.corroborative_evidence != null);
      const parts: string[] = [];
      parts.push(`${patterns.length} pattern(s)`);
      if (entityCount > 0) parts.push(`${entityCount} entity type(s)`);
      if (hasEvidence) parts.push('with evidence');
      return parts.join(' · ');
    }
    // Legacy format
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

  const isSitRules = (rules: Record<string, unknown>) => Array.isArray(rules.patterns);

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

      {showCreate && (
        <CreatePolicyDialog
          labels={labels}
          onSubmitSit={savePolicyFromSit}
          onSubmitCustom={savePolicyCustom}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editing && (
        <EditPolicyDialog
          policy={editing}
          labels={labels}
          onSubmit={savePolicyCustom}
          onClose={() => setEditing(null)}
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
                      {isSitRules(p.rules) && (
                        <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-800 shrink-0">SIT</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>Priority: {p.priority}</span>
                      <span>&middot;</span>
                      <span>Target: {getLabelName(p.target_label_id)}</span>
                      <span>&middot;</span>
                      <span>{ruleSummary(p.rules)}</span>
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

              {/* Expanded rule view — uses SIT viewer for SIT rules, legacy RuleBuilder otherwise */}
              {expanded === p.id && (
                <div className="border-t border-zinc-800 p-4 bg-zinc-950/50">
                  {isSitRules(p.rules) ? (
                    <SitRuleViewer rules={p.rules as unknown as SitRules} />
                  ) : (
                    <RuleBuilder
                      value={(p.rules as PolicyRules) ?? DEFAULT_RULES}
                      onChange={() => {}}
                      readOnly
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create Policy Dialog (SIT picker + custom builder) ───────

type CreateMode = 'sit' | 'custom';

function CreatePolicyDialog({
  labels,
  onSubmitSit,
  onSubmitCustom,
  onClose,
}: {
  labels: SensitivityLabel[];
  onSubmitSit: (sitId: string, labelId: string, name: string, priority: number) => void;
  onSubmitCustom: (name: string, labelId: string, priority: number, rules: PolicyRules) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<CreateMode>('sit');
  const [selectedSit, setSelectedSit] = useState<SitDefinition | null>(null);
  const [name, setName] = useState('');
  const [labelId, setLabelId] = useState('');
  const [priority, setPriority] = useState(0);
  const [customRules, setCustomRules] = useState<PolicyRules>(DEFAULT_RULES);

  const handleSitSelect = (sit: SitDefinition) => {
    setSelectedSit(sit);
    if (!name || name === selectedSit?.name) {
      setName(sit.name);
    }
  };

  const isValidSit = selectedSit && labelId.trim() && name.trim();
  const isValidCustom = name.trim() && labelId.trim() && customRules.conditions.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-0">
          <h2 className="text-lg font-semibold mb-4">Create Policy</h2>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setMode('sit')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                mode === 'sit'
                  ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <Shield size={14} />
              From SIT Template
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                mode === 'custom'
                  ? 'border-blue-600 bg-blue-950/40 text-blue-300'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <Wrench size={14} />
              Custom Rules
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-4">
            {mode === 'sit' ? (
              <>
                {/* Step 1: Pick a SIT */}
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">
                    1. Select a Sensitive Information Type
                  </label>
                  <SitPicker onSelect={handleSitSelect} selected={selectedSit?.id ?? null} />
                </div>

                {/* Step 2: Assign label (shown after SIT selection) */}
                {selectedSit && (
                  <>
                    <div className="border-t border-zinc-800 pt-4">
                      <label className="text-sm text-zinc-400 block mb-2">
                        2. Assign a sensitivity label
                      </label>
                      <LabelPicker labels={labels} value={labelId} onChange={setLabelId} />
                    </div>

                    {/* Optional name + priority override */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="text-sm text-zinc-400 block mb-1">Policy Name</label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
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
                  </>
                )}
              </>
            ) : (
              <>
                {/* Custom mode: name + priority + label + rule builder */}
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

                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Target Label</label>
                  <LabelPicker labels={labels} value={labelId} onChange={setLabelId} />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Conditions</label>
                  <RuleBuilder value={customRules} onChange={setCustomRules} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 pt-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">
            Cancel
          </button>
          {mode === 'sit' ? (
            <button
              onClick={() => isValidSit && onSubmitSit(selectedSit!.id, labelId, name, priority)}
              disabled={!isValidSit}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              Create Policy
            </button>
          ) : (
            <button
              onClick={() => isValidCustom && onSubmitCustom(name, labelId, priority, customRules)}
              disabled={!isValidCustom}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              Create Policy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Policy Dialog (legacy rule builder for existing policies) ─

function EditPolicyDialog({
  policy,
  labels,
  onSubmit,
  onClose,
}: {
  policy: Policy;
  labels: SensitivityLabel[];
  onSubmit: (name: string, labelId: string, priority: number, rules: PolicyRules, policyId?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(policy.name);
  const [labelId, setLabelId] = useState(policy.target_label_id);
  const [priority, setPriority] = useState(policy.priority);
  const [rules, setRules] = useState<PolicyRules>(
    (policy.rules as PolicyRules) ?? DEFAULT_RULES,
  );

  const isSit = Array.isArray((policy.rules as Record<string, unknown>).patterns);

  // For SIT policies, only allow changing name/label/priority (not the rules)
  const isValid = name.trim() && labelId.trim() && (isSit || rules.conditions.length > 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Edit Policy</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm text-zinc-400 block mb-1">Policy Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
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

          <div>
            <label className="text-sm text-zinc-400 block mb-1">Target Label</label>
            <LabelPicker labels={labels} value={labelId} onChange={setLabelId} />
          </div>

          {/* Rules: read-only SIT viewer for SIT policies, editable builder for legacy */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">
              {isSit ? 'Detection Rules (SIT — read-only)' : 'Conditions'}
            </label>
            {isSit ? (
              <SitRuleViewer rules={policy.rules as unknown as SitRules} />
            ) : (
              <RuleBuilder value={rules} onChange={setRules} />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">
            Cancel
          </button>
          <button
            onClick={() => isValid && onSubmit(name, labelId, priority, isSit ? (policy.rules as PolicyRules) : rules, policy.id)}
            disabled={!isValid}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared label picker ──────────────────────────────────────

function LabelPicker({
  labels,
  value,
  onChange,
}: {
  labels: SensitivityLabel[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (labels.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select a sensitivity label...</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.display_name || l.name} {l.has_protection ? '(encrypted)' : ''}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Label GUID"
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}
