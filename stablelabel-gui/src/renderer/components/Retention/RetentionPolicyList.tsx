import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { usePagination } from '../../hooks/usePagination';
import type { RetentionPolicy } from '../../lib/types';

interface Props {
  onOpenPolicy: (name: string) => void;
  onNewPolicy: () => void;
}

export default function RetentionPolicyList({ onOpenPolicy, onNewPolicy }: Props) {
  const { invoke } = usePowerShell();
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<RetentionPolicy[]>('Get-SLRetentionPolicy');
      if (result.success && Array.isArray(result.data)) setPolicies(result.data);
      else setError(result.error ?? 'Failed to load retention policies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const filtered = search.trim() ? policies.filter(p => p.Name.toLowerCase().includes(search.toLowerCase())) : policies;
  const { visible: paginated, hasMore, remaining, loadMore } = usePagination(filtered);

  const locationCount = (p: RetentionPolicy) => {
    let count = 0;
    if (p.ExchangeLocation?.length) count++;
    if (p.SharePointLocation?.length) count++;
    if (p.OneDriveLocation?.length) count++;
    if (p.ModernGroupLocation?.length) count++;
    if (p.SkypeLocation?.length) count++;
    if (p.PublicFolderLocation?.length) count++;
    return count;
  };

  if (loading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-white/[0.06]">
        <input type="text" placeholder="Search retention policies..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500" />
      </div>
      <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-white/[0.04]">{policies.length} retention {policies.length === 1 ? 'policy' : 'policies'}</div>
      <div className="flex-1 overflow-y-auto py-1">
        {paginated.length === 0 ? <p className="p-4 text-xs text-zinc-600">No retention policies found.</p> : <>{paginated.map(policy => (
          <button key={policy.Guid ?? policy.Name} onClick={() => onOpenPolicy(policy.Name)} className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors group">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-200 group-hover:text-white truncate">{policy.Name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-lg ${policy.Enabled ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/[0.08] text-zinc-400'}`}>{policy.Enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-500">{locationCount(policy)} location{locationCount(policy) !== 1 ? 's' : ''}</span>
              {policy.Comment && <span className="text-[10px] text-zinc-600 truncate">{policy.Comment}</span>}
            </div>
          </button>
        ))}{hasMore && (
            <button onClick={loadMore} className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/[0.04] transition-colors">Show {remaining} more...</button>
          )}</>}
      </div>
      <div className="p-2 border-t border-white/[0.06] space-y-1.5">
        <button onClick={onNewPolicy} className="w-full py-1.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors">+ New Retention Policy</button>
        <button onClick={fetch} className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] hover:bg-white/[0.08] rounded-lg transition-colors">Refresh</button>
      </div>
    </div>
  );
}
