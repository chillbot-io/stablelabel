import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { LabelPolicy } from '../../lib/types';

interface PolicyDetailProps {
  policyName: string;
  onOpenLabel: (id: string, name: string) => void;
  onEdit: (name: string) => void;
  onDeleted: () => void;
}

export default function PolicyDetail({ policyName, onOpenLabel, onEdit, onDeleted }: PolicyDetailProps) {
  const { invoke } = usePowerShell();
  const [policy, setPolicy] = useState<LabelPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<LabelPolicy>(`Get-SLLabelPolicy -Identity '${policyName}'`);
        if (result.success && result.data) {
          setPolicy(result.data);
        } else {
          setError(result.error ?? 'Policy not found');
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
          <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-800 rounded p-4 text-sm text-red-300">
          {error ?? 'Policy not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{policy.Name}</h2>
          {policy.Comment && (
            <p className="text-sm text-gray-400 mt-1">{policy.Comment}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs rounded ${
              policy.Enabled
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600'
            }`}
          >
            {policy.Enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            onClick={() => onEdit(policyName)}
            className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-4">
        <PropertyCard label="GUID" value={policy.Guid} mono />
        <PropertyCard label="Created By" value={policy.CreatedBy ?? 'N/A'} />
        <PropertyCard label="Created" value={formatDate(policy.WhenCreated)} />
        <PropertyCard label="Last Modified" value={formatDate(policy.WhenChanged)} />
        {policy.Mode && <PropertyCard label="Mode" value={policy.Mode} />}
        {policy.Type && <PropertyCard label="Type" value={policy.Type} />}
      </div>

      {/* Published Labels */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Published Labels ({policy.Labels?.length ?? 0})
        </h3>
        {(!policy.Labels || policy.Labels.length === 0) ? (
          <p className="text-sm text-gray-500">No labels published in this policy.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {policy.Labels.map((label) => (
              <button
                key={label}
                onClick={() => onOpenLabel(label, label)}
                className="px-2.5 py-1 text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded hover:bg-blue-500/20 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scoped Locations */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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

function PropertyCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-3">
      <dt className="text-xs text-gray-500 mb-1">{label}</dt>
      <dd className={`text-sm text-gray-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>
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
      <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
      {items.length === 0 ? (
        <span className="text-xs text-gray-600">Not configured</span>
      ) : isAll ? (
        <span className="text-xs text-green-400">All locations</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((loc) => (
            <span key={loc} className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded">
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
    <div className="border-t border-gray-800 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        {expanded ? '▾ Hide' : '▸ Show'} raw JSON
      </button>
      {expanded && (
        <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto">
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
