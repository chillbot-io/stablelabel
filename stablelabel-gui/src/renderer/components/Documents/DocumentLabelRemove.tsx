import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, ToggleField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';

export default function DocumentLabelRemove() {
  const { invoke } = usePowerShell();
  const [driveId, setDriveId] = useState('');
  const [itemId, setItemId] = useState('');
  const [justification, setJustification] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRemove = async () => {
    setShowConfirm(false);
    setLoading(true); setError(null); setSuccess(null);
    try {
      const parts = [`Remove-SLDocumentLabel -DriveId '${esc(driveId)}' -ItemId '${esc(itemId)}'`];
      if (justification.trim()) parts.push(`-Justification '${esc(justification)}'`);
      if (dryRun) parts.push('-DryRun');
      parts.push('-Confirm:$false');

      const r = await invoke(parts.join(' '));
      if (r.success) setSuccess(dryRun ? 'Dry run complete — no changes made.' : 'Label removed successfully.');
      else setError(r.error ?? 'Failed to remove label');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const handleClick = () => {
    if (!driveId.trim() || !itemId.trim()) { setError('Drive ID and Item ID are required.'); return; }
    if (dryRun) { handleRemove(); return; }
    setShowConfirm(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Remove Document Label</h3>
        <p className="text-xs text-zinc-500">Remove the sensitivity label from a specific document via Graph API.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Drive ID" value={driveId} onChange={setDriveId} placeholder="b!abc123..." required />
        <TextField label="Item ID" value={itemId} onChange={setItemId} placeholder="01ABC123DEF..." required />
      </div>

      <TextArea label="Justification" value={justification} onChange={setJustification} placeholder="Reason for removing the label..." />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation without making changes." />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}
      {success && <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg text-sm text-green-300">{success}</div>}

      <button onClick={handleClick} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 rounded-lg transition-colors">
        {loading ? 'Removing...' : dryRun ? 'Dry Run — Remove Label' : 'Remove Label'}
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Remove Document Label"
          message={`Remove the sensitivity label from item "${itemId}" in drive "${driveId}"? This action may affect data protection.`}
          confirmLabel="Remove Label"
          variant="danger"
          loading={loading}
          onConfirm={handleRemove}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
