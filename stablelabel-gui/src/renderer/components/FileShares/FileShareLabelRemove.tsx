import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, ToggleField } from '../common/FormFields';

export default function FileShareLabelRemove() {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [justification, setJustification] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!path.trim()) { setError('File path is required.'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try {
      const r = await invoke('Remove-SLFileShareLabel', {
        Path: path,
        Justification: justification.trim() || undefined,
        DryRun: dryRun || undefined,
      });
      if (r.success) setSuccess(dryRun ? 'Dry run complete — no changes made.' : 'Label removed successfully.');
      else setError(r.error ?? 'Failed to remove label');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Remove Label from File</h3>
        <p className="text-xs text-zinc-500">Remove the sensitivity label from a file on a CIFS/SMB share.</p>
      </div>

      <TextField label="File Path" value={path} onChange={setPath} placeholder="\\\\server\\share\\file.docx or Z:\\file.docx" required />
      <TextArea label="Justification" value={justification} onChange={setJustification} placeholder="Reason for removing this label..." />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation without making changes." />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}
      {success && <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg text-sm text-green-300">{success}</div>}

      <button onClick={handleRemove} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 rounded-lg transition-colors">
        {loading ? 'Removing...' : dryRun ? 'Dry Run — Remove Label' : 'Remove Label'}
      </button>
    </div>
  );
}
