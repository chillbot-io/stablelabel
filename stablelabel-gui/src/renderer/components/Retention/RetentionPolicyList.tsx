import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
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

  if (loading) return <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-800">
        <input type="text" placeholder="Search retention policies..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500" />
      </div>
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800/50">{policies.length} retention {policies.length === 1 ? 'policy' : 'policies'}</div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? <p className="p-4 text-xs text-gray-600">No retention policies found.</p> : filtered.map(policy => (
          <button key={policy.Guid ?? policy.Name} onClick={() => onOpenPolicy(policy.Name)} className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors group">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200 group-hover:text-white truncate">{policy.Name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${policy.Enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>{policy.Enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-500">{locationCount(policy)} location{locationCount(policy) !== 1 ? 's' : ''}</span>
              {policy.Comment && <span className="text-[10px] text-gray-600 truncate">{policy.Comment}</span>}
            </div>
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-gray-800 space-y-1.5">
        <button onClick={onNewPolicy} className="w-full py-1.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors">+ New Retention Policy</button>
        <button onClick={fetch} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors">Refresh</button>
      </div>
    </div>
  );
}
