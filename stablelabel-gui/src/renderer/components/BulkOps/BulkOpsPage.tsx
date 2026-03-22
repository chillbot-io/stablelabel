import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { TextArea, TextField, ToggleField } from '../common/FormFields';
import BulkResultSummary from '../common/BulkResultSummary';
import ConfirmDialog from '../common/ConfirmDialog';
import ShowPowerShell from '../common/ShowPowerShell';
import type { BulkRemoveResult } from '../../lib/types';

type RemovalMode = 'LabelOnly' | 'EncryptionOnly' | 'Both';

const modeOptions: Array<{ id: RemovalMode; label: string; description: string }> = [
  { id: 'LabelOnly', label: 'Remove Label Only', description: 'Strip the sensitivity label but keep encryption if present' },
  { id: 'EncryptionOnly', label: 'Remove Encryption Only', description: 'Strip RMS protection but keep the label metadata' },
  { id: 'Both', label: 'Remove Label + Encryption', description: 'Full strip — remove both the label and any protection' },
];

export default function BulkOpsPage() {
  const { invoke } = usePowerShell();
  const [mode, setMode] = useState<RemovalMode>('LabelOnly');
  const [itemsText, setItemsText] = useState('');
  const [justification, setJustification] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const elapsed = useElapsedTime(loading);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkRemoveResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const parseItems = (): Array<{ DriveId: string; ItemId: string }> | null => {
    const text = itemsText.trim();
    if (!text) return null;

    // Try JSON array first
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item.DriveId || !item.ItemId) return null;
        }
        return parsed;
      }
    } catch {
      // Not JSON — try CSV-style (one DriveId,ItemId per line)
    }

    // Try CSV: DriveId,ItemId per line
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.toLowerCase().startsWith('driveid'));
    if (lines.length === 0) return null;
    const items: Array<{ DriveId: string; ItemId: string }> = [];
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        items.push({ DriveId: parts[0], ItemId: parts[1] });
      } else {
        return null;
      }
    }
    return items.length > 0 ? items : null;
  };

  const handleClick = () => {
    const items = parseItems();
    if (!items || items.length === 0) {
      setError('Provide items as JSON array or CSV (DriveId,ItemId per line).');
      return;
    }
    if (!dryRun) {
      setShowConfirm(true);
    } else {
      handleRemove();
    }
  };

  const handleRemove = async () => {
    setShowConfirm(false);
    const items = parseItems();
    if (!items || items.length === 0) {
      setError('Provide items as JSON array or CSV (DriveId,ItemId per line).');
      return;
    }

    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<BulkRemoveResult>('Remove-SLDocumentLabelBulk', {
        Items: items,
        Mode: mode,
        Justification: justification.trim() || undefined,
        DryRun: dryRun || undefined,
      });
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Bulk removal failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Bulk Operations</h2>
        <p className="text-sm text-zinc-500 mt-1">Remove labels, encryption, or both from multiple documents.</p>
      </div>

      {/* Mode selector */}
      <div>
        <label className="block text-[12px] font-medium text-zinc-400 mb-2">Removal Mode</label>
        <div className="space-y-2">
          {modeOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                mode === opt.id
                  ? 'border-blue-500/40 bg-blue-500/[0.08]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <div className={`text-sm font-medium ${mode === opt.id ? 'text-blue-400' : 'text-zinc-300'}`}>
                {opt.label}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Items input */}
      <TextArea
        label="Items"
        value={itemsText}
        onChange={setItemsText}
        placeholder={'Paste JSON array or CSV (DriveId,ItemId per line):\n\nb!abc123,01ABC\nb!abc123,02DEF\n\nor\n\n[{"DriveId":"b!abc","ItemId":"01A"}]'}
        helpText="JSON array of {DriveId, ItemId} objects, or one DriveId,ItemId pair per line."
        rows={6}
      />

      <TextField label="Justification" value={justification} onChange={setJustification} placeholder="Reason for removal..." />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate without making changes. Recommended first." />

      <ShowPowerShell
        cmdlet="Remove-SLDocumentLabelBulk"
        params={{ Items: parseItems() ?? [], Mode: mode, Justification: justification.trim() || undefined, DryRun: dryRun || undefined }}
      />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <div className="flex items-center gap-3">
        <button onClick={handleClick} disabled={loading} className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
          dryRun ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500'
        }`}>
          {loading ? 'Processing...' : dryRun ? `Dry Run — ${modeOptions.find(m => m.id === mode)?.label}` : modeOptions.find(m => m.id === mode)?.label}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {elapsed || 'Starting...'}
          </span>
        )}
      </div>

      {result && <BulkResultSummary result={result} subtitle={result.Mode} />}

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Bulk Removal"
          message={`This will ${modeOptions.find(m => m.id === mode)?.label.toLowerCase()} on ${parseItems()?.length ?? 0} documents. This cannot be undone. Run a dry run first if you haven't already.`}
          confirmLabel={modeOptions.find(m => m.id === mode)?.label ?? 'Proceed'}
          variant="danger"
          onConfirm={handleRemove}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
