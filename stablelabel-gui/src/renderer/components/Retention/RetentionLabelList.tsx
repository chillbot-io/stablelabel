import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { RetentionLabel } from '../../lib/types';

interface RetentionLabelListProps {
  onOpenLabel: (name: string) => void;
  onNewLabel: () => void;
}

const actionBadge = (action: string | null) => {
  switch (action) {
    case 'Keep': return { text: 'Keep', color: 'bg-blue-500/10 text-blue-400' };
    case 'Delete': return { text: 'Delete', color: 'bg-red-500/10 text-red-400' };
    case 'KeepAndDelete': return { text: 'Keep then Delete', color: 'bg-amber-500/10 text-amber-400' };
    default: return { text: action ?? 'None', color: 'bg-gray-700 text-gray-400' };
  }
};

export default function RetentionLabelList({ onOpenLabel, onNewLabel }: RetentionLabelListProps) {
  const { invoke } = usePowerShell();
  const [labels, setLabels] = useState<RetentionLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<RetentionLabel[]>('Get-SLRetentionLabel');
      if (result.success && Array.isArray(result.data)) setLabels(result.data);
      else setError(result.error ?? 'Failed to load retention labels');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const filtered = search.trim()
    ? labels.filter((l) => l.Name.toLowerCase().includes(search.toLowerCase()))
    : labels;

  if (loading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-800">
        <input type="text" placeholder="Search retention labels..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500" />
      </div>
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800/50">{labels.length} retention {labels.length === 1 ? 'label' : 'labels'}</div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? <p className="p-4 text-xs text-gray-600">No retention labels found.</p> : filtered.map(label => {
          const badge = actionBadge(label.RetentionAction);
          return (
            <button key={label.Guid ?? label.Name} onClick={() => onOpenLabel(label.Name)} className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors group">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-200 group-hover:text-white truncate">{label.Name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.color}`}>{badge.text}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {label.RetentionDuration != null && <span className="text-[10px] text-gray-500">{label.RetentionDuration} days</span>}
                {label.IsRecordLabel && <span className="text-[10px] text-orange-400">Record</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="p-2 border-t border-gray-800 space-y-1.5">
        <button onClick={onNewLabel} className="w-full py-1.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors">+ New Retention Label</button>
        <button onClick={fetch} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors">Refresh</button>
      </div>
    </div>
  );
}
