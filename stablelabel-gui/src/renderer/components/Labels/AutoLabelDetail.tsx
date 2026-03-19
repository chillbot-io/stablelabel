import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { AutoLabelPolicy } from '../../lib/types';

interface AutoLabelDetailProps {
  policyName: string;
  onOpenLabel: (id: string, name: string) => void;
  onEdit: (name: string) => void;
  onDeleted: () => void;
}

export default function AutoLabelDetail({ policyName, onOpenLabel, onEdit, onDeleted }: AutoLabelDetailProps) {
  const { invoke } = usePowerShell();
  const [policy, setPolicy] = useState<AutoLabelPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<AutoLabelPolicy>('Get-SLAutoLabelPolicy', { Identity: policyName });
        if (result.success && result.data) {
          setPolicy(result.data);
        } else {
          setError(result.error ?? 'Auto-label policy not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load policy');
      }
      setLoading(false);
    };
    fetch();
  }, [policyName]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">
          {error ?? 'Auto-label policy not found'}
        </div>
      </div>
    );
  }

  const modeInfo = getModeInfo(policy.Mode);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{policy.Name}</h2>
          {policy.Comment && (
            <p className="text-sm text-zinc-400 mt-1">{policy.Comment}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs rounded-lg ${modeInfo.color}`}>
            {modeInfo.text}
          </span>
          <button
            onClick={() => onEdit(policyName)}
            className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Mode explanation */}
      <div className={`rounded-lg p-3 border ${modeInfo.bgBorder}`}>
        <p className="text-xs text-zinc-300">{modeInfo.description}</p>
      </div>

      {/* Properties */}
      <div className="grid grid-cols-2 gap-4">
        <PropertyCard label="GUID" value={policy.Guid} mono />
        <PropertyCard label="Priority" value={String(policy.Priority ?? 'N/A')} />
        <PropertyCard label="Created" value={formatDate(policy.WhenCreated)} />
        <PropertyCard label="Last Modified" value={formatDate(policy.WhenChanged)} />
      </div>

      {/* Target label */}
      {policy.ApplySensitivityLabel && (
        <div className="bg-white/[0.03] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Applies Sensitivity Label
          </h3>
          <button
            onClick={() =>
              onOpenLabel(policy.ApplySensitivityLabel!, policy.ApplySensitivityLabel!)
            }
            className="px-3 py-1.5 text-sm bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
          >
            {policy.ApplySensitivityLabel}
          </button>
        </div>
      )}

      {/* Scoped Locations */}
      <div className="bg-white/[0.03] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Scoped Locations
        </h3>
        <div className="space-y-3">
          <LocationRow label="Exchange" locations={policy.ExchangeLocation} />
          <LocationRow label="SharePoint" locations={policy.SharePointLocation} />
          <LocationRow label="OneDrive" locations={policy.OneDriveLocation} />
        </div>
      </div>

      {/* Raw JSON */}
      <RawJsonSection data={policy} />
    </div>
  );
}

function getModeInfo(mode: string | null) {
  switch (mode?.toLowerCase()) {
    case 'enable':
      return {
        text: 'Enforcing',
        color: 'bg-emerald-400/10 text-emerald-400 border border-green-500/20',
        bgBorder: 'bg-emerald-400/5 border-green-500/20',
        description: 'This policy is actively labeling matching content. Labels are applied automatically.',
      };
    case 'testwithnotifications':
      return {
        text: 'Simulation + Notifications',
        color: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
        bgBorder: 'bg-yellow-500/5 border-yellow-500/20',
        description: 'Running in simulation mode. Matches are logged and users are notified, but labels are not applied.',
      };
    case 'testwithoutnotifications':
      return {
        text: 'Simulation',
        color: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        bgBorder: 'bg-blue-500/5 border-blue-500/20',
        description: 'Running in simulation mode. Matches are logged silently — no labels applied, no user notifications.',
      };
    default:
      return {
        text: mode ?? 'Unknown',
        color: 'bg-white/[0.08]/50 text-zinc-400 border border-gray-600',
        bgBorder: 'bg-white/[0.04] border-white/[0.08]',
        description: 'Policy mode is not recognized.',
      };
  }
}

function PropertyCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3">
      <dt className="text-xs text-zinc-500 mb-1">{label}</dt>
      <dd className={`text-sm text-zinc-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function LocationRow({ label, locations }: { label: string; locations: string[] | null }) {
  const items = locations?.filter(Boolean) ?? [];
  const isAll = items.length === 1 && items[0]?.toLowerCase() === 'all';

  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-zinc-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
      {items.length === 0 ? (
        <span className="text-xs text-zinc-600">Not configured</span>
      ) : isAll ? (
        <span className="text-xs text-emerald-400">All locations</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((loc) => (
            <span key={loc} className="text-xs px-1.5 py-0.5 bg-white/[0.06] text-zinc-300 rounded-lg">
              {loc}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RawJsonSection({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-white/[0.06] pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? '▾ Hide' : '▸ Show'} raw JSON
      </button>
      {expanded && (
        <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}
