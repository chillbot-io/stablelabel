import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { SensitivityLabel } from '../../lib/types';
import PropertyCard from '../common/PropertyCard';
import RawJsonSection from '../common/RawJsonSection';

interface LabelDetailProps {
  labelId: string;
  onOpenPolicy: (name: string) => void;
}

export default function LabelDetail({ labelId, onOpenPolicy }: LabelDetailProps) {
  const { invoke } = usePowerShell();
  const [label, setLabel] = useState<SensitivityLabel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<string[]>([]);

  useEffect(() => {
    const fetchLabel = async () => {
      setLoading(true);
      setError(null);

      let labelData: SensitivityLabel | null = null;
      try {
        const result = await invoke<SensitivityLabel>('Get-SLLabel', { Id: labelId });
        if (result.success && result.data) {
          labelData = result.data;
          setLabel(result.data);
        } else {
          setError(result.error ?? 'Label not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load label');
      }

      // Also find which policies contain this label
      try {
        const policyResult = await invoke<Array<{ Name: string; Labels: string[] }>>('Get-SLLabelPolicy');
        if (policyResult.success && Array.isArray(policyResult.data)) {
          const matching = policyResult.data
            .filter((p) => p.Labels?.some((l: string) => l === labelId || l === labelData?.name))
            .map((p) => p.Name);
          setPolicies(matching);
        }
      } catch {
        // Non-critical
      }

      setLoading(false);
    };

    fetchLabel();
  }, [labelId, invoke]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !label) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">
          {error ?? 'Label not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{label.displayName ?? label.name}</h2>
          {label.description && (
            <p className="text-sm text-zinc-400 mt-1">{label.description}</p>
          )}
        </div>
        <StatusBadge active={label.isActive} />
      </div>

      {/* Properties grid */}
      <div className="grid grid-cols-2 gap-4">
        <PropertyCard label="Label ID" value={label.id} mono />
        <PropertyCard label="Internal Name" value={label.name} />
        <PropertyCard label="Priority" value={String(label.priority ?? 'N/A')} />
        <PropertyCard label="Color" value={label.color ?? 'None'}>
          {label.color && (
            <div
              className="w-4 h-4 rounded-lg border border-gray-600"
              style={{ backgroundColor: label.color }}
            />
          )}
        </PropertyCard>
        {label.parent && (
          <PropertyCard label="Parent Label" value={label.parent.id} mono />
        )}
        <PropertyCard
          label="Content Formats"
          value={label.contentFormats?.join(', ') ?? 'All'}
        />
      </div>

      {/* Tooltip */}
      {label.tooltip && (
        <div className="bg-white/[0.03] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Tooltip (shown to users)
          </h3>
          <p className="text-sm text-zinc-300">{label.tooltip}</p>
        </div>
      )}

      {/* Policies containing this label */}
      <div className="bg-white/[0.03] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Published In Policies
        </h3>
        {policies.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Not found in any label policies. This label may not be published to users yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {policies.map((p) => (
              <button
                key={p}
                onClick={() => onOpenPolicy(p)}
                className="px-2.5 py-1 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      <RawJsonSection data={label} />
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`px-2 py-1 text-xs rounded-lg ${
        active
          ? 'bg-emerald-400/10 text-emerald-400 border border-green-500/20'
          : 'bg-white/[0.08] text-zinc-400 border border-gray-600'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

