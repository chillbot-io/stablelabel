import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField } from '../common/FormFields';
import type { FileShareScanResult } from '../../lib/types';

export default function FileShareScan() {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [filter, setFilter] = useState('*');
  const [recurse, setRecurse] = useState(false);
  const [reportOnly, setReportOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FileShareScanResult | null>(null);
  const [search, setSearch] = useState('');

  const handleScan = async () => {
    if (!path.trim()) { setError('Path is required.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<FileShareScanResult>('Get-SLFileShareScan', {
        Path: path,
        Filter: filter.trim() && filter !== '*' ? filter : undefined,
        Recurse: recurse || undefined,
        ReportOnly: reportOnly || undefined,
      });
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed to scan');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const filteredDetails = result?.Details?.filter((d) =>
    d.FileName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Scan File Share</h3>
        <p className="text-xs text-zinc-500">Scan a directory for sensitive content and label status.</p>
      </div>

      <div className="space-y-3">
        <TextField label="Directory Path" value={path} onChange={setPath} placeholder="\\\\server\\share\\folder or Z:\\folder" required />
        <TextField label="Filter" value={filter} onChange={setFilter} placeholder="*" helpText="File filter pattern" />
        <div className="flex gap-6">
          <ToggleField label="Recurse" checked={recurse} onChange={setRecurse} helpText="Include subdirectories" />
          <ToggleField label="Report Only" checked={reportOnly} onChange={setReportOnly} helpText="Report without label recommendations" />
        </div>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <button onClick={handleScan} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
        {loading ? 'Scanning...' : 'Start Scan'}
      </button>

      {result && (
        <div className="space-y-4 pt-2">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.03] rounded-xl p-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Total Files" value={result.TotalFiles} />
                <Stat label="Supported" value={result.SupportedFiles} />
                <Stat label="Labeled" value={result.LabeledFiles} color="green" />
                <Stat label="Unlabeled" value={result.UnlabeledFiles} color="yellow" />
              </div>
              <div className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-zinc-500">
                Duration: {result.ScanDuration}
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3">
              <h4 className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">By Label</h4>
              {Object.keys(result.FilesByLabel).length > 0 ? (
                <div className="space-y-0.5">
                  {Object.entries(result.FilesByLabel).map(([label, count]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-zinc-300 truncate">{label}</span>
                      <span className="text-zinc-500 ml-2">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">No labeled files found</p>
              )}
            </div>
          </div>

          {/* File details */}
          <div className="bg-white/[0.03] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Scan Details ({filteredDetails.length})</h4>
              <input
                type="text"
                placeholder="Filter files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-2 py-1 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-300 placeholder-gray-600 w-48"
              />
            </div>
            <div className="space-y-1 max-h-96 overflow-auto">
              {filteredDetails.slice(0, 100).map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-white/[0.06] rounded-lg text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="text-zinc-200 truncate block">{d.FileName}</span>
                    <span className="text-zinc-500">{d.Extension} &middot; {d.SizeKB} KB</span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {d.ScanStatus === 'Failed' ? (
                      <span className="px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded-lg text-[10px]">Failed</span>
                    ) : d.IsLabeled ? (
                      <span className="px-1.5 py-0.5 bg-green-900/30 text-emerald-400 rounded-lg text-[10px]">{d.LabelName}</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400 rounded-lg text-[10px]">Unlabeled</span>
                    )}
                    {d.IsProtected && <span className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded-lg text-[10px]">Protected</span>}
                  </div>
                </div>
              ))}
              {filteredDetails.length > 100 && (
                <p className="text-xs text-zinc-500 text-center py-2">Showing 100 of {filteredDetails.length} files</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass = color === 'green' ? 'text-emerald-400' : color === 'yellow' ? 'text-yellow-400' : 'text-zinc-200';
  return (
    <div>
      <div className={`text-sm font-bold ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}
