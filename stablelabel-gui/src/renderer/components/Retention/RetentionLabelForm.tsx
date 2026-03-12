import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, SelectField, NumberField, FormActions } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';
import type { RetentionLabel } from '../../lib/types';

interface Props {
  existing?: RetentionLabel | null;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

const actionOptions = [
  { value: 'Keep', label: 'Retain forever' },
  { value: 'Delete', label: 'Delete after period' },
  { value: 'KeepAndDelete', label: 'Retain then delete' },
];

const typeOptions = [
  { value: 'CreationAgeInDays', label: 'From creation date' },
  { value: 'ModificationAgeInDays', label: 'From last modified date' },
  { value: 'TaggedAgeInDays', label: 'From when labeled' },
];

export default function RetentionLabelForm({ existing, onSaved, onCancel, onDeleted }: Props) {
  const { invoke } = usePowerShell();
  const isNew = !existing;

  const [name, setName] = useState(existing?.Name ?? '');
  const [comment, setComment] = useState(existing?.Comment ?? '');
  const [retentionDuration, setRetentionDuration] = useState<number | ''>(existing?.RetentionDuration ?? '');
  const [retentionAction, setRetentionAction] = useState(existing?.RetentionAction ?? '');
  const [retentionType, setRetentionType] = useState(existing?.RetentionType ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Label name is required.'); return; }
    setSaving(true);
    setError(null);

    try {
      let cmd: string;
      if (isNew) {
        const parts = [`New-SLRetentionLabel -Name '${esc(name)}'`];
        if (comment.trim()) parts.push(`-Comment '${esc(comment)}'`);
        if (retentionDuration !== '') parts.push(`-RetentionDuration ${retentionDuration}`);
        if (retentionAction) parts.push(`-RetentionAction '${retentionAction}'`);
        if (retentionType) parts.push(`-RetentionType '${retentionType}'`);
        parts.push('-Confirm:$false');
        cmd = parts.join(' ');
      } else {
        const parts = [`Set-SLRetentionLabel -Identity '${esc(existing!.Name)}'`];
        if (comment !== (existing!.Comment ?? '')) parts.push(`-Comment '${esc(comment)}'`);
        if (retentionDuration !== '' && retentionDuration !== existing!.RetentionDuration) parts.push(`-RetentionDuration ${retentionDuration}`);
        parts.push('-Confirm:$false');
        cmd = parts.join(' ');
      }

      const result = await invoke(cmd);
      if (result.success) onSaved(name);
      else setError(result.error ?? 'Operation failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    try {
      const result = await invoke(`Remove-SLRetentionLabel -Identity '${esc(existing.Name)}' -Confirm:$false`);
      if (result.success) onDeleted?.();
      else setError(result.error ?? 'Delete failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
    setDeleting(false);
    setShowDelete(false);
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">{isNew ? 'New Retention Label' : `Edit: ${existing!.Name}`}</h2>
        <p className="text-sm text-gray-500 mt-1">{isNew ? 'Define how long content should be retained and what happens after.' : 'Modify this retention label.'}</p>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      <TextField label="Label Name" value={name} onChange={setName} required disabled={!isNew} placeholder="e.g., Financial Records - 7 Year" />
      <TextArea label="Comment" value={comment} onChange={setComment} placeholder="Describe the retention requirement..." />

      <div className="border-t border-gray-800 pt-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Retention Settings</h3>
        <div className="grid grid-cols-3 gap-4">
          <NumberField label="Duration (days)" value={retentionDuration} onChange={setRetentionDuration} min={0} placeholder="e.g., 2555" helpText="Leave empty for unlimited" disabled={!isNew} />
          <SelectField label="Action" value={retentionAction} onChange={setRetentionAction} options={actionOptions} helpText="What happens when the period expires" disabled={!isNew} />
          <SelectField label="Based On" value={retentionType} onChange={setRetentionType} options={typeOptions} helpText="When the retention period starts" disabled={!isNew} />
        </div>
        {!isNew && <p className="text-xs text-gray-600 mt-2">Retention duration, action, and type cannot be changed after creation. Create a new label instead.</p>}
      </div>

      <FormActions onSave={handleSave} onCancel={onCancel} onDelete={existing ? () => setShowDelete(true) : undefined} saving={saving} saveLabel={isNew ? 'Create Label' : 'Save Changes'} isNew={isNew} />

      {showDelete && (
        <ConfirmDialog
          title="Delete Retention Label"
          message={`Permanently delete "${existing!.Name}"? Content currently using this label will retain the label but new content cannot use it.`}
          confirmLabel="Delete Label"
          variant="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
