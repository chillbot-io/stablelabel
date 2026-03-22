import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { TextField, TextArea, ToggleField } from '../common/FormFields';
import type { BulkLabelResult } from '../../lib/types';
import BulkResultSummary from '../common/BulkResultSummary';
import ConfirmDialog from '../common/ConfirmDialog';
import ShowPowerShell from '../common/ShowPowerShell';

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
  const [showConfirm, setShowConfirm] = useState(false);

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

  const handleClick = () => {
    if (!labelName.trim() && !labelId.trim()) { setError('Either Label Name or Label ID is required.'); return; }
    const items = parseItems();
    if (!items || items.length === 0) { setError('Items must be a JSON array of objects with DriveId and ItemId.'); return; }
    if (!dryRun) { setShowConfirm(true); } else { handleBulk(); }
  };

  const handleBulk = async () => {
    setShowConfirm(false);
    if (!labelName.trim() && !labelId.trim()) { setError('Either Label Name or Label ID is required.'); return; }
    const items = parseItems();
    if (!items || items.length === 0) { setError('Items must be a JSON array of objects with DriveId and ItemId.'); return; }

    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<BulkLabelResult>('Set-SLDocumentLabelBulk', {
        Items: items,
        LabelId: labelId.trim() || undefined,
        LabelName: labelName.trim() || undefined,
        Justification: justification.trim() || undefined,
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
        <p className="text-xs text-zinc-500">Assign a sensitivity label to multiple documents at once. Dry run is enabled by default.</p>
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

      <ShowPowerShell
        cmdlet="Set-SLDocumentLabelBulk"
        params={{ Items: parseItems() ?? [], LabelId: labelId.trim() || undefined, LabelName: labelName.trim() || undefined, Justification: justification.trim() || undefined, DryRun: dryRun || undefined }}
      />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <div className="flex items-center gap-3">
        <button onClick={handleClick} disabled={loading} className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${dryRun ? 'bg-blue-600 hover:bg-blue-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
          {loading ? 'Processing...' : dryRun ? 'Dry Run — Bulk Apply' : 'Bulk Apply Labels'}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {elapsed || 'Starting...'}
          </span>
        )}
      </div>

      {result && <BulkResultSummary result={result} />}

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Bulk Label Apply"
          message={`This will apply label "${labelName.trim() || labelId.trim()}" to ${parseItems()?.length ?? 0} documents. Run a dry run first if you haven't already.`}
          confirmLabel="Apply Labels"
          variant="warning"
          onConfirm={handleBulk}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

