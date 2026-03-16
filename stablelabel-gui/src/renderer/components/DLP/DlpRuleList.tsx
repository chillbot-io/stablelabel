import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { usePagination } from '../../hooks/usePagination';
import type { DlpRule } from '../../lib/types';

interface Props { onOpen: (name: string) => void; onNew: () => void; }

export default function DlpRuleList({ onOpen, onNew }: Props) {
  const { invoke } = usePowerShell();
  const [items, setItems] = useState<DlpRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true); setError(null);
    try {
      const r = await invoke<DlpRule[]>('Get-SLDlpRule');
      if (r.success && Array.isArray(r.data)) setItems(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const filtered = search.trim() ? items.filter(r => r.Name.toLowerCase().includes(search.toLowerCase()) || r.Policy?.toLowerCase().includes(search.toLowerCase())) : items;
  const { visible: paginated, hasMore, remaining, loadMore } = usePagination(filtered);

  if (loading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-800"><input type="text" placeholder="Search rules..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500" /></div>
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800/50">{items.length} DLP {items.length === 1 ? 'rule' : 'rules'}</div>
      <div className="flex-1 overflow-y-auto py-1">
        {paginated.length === 0 ? <p className="p-4 text-xs text-gray-600">No DLP rules found.</p> : <>{paginated.map(rule => (
          <button key={rule.Guid ?? rule.Name} onClick={() => onOpen(rule.Name)} className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors group">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200 group-hover:text-white truncate">{rule.Name}</span>
              <div className="flex items-center gap-1">
                {rule.BlockAccess && <span className="text-[10px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded">Block</span>}
                {rule.Disabled && <span className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">Off</span>}
              </div>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 truncate">Policy: {rule.Policy}</div>
          </button>
        ))}{hasMore && (
            <button onClick={loadMore} className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-800/50 transition-colors">Show {remaining} more...</button>
          )}</>}
      </div>
      <div className="p-2 border-t border-gray-800 space-y-1.5">
        <button onClick={onNew} className="w-full py-1.5 text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors">+ New DLP Rule</button>
        <button onClick={fetch} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors">Refresh</button>
      </div>
    </div>
  );
}
