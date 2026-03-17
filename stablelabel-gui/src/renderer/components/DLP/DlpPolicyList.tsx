import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { usePagination } from '../../hooks/usePagination';
import type { DlpPolicy } from '../../lib/types';

interface Props { onOpen: (name: string) => void; onNew: () => void; }

const modeBadge = (mode: string | null) => {
  switch (mode?.toLowerCase()) {
    case 'enable': return { text: 'Enforcing', color: 'bg-emerald-400/10 text-emerald-400' };
    case 'testwithnotifications': return { text: 'Test + Notify', color: 'bg-yellow-500/10 text-yellow-400' };
    case 'testwithoutnotifications': return { text: 'Test', color: 'bg-blue-500/10 text-blue-400' };
    default: return { text: mode ?? 'Unknown', color: 'bg-white/[0.08] text-zinc-400' };
  }
};

export default function DlpPolicyList({ onOpen, onNew }: Props) {
  const { invoke } = usePowerShell();
  const [items, setItems] = useState<DlpPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true); setError(null);
    try {
      const r = await invoke<DlpPolicy[]>('Get-SLDlpPolicy');
      if (r.success && Array.isArray(r.data)) setItems(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const filtered = search.trim() ? items.filter(p => p.Name.toLowerCase().includes(search.toLowerCase())) : items;
  const { visible: paginated, hasMore, remaining, loadMore } = usePagination(filtered);

  if (loading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-white/[0.06]"><input type="text" placeholder="Search DLP policies..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500" /></div>
      <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-white/[0.04]">{items.length} DLP {items.length === 1 ? 'policy' : 'policies'}</div>
      <div className="flex-1 overflow-y-auto py-1">
        {paginated.length === 0 ? <p className="p-4 text-xs text-zinc-600">No DLP policies found.</p> : <>{paginated.map(p => {
          const badge = modeBadge(p.Mode);
          return (
            <button key={p.Guid ?? p.Name} onClick={() => onOpen(p.Name)} className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors group">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-200 group-hover:text-white truncate">{p.Name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-lg ${badge.color}`}>{badge.text}</span>
              </div>
              {p.Comment && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{p.Comment}</div>}
            </button>
          );
        })}{hasMore && (
            <button onClick={loadMore} className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/[0.04] transition-colors">Show {remaining} more...</button>
          )}</>}
      </div>
      <div className="p-2 border-t border-white/[0.06] space-y-1.5">
        <button onClick={onNew} className="w-full py-1.5 text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors">+ New DLP Policy</button>
        <button onClick={fetch} className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] hover:bg-white/[0.08] rounded-lg transition-colors">Refresh</button>
      </div>
    </div>
  );
}
