import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField } from '../common/FormFields';
import type { FileShareInventory as InventoryResult } from '../../lib/types';

export default function FileShareInventory() {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [filter, setFilter] = useState('*');
  const [recurse, setRecurse] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [search, setSearch] = useState('');

  const handleInventory = async () => {
    if (!path.trim()) { setError('Path is required.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const parts = [`Get-SLFileShareInventory -Path '${esc(path)}'`];
      if (filter.trim() && filter !== '*') parts.push(`-Filter '${esc(filter)}'`);
      if (recurse) parts.push('-Recurse');
      const r = await invoke<InventoryResult>(parts.join(' '));
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed to get inventory');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const filteredItems = result?.Items?.filter((item) =>
    item.FileName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">File Share Inventory</h3>
        <p className="text-xs text-zinc-500">Browse files and their label status on a CIFS/SMB share.</p>
      </div>

      <div className="space-y-3">
        <TextField label="Directory Path" value={path} onChange={setPath} placeholder="\\\\server\\share\\folder or Z:\\folder" required />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Filter" value={filter} onChange={setFilter} placeholder="*" helpText="File filter pattern" />
          <div className="flex items-end pb-1">
            <ToggleField label="Recurse" checked={recurse} onChange={setRecurse} helpText="Include subdirectories" />
          </div>
        </div>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <button onClick={handleInventory} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
        {loading ? 'Scanning...' : 'Get Inventory'}
      </button>

      {result && (
        <div className="space-y-4 pt-2">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Total Files" value={result.Summary.TotalFiles} />
            <SummaryCard label="Labeled" value={result.Summary.LabeledCount} color="green" />
            <SummaryCard label="Unlabeled" value={result.Summary.UnlabeledCount} color="yellow" />
          </div>

          {/* Label distribution */}
          {Object.keys(result.Summary.LabelDistribution).length > 0 && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Label Distribution</h4>
              <div className="space-y-1">
                {Object.entries(result.Summary.LabelDistribution).map(([label, count]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-zinc-300">{label}</span>
                    <span className="text-zinc-500">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files list */}
          <div className="bg-white/[0.03] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Files ({filteredItems.length})</h4>
              <input
                type="text"
                placeholder="Filter files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-2 py-1 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-300 placeholder-gray-600 w-48"
              />
            </div>
            <div className="space-y-1 max-h-96 overflow-auto">
              {filteredItems.slice(0, 100).map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-white/[0.06] rounded-lg text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="text-zinc-200 truncate block">{item.FileName}</span>
                    <span className="text-zinc-500">{item.Extension} &middot; {item.SizeKB} KB</span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {item.IsLabeled ? (
                      <span className="px-1.5 py-0.5 bg-green-900/30 text-emerald-400 rounded-lg text-[10px]">{item.LabelName}</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400 rounded-lg text-[10px]">Unlabeled</span>
                    )}
                  </div>
                </div>
              ))}
              {filteredItems.length > 100 && (
                <p className="text-xs text-zinc-500 text-center py-2">Showing 100 of {filteredItems.length} files</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass = color === 'green' ? 'text-emerald-400' : color === 'yellow' ? 'text-yellow-400' : 'text-blue-400';
  return (
    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
