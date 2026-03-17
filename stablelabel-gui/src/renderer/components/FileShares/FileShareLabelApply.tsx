import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, ToggleField } from '../common/FormFields';

export default function FileShareLabelApply() {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelId, setLabelId] = useState('');
  const [justification, setJustification] = useState('');
  const [owner, setOwner] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleApply = async () => {
    if (!path.trim()) { setError('File path is required.'); return; }
    if (!labelName.trim() && !labelId.trim()) { setError('Either Label Name or Label ID is required.'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try {
      const r = await invoke('Set-SLFileShareLabel', {
        Path: path,
        LabelId: labelId.trim() || undefined,
        LabelName: labelName.trim() || undefined,
        Justification: justification.trim() || undefined,
        Owner: owner.trim() || undefined,
        DryRun: dryRun || undefined,
      });
      if (r.success) setSuccess(dryRun ? 'Dry run complete — no changes made.' : 'Label applied successfully.');
      else setError(r.error ?? 'Failed to apply label');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Apply Label to File</h3>
        <p className="text-xs text-zinc-500">Assign a sensitivity label to a single file on a CIFS/SMB share.</p>
      </div>

      <TextField label="File Path" value={path} onChange={setPath} placeholder="\\\\server\\share\\file.docx or Z:\\file.docx" required />

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Label Name" value={labelName} onChange={setLabelName} placeholder="e.g., Confidential" helpText="Resolved to ID automatically." disabled={!!labelId.trim()} />
        <TextField label="Label ID (GUID)" value={labelId} onChange={setLabelId} placeholder="00000000-0000-..." helpText="Use instead of name for exact match." disabled={!!labelName.trim()} />
      </div>

      <TextField label="Owner" value={owner} onChange={setOwner} placeholder="user@contoso.com" helpText="Optional. Owner email for the label." />
      <TextArea label="Justification" value={justification} onChange={setJustification} placeholder="Reason for applying this label..." />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation without making changes." />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}
      {success && <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg text-sm text-green-300">{success}</div>}

      <button onClick={handleApply} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
        {loading ? 'Applying...' : dryRun ? 'Dry Run — Apply Label' : 'Apply Label'}
      </button>
    </div>
  );
}
