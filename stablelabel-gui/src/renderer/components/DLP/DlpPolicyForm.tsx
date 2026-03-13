import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, SelectField, TagInput, FormActions } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';
import type { DlpPolicy } from '../../lib/types';

interface Props { existing?: DlpPolicy | null; onSaved: (name: string) => void; onCancel: () => void; onDeleted?: () => void; }

const modeOptions = [
  { value: 'TestWithoutNotifications', label: 'Test (silent)' },
  { value: 'TestWithNotifications', label: 'Test + Notifications' },
  { value: 'Enable', label: 'Enforcing' },
];

export default function DlpPolicyForm({ existing, onSaved, onCancel, onDeleted }: Props) {
  const { invoke } = usePowerShell();
  const isNew = !existing;
  const [name, setName] = useState(existing?.Name ?? '');
  const [comment, setComment] = useState(existing?.Comment ?? '');
  const [mode, setMode] = useState(existing?.Mode ?? 'TestWithoutNotifications');
  const [exchangeLocation, setExchangeLocation] = useState<string[]>(existing?.ExchangeLocation?.filter(Boolean) ?? []);
  const [sharePointLocation, setSharePointLocation] = useState<string[]>(existing?.SharePointLocation?.filter(Boolean) ?? []);
  const [oneDriveLocation, setOneDriveLocation] = useState<string[]>(existing?.OneDriveLocation?.filter(Boolean) ?? []);
  const [teamsLocation, setTeamsLocation] = useState<string[]>(existing?.TeamsLocation?.filter(Boolean) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Policy name is required.'); return; }
    setSaving(true); setError(null);
    try {
      let cmd: string;
      if (isNew) {
        const p = [`New-SLDlpPolicy -Name '${esc(name)}'`];
        if (comment.trim()) p.push(`-Comment '${esc(comment)}'`);
        if (mode) p.push(`-Mode '${mode}'`);
        if (exchangeLocation.length) p.push(`-ExchangeLocation ${fa(exchangeLocation)}`);
        if (sharePointLocation.length) p.push(`-SharePointLocation ${fa(sharePointLocation)}`);
        if (oneDriveLocation.length) p.push(`-OneDriveLocation ${fa(oneDriveLocation)}`);
        if (teamsLocation.length) p.push(`-TeamsLocation ${fa(teamsLocation)}`);
        p.push('-Confirm:$false');
        cmd = p.join(' ');
      } else {
        const p = [`Set-SLDlpPolicy -Identity '${esc(existing!.Name)}'`];
        if (comment !== (existing!.Comment ?? '')) p.push(`-Comment '${esc(comment)}'`);
        if (mode !== existing!.Mode) p.push(`-Mode '${mode}'`);
        p.push('-Confirm:$false');
        cmd = p.join(' ');
      }
      const r = await invoke(cmd);
      if (r.success) onSaved(name); else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const r = await invoke(`Remove-SLDlpPolicy -Identity '${esc(existing.Name)}' -Confirm:$false`);
      if (r.success) onDeleted?.(); else setError(r.error ?? 'Delete failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setDeleting(false); setShowDelete(false);
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div><h2 className="text-xl font-bold text-white">{isNew ? 'New DLP Policy' : `Edit: ${existing!.Name}`}</h2><p className="text-sm text-gray-500 mt-1">{isNew ? 'Create a Data Loss Prevention policy to protect sensitive information.' : 'Modify this DLP policy.'}</p></div>
      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}
      <TextField label="Policy Name" value={name} onChange={setName} required disabled={!isNew} placeholder="e.g., PII Protection Policy" />
      <TextArea label="Comment" value={comment} onChange={setComment} placeholder="Describe what this policy protects against..." />
      <SelectField label="Mode" value={mode} onChange={setMode} options={modeOptions} helpText="Start in test mode to evaluate impact before enforcing." />
      <div className="border-t border-gray-800 pt-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Scope Locations</h3>
        <div className="space-y-4">
          <TagInput label="Exchange" values={exchangeLocation} onChange={setExchangeLocation} placeholder="'All' or specific addresses..." disabled={!isNew} />
          <TagInput label="SharePoint" values={sharePointLocation} onChange={setSharePointLocation} placeholder="'All' or site URLs..." disabled={!isNew} />
          <TagInput label="OneDrive" values={oneDriveLocation} onChange={setOneDriveLocation} placeholder="'All' or site URLs..." disabled={!isNew} />
          <TagInput label="Teams" values={teamsLocation} onChange={setTeamsLocation} placeholder="'All' or group names..." disabled={!isNew} />
        </div>
        {!isNew && <p className="text-xs text-gray-600 mt-2">Location scoping is set during creation. Use Add/Remove location parameters in PowerShell.</p>}
      </div>
      <FormActions onSave={handleSave} onCancel={onCancel} onDelete={existing ? () => setShowDelete(true) : undefined} saving={saving} saveLabel={isNew ? 'Create Policy' : 'Save Changes'} isNew={isNew} />
      {showDelete && <ConfirmDialog title="Delete DLP Policy" message={`Permanently delete "${existing!.Name}"? All rules in this policy will also be removed.`} confirmLabel="Delete Policy" variant="danger" loading={deleting} onConfirm={handleDelete} onCancel={() => setShowDelete(false)} />}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
function fa(a: string[]) { return a.map(v => `'${esc(v)}'`).join(','); }
