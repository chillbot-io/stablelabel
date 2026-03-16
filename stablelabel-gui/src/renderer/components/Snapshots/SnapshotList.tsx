import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { SnapshotSummary } from '../../lib/types';

interface Props {
  onSelect: (name: string) => void;
  selectedName: string | null;
  refreshKey: number;
}

export default function SnapshotList({ onSelect, selectedName, refreshKey }: Props) {
  const { invoke } = usePowerShell();
  const [items, setItems] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true); setError(null);
    try {
      const r = await invoke<SnapshotSummary[]>('Get-SLSnapshot');
      if (r.success && Array.isArray(r.data)) setItems(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [refreshKey]);

  if (loading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  const filtered = search.trim()
    ? items.filter(s => s.Name.toLowerCase().includes(search.toLowerCase()) || s.Scope?.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-800">
        <input type="text" placeholder="Search snapshots..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
      </div>
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800/50">{items.length} {items.length === 1 ? 'snapshot' : 'snapshots'}</div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="p-4 text-xs text-gray-600">{items.length === 0 ? 'No snapshots found. Create one to capture your tenant state.' : 'No matching snapshots.'}</p>
        ) : filtered.map(snap => (
          <button
            key={snap.SnapshotId ?? snap.Name}
            onClick={() => onSelect(snap.Name)}
            className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${selectedName === snap.Name ? 'bg-gray-800 border-blue-400' : 'hover:bg-gray-800/50 border-transparent'}`}
          >
            <div className="text-sm text-gray-200">{snap.Name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-500">{snap.CreatedAt}</span>
              <span className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">{snap.Scope}</span>
              <span className="text-[10px] text-gray-600">{snap.SizeMB?.toFixed(1)}MB</span>
            </div>
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-gray-800">
        <button onClick={fetch} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors">Refresh</button>
      </div>
    </div>
  );
}
