import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { SensitiveInfoType } from '../../lib/types';

interface Props { onOpen: (name: string) => void; }

export default function SensitiveInfoTypeList({ onOpen }: Props) {
  const { invoke } = usePowerShell();
  const [items, setItems] = useState<SensitiveInfoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [customOnly, setCustomOnly] = useState(false);

  const fetch = async () => {
    setLoading(true); setError(null);
    try {
      const cmd = customOnly ? 'Get-SLSensitiveInfoType -CustomOnly' : 'Get-SLSensitiveInfoType';
      const r = await invoke<SensitiveInfoType[]>(cmd);
      if (r.success && Array.isArray(r.data)) setItems(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [customOnly]);

  const filtered = search.trim() ? items.filter(s => s.Name.toLowerCase().includes(search.toLowerCase())) : items;

  if (loading) return <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-4"><div className="text-sm text-red-400 mb-2">{error}</div><button onClick={fetch} className="text-xs text-blue-400">Retry</button></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-800"><input type="text" placeholder="Search info types..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500" /></div>
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-800/50">
        <span className="text-xs text-gray-500">{filtered.length} of {items.length} types</span>
        <button onClick={() => setCustomOnly(!customOnly)} className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${customOnly ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}>{customOnly ? 'Custom Only' : 'All Types'}</button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? <p className="p-4 text-xs text-gray-600">No sensitive info types found.</p> : filtered.map(sit => (
          <button key={sit.Id ?? sit.Name} onClick={() => onOpen(sit.Name)} className="w-full text-left px-3 py-1.5 hover:bg-gray-800 transition-colors group">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200 group-hover:text-white truncate">{sit.Name}</span>
              {sit.Publisher && sit.Publisher !== 'Microsoft Corporation' && <span className="text-[10px] px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded">Custom</span>}
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
