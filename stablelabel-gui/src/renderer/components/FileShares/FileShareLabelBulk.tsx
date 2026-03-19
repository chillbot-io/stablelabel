import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { TextField, TextArea, ToggleField } from '../common/FormFields';
import type { FileShareBulkResult } from '../../lib/types';

export default function FileShareLabelBulk() {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelId, setLabelId] = useState('');
  const [filter, setFilter] = useState('*.docx,*.xlsx,*.pptx,*.pdf');
  const [recurse, setRecurse] = useState(false);
  const [justification, setJustification] = useState('');
  const [owner, setOwner] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const elapsed = useElapsedTime(loading);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FileShareBulkResult | null>(null);

  const handleBulk = async () => {
    if (!path.trim()) { setError('Directory path is required.'); return; }
    if (!labelName.trim() && !labelId.trim()) { setError('Either Label Name or Label ID is required.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<FileShareBulkResult>('Set-SLFileShareLabelBulk', {
        Path: path,
        LabelId: labelId.trim() || undefined,
        LabelName: labelName.trim() || undefined,
        Filter: filter.trim() || undefined,
        Recurse: recurse || undefined,
        Justification: justification.trim() || undefined,
        Owner: owner.trim() || undefined,
        DryRun: dryRun || undefined,
      });
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Bulk operation failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Bulk Apply Labels</h3>
        <p className="text-xs text-zinc-500">Apply a sensitivity label to multiple files in a directory.</p>
      </div>

      <TextField label="Directory Path" value={path} onChange={setPath} placeholder="\\\\server\\share\\folder or Z:\\folder" required />

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Label Name" value={labelName} onChange={setLabelName} placeholder="e.g., Confidential" disabled={!!labelId.trim()} />
        <TextField label="Label ID (GUID)" value={labelId} onChange={setLabelId} placeholder="00000000-0000-..." disabled={!!labelName.trim()} />
      </div>

      <TextField label="File Filter" value={filter} onChange={setFilter} placeholder="*.docx,*.xlsx,*.pptx,*.pdf" helpText="Comma-separated file patterns" />
      <TextField label="Owner" value={owner} onChange={setOwner} placeholder="user@contoso.com" helpText="Optional. Owner email for the label." />
      <TextArea label="Justification" value={justification} onChange={setJustification} placeholder="Reason for bulk label assignment..." />

      <div className="flex gap-6">
        <ToggleField label="Recurse" checked={recurse} onChange={setRecurse} helpText="Include subdirectories" />
        <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate without making changes" />
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <div className="flex items-center gap-3">
        <button onClick={handleBulk} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
          {loading ? 'Processing...' : dryRun ? 'Dry Run — Bulk Apply' : 'Bulk Apply Labels'}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {elapsed || 'Starting...'}
          </span>
        )}
      </div>

      {result && (
        <div className="space-y-3 pt-2">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total" value={result.TotalFiles} />
            <StatCard label="Success" value={result.SuccessCount} color="green" />
            <StatCard label="Failed" value={result.FailedCount} color="red" />
            <StatCard label="Skipped" value={result.SkippedCount} color="yellow" />
          </div>

          {result.DryRun && (
            <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-lg text-xs text-blue-300">
              Dry run complete — no changes were made.
            </div>
          )}

          {/* Results */}
          {result.Results && result.Results.length > 0 && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Results</h4>
              <div className="space-y-1 max-h-64 overflow-auto">
                {result.Results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/[0.06] rounded-lg text-xs">
                    <span className="text-zinc-300 truncate flex-1">{r.Path}</span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded-lg text-[10px] ${
                      r.Status === 'Success' || r.Status === 'DryRun'
                        ? 'bg-green-900/30 text-emerald-400'
                        : 'bg-red-900/30 text-red-400'
                    }`}>
                      {r.Status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass = color === 'green' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-blue-400';
  return (
    <div className="bg-white/[0.03] rounded-xl p-2 text-center">
      <div className={`text-sm font-bold ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}
