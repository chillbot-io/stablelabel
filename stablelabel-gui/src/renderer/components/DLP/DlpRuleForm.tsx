import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, ToggleField, TagInput, FormActions } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';
import type { DlpRule } from '../../lib/types';

interface Props { existing?: DlpRule | null; onSaved: (name: string) => void; onCancel: () => void; onDeleted?: () => void; }

export default function DlpRuleForm({ existing, onSaved, onCancel, onDeleted }: Props) {
  const { invoke } = usePowerShell();
  const isNew = !existing;
  const [name, setName] = useState(existing?.Name ?? '');
  const [policy, setPolicy] = useState(existing?.Policy ?? '');
  const [comment, setComment] = useState(existing?.Comment ?? '');
  const [blockAccess, setBlockAccess] = useState(existing?.BlockAccess ?? false);
  const [notifyUser, setNotifyUser] = useState<string[]>(existing?.NotifyUser?.filter(Boolean) ?? []);
  const [generateAlert, setGenerateAlert] = useState<string[]>(existing?.GenerateAlert?.filter(Boolean) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Rule name is required.'); return; }
    if (isNew && !policy.trim()) { setError('Parent policy is required.'); return; }
    setSaving(true); setError(null);
    try {
      let r;
      if (isNew) {
        r = await invoke('New-SLDlpRule', {
          Name: name,
          Policy: policy,
          Comment: comment.trim() || undefined,
          BlockAccess: blockAccess,
          NotifyUser: notifyUser.length ? notifyUser : undefined,
          GenerateAlert: generateAlert.length ? generateAlert : undefined,
        });
      } else {
        r = await invoke('Set-SLDlpRule', {
          Identity: existing!.Name,
          Comment: comment !== (existing!.Comment ?? '') ? comment : undefined,
          BlockAccess: blockAccess !== existing!.BlockAccess ? blockAccess : undefined,
        });
      }
      if (r.success) onSaved(name); else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const r = await invoke('Remove-SLDlpRule', { Identity: existing.Name });
      if (r.success) onDeleted?.(); else setError(r.error ?? 'Delete failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setDeleting(false); setShowDelete(false);
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div><h2 className="text-xl font-bold text-white">{isNew ? 'New DLP Rule' : `Edit: ${existing!.Name}`}</h2><p className="text-sm text-zinc-500 mt-1">{isNew ? 'Define what sensitive content to detect and what action to take.' : 'Modify this DLP rule.'}</p></div>
      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}
      <TextField label="Rule Name" value={name} onChange={setName} required disabled={!isNew} placeholder="e.g., Block Credit Card Sharing" />
      <TextField label="Parent Policy" value={policy} onChange={setPolicy} required disabled={!isNew} placeholder="e.g., PII Protection Policy" helpText="The DLP policy this rule belongs to." />
      <TextArea label="Comment" value={comment} onChange={setComment} placeholder="Describe what this rule detects..." />

      <div className="border-t border-white/[0.06] pt-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Actions</h3>
        <div className="space-y-4">
          <ToggleField label="Block Access" checked={blockAccess} onChange={setBlockAccess} helpText="Prevent users from accessing content that matches this rule." />
          <TagInput label="Notify Users" values={notifyUser} onChange={setNotifyUser} placeholder="Email addresses..." helpText="Users to notify when a match is found." disabled={!isNew} />
          <TagInput label="Generate Alert" values={generateAlert} onChange={setGenerateAlert} placeholder="Email addresses..." helpText="Admins to alert when a match is found." disabled={!isNew} />
        </div>
      </div>

      <FormActions onSave={handleSave} onCancel={onCancel} onDelete={existing ? () => setShowDelete(true) : undefined} saving={saving} saveLabel={isNew ? 'Create Rule' : 'Save Changes'} isNew={isNew} />
      {showDelete && <ConfirmDialog title="Delete DLP Rule" message={`Permanently delete "${existing!.Name}"? This rule will no longer detect or act on sensitive content.`} confirmLabel="Delete Rule" variant="danger" loading={deleting} onConfirm={handleDelete} onCancel={() => setShowDelete(false)} />}
    </div>
  );
}
