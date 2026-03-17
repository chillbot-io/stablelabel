import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, ToggleField, TagInput, FormActions } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';
import type { RetentionPolicy } from '../../lib/types';

interface Props {
  existing?: RetentionPolicy | null;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export default function RetentionPolicyForm({ existing, onSaved, onCancel, onDeleted }: Props) {
  const { invoke } = usePowerShell();
  const isNew = !existing;

  const [name, setName] = useState(existing?.Name ?? '');
  const [comment, setComment] = useState(existing?.Comment ?? '');
  const [enabled, setEnabled] = useState(existing?.Enabled ?? true);
  const [exchangeLocation, setExchangeLocation] = useState<string[]>(existing?.ExchangeLocation?.filter(Boolean) ?? []);
  const [sharePointLocation, setSharePointLocation] = useState<string[]>(existing?.SharePointLocation?.filter(Boolean) ?? []);
  const [oneDriveLocation, setOneDriveLocation] = useState<string[]>(existing?.OneDriveLocation?.filter(Boolean) ?? []);
  const [modernGroupLocation, setModernGroupLocation] = useState<string[]>(existing?.ModernGroupLocation?.filter(Boolean) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Policy name is required.'); return; }
    setSaving(true);
    setError(null);

    try {
      let result;
      if (isNew) {
        result = await invoke('New-SLRetentionPolicy', {
          Name: name,
          Comment: comment.trim() || undefined,
          Enabled: enabled,
          ExchangeLocation: exchangeLocation.length ? exchangeLocation : undefined,
          SharePointLocation: sharePointLocation.length ? sharePointLocation : undefined,
          OneDriveLocation: oneDriveLocation.length ? oneDriveLocation : undefined,
          ModernGroupLocation: modernGroupLocation.length ? modernGroupLocation : undefined,
        });
      } else {
        result = await invoke('Set-SLRetentionPolicy', {
          Identity: existing!.Name,
          Comment: comment !== (existing!.Comment ?? '') ? comment : undefined,
          Enabled: enabled !== existing!.Enabled ? enabled : undefined,
        });
      }

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
      const result = await invoke('Remove-SLRetentionPolicy', { Identity: existing.Name });
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
        <h2 className="text-xl font-bold text-white">{isNew ? 'New Retention Policy' : `Edit: ${existing!.Name}`}</h2>
        <p className="text-sm text-zinc-500 mt-1">{isNew ? 'Create a policy that applies retention settings to locations.' : 'Modify this retention policy.'}</p>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <TextField label="Policy Name" value={name} onChange={setName} required disabled={!isNew} placeholder="e.g., Exchange 7-Year Retention" />
      <TextArea label="Comment" value={comment} onChange={setComment} placeholder="Describe the retention requirement..." />
      <ToggleField label="Enabled" checked={enabled} onChange={setEnabled} helpText="Disabled policies are not enforced." />

      <div className="border-t border-white/[0.06] pt-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Scope Locations</h3>
        <div className="space-y-4">
          <TagInput label="Exchange" values={exchangeLocation} onChange={setExchangeLocation} placeholder="'All' or specific addresses..." disabled={!isNew} />
          <TagInput label="SharePoint" values={sharePointLocation} onChange={setSharePointLocation} placeholder="'All' or site URLs..." disabled={!isNew} />
          <TagInput label="OneDrive" values={oneDriveLocation} onChange={setOneDriveLocation} placeholder="'All' or site URLs..." disabled={!isNew} />
          <TagInput label="M365 Groups" values={modernGroupLocation} onChange={setModernGroupLocation} placeholder="'All' or group URLs..." disabled={!isNew} />
        </div>
        {!isNew && <p className="text-xs text-zinc-600 mt-2">Location scoping can only be set during creation. Use Add/Remove location parameters in PowerShell.</p>}
      </div>

      <FormActions onSave={handleSave} onCancel={onCancel} onDelete={existing ? () => setShowDelete(true) : undefined} saving={saving} saveLabel={isNew ? 'Create Policy' : 'Save Changes'} isNew={isNew} />

      {showDelete && (
        <ConfirmDialog
          title="Delete Retention Policy"
          message={`Permanently delete "${existing!.Name}"? Retention settings will no longer be enforced at the configured locations.`}
          confirmLabel="Delete Policy"
          variant="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
