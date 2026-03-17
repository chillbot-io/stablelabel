import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { usePagination } from '../../hooks/usePagination';
import type { AutoLabelPolicy } from '../../lib/types';

interface AutoLabelListProps {
  onOpenAutoLabel: (name: string) => void;
  onNewAutoLabel: () => void;
}

export default function AutoLabelList({ onOpenAutoLabel, onNewAutoLabel }: AutoLabelListProps) {
  const { invoke } = usePowerShell();
  const [policies, setPolicies] = useState<AutoLabelPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchPolicies = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<AutoLabelPolicy[]>('Get-SLAutoLabelPolicy');
      if (result.success && Array.isArray(result.data)) {
        setPolicies(result.data);
      } else {
        setError(result.error ?? 'Failed to load auto-label policies');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load auto-label policies');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const filtered = search.trim()
    ? policies.filter((p) => p.Name.toLowerCase().includes(search.toLowerCase()))
    : policies;

  const { visible: paginated, hasMore, remaining, loadMore } = usePagination(filtered);

  const modeLabel = (mode: string | null) => {
    if (!mode) return { text: 'Unknown', color: 'bg-white/[0.08] text-zinc-400' };
    switch (mode.toLowerCase()) {
      case 'enable':
        return { text: 'Enforcing', color: 'bg-emerald-400/10 text-emerald-400' };
      case 'testwithnotifications':
        return { text: 'Simulation + Notify', color: 'bg-yellow-500/10 text-yellow-400' };
      case 'testwithoutnotifications':
        return { text: 'Simulation', color: 'bg-blue-500/10 text-blue-400' };
      default:
        return { text: mode, color: 'bg-white/[0.08] text-zinc-400' };
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-white/[0.06] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-400 mb-2">{error}</div>
        <button onClick={fetchPolicies} className="text-xs text-blue-400 hover:text-blue-300">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-white/[0.06]">
        <input
          type="text"
          placeholder="Search auto-label policies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500"
        />
      </div>

      <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-white/[0.04]">
        {policies.length} auto-label {policies.length === 1 ? 'policy' : 'policies'}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {paginated.length === 0 ? (
          <p className="p-4 text-xs text-zinc-600">No auto-label policies found.</p>
        ) : (
          <>
          {paginated.map((policy) => {
            const mode = modeLabel(policy.Mode);
            return (
              <button
                key={policy.Guid ?? policy.Name}
                onClick={() => onOpenAutoLabel(policy.Name)}
                className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-200 group-hover:text-white truncate">
                    {policy.Name}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-lg ${mode.color}`}>
                    {mode.text}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {policy.ApplySensitivityLabel && (
                    <span className="text-[10px] text-blue-400">
                      Applies: {policy.ApplySensitivityLabel}
                    </span>
                  )}
                  {policy.Priority != null && (
                    <span className="text-[10px] text-zinc-600">
                      Priority {policy.Priority}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {hasMore && (
            <button onClick={loadMore} className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/[0.04] transition-colors">
              Show {remaining} more...
            </button>
          )}
          </>
        )}
      </div>

      <div className="p-2 border-t border-white/[0.06] space-y-1.5">
        <button
          onClick={onNewAutoLabel}
          className="w-full py-1.5 text-xs text-teal-300 hover:text-teal-200 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg transition-colors"
        >
          + New Auto-Label Policy
        </button>
        <button
          onClick={fetchPolicies}
          className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] hover:bg-white/[0.08] rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
