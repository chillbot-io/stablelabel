import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { TextField, TextArea, ToggleField } from '../common/FormFields';
import type { BulkLabelResult } from '../../lib/types';

export default function DocumentLabelBulk() {
  const { invoke } = usePowerShell();
  const [itemsText, setItemsText] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelId, setLabelId] = useState('');
  const [justification, setJustification] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const elapsed = useElapsedTime(loading);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkLabelResult | null>(null);

  const parseItems = (): Array<{ DriveId: string; ItemId: string }> | null => {
    try {
      const parsed = JSON.parse(itemsText.trim());
      if (!Array.isArray(parsed)) return null;
      for (const item of parsed) {
        if (!item.DriveId || !item.ItemId) return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const handleBulk = async () => {
    if (!labelName.trim() && !labelId.trim()) { setError('Either Label Name or Label ID is required.'); return; }
    const items = parseItems();
    if (!items || items.length === 0) { setError('Items must be a JSON array of objects with DriveId and ItemId.'); return; }

    setLoading(true); setError(null); setResult(null);
    try {
      // Build inline hashtable array for PowerShell
      const hashEntries = items.map(i => `@{DriveId='${esc(i.DriveId)}';ItemId='${esc(i.ItemId)}'}`).join(',');
      const parts = [`Set-SLDocumentLabelBulk -Items @(${hashEntries})`];
      if (labelId.trim()) parts.push(`-LabelId '${esc(labelId)}'`);
      else parts.push(`-LabelName '${esc(labelName)}'`);
      if (justification.trim()) parts.push(`-Justification '${esc(justification)}'`);
      if (dryRun) parts.push('-DryRun');
      parts.push('-Confirm:$false');

      const r = await invoke<BulkLabelResult>(parts.join(' '));
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Bulk operation failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Bulk Apply Labels</h3>
        <p className="text-xs text-gray-500">Assign a sensitivity label to multiple documents at once. Dry run is enabled by default.</p>
      </div>

      <TextArea
        label="Items (JSON Array)"
        value={itemsText}
        onChange={setItemsText}
        placeholder={'[\n  { "DriveId": "b!abc123", "ItemId": "01ABC" },\n  { "DriveId": "b!abc123", "ItemId": "02DEF" }\n]'}
        helpText="Paste a JSON array of objects, each with DriveId and ItemId."
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Label Name" value={labelName} onChange={setLabelName} placeholder="e.g., Confidential" disabled={!!labelId.trim()} />
        <TextField label="Label ID (GUID)" value={labelId} onChange={setLabelId} placeholder="00000000-0000-..." disabled={!!labelName.trim()} />
      </div>

      <TextField label="Justification" value={justification} onChange={setJustification} placeholder="Reason for bulk label assignment..." />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation. Recommended before running for real." />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      <div className="flex items-center gap-3">
        <button onClick={handleBulk} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
          {loading ? 'Processing...' : dryRun ? 'Dry Run — Bulk Apply' : 'Bulk Apply Labels'}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {elapsed || 'Starting...'}
          </span>
        )}
      </div>

      {result && <BulkResult result={result} />}
    </div>
  );
}

function BulkResult({ result }: { result: BulkLabelResult }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {result.DryRun ? 'Dry Run Results' : 'Results'}
      </h4>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded p-2.5">
          <dt className="text-xs text-gray-500">Total</dt>
          <dd className="text-lg font-bold text-gray-200">{result.TotalItems}</dd>
        </div>
        <div className="bg-gray-800 rounded p-2.5">
          <dt className="text-xs text-gray-500">Succeeded</dt>
          <dd className="text-lg font-bold text-green-400">{result.SuccessCount}</dd>
        </div>
        <div className="bg-gray-800 rounded p-2.5">
          <dt className="text-xs text-gray-500">Failed</dt>
          <dd className={`text-lg font-bold ${result.FailedCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>{result.FailedCount}</dd>
        </div>
      </div>

      {result.Results && result.Results.length > 0 && (
        <div>
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-gray-500 hover:text-gray-300">
            {showDetails ? '▾ Hide' : '▸ Show'} item details
          </button>
          {showDetails && (
            <div className="mt-2 space-y-1 max-h-48 overflow-auto">
              {result.Results.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-gray-800 rounded text-xs">
                  <span className="text-gray-400 font-mono truncate">{item.DriveId}/{item.ItemId}</span>
                  <span className={`px-1.5 py-0.5 rounded ${item.Status === 'Failed' ? 'bg-red-500/10 text-red-400' : item.Status === 'DryRun' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
                    {item.Status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
