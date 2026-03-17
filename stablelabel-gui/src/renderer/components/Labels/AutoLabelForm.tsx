import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, SelectField, TagInput, FormActions } from '../common/FormFields';
import type { AutoLabelPolicy } from '../../lib/types';

interface AutoLabelFormProps {
  existing?: AutoLabelPolicy | null;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

const modeOptions = [
  { value: 'TestWithoutNotifications', label: 'Simulation (silent)' },
  { value: 'TestWithNotifications', label: 'Simulation + Notifications' },
  { value: 'Enable', label: 'Enforcing (apply labels)' },
];

export default function AutoLabelForm({ existing, onSaved, onCancel, onDeleted }: AutoLabelFormProps) {
  const { invoke } = usePowerShell();
  const isNew = !existing;

  const [name, setName] = useState(existing?.Name ?? '');
  const [applySensitivityLabel, setApplySensitivityLabel] = useState(
    existing?.ApplySensitivityLabel ?? '',
  );
  const [mode, setMode] = useState(existing?.Mode ?? 'TestWithoutNotifications');
  const [comment, setComment] = useState(existing?.Comment ?? '');
  const [exchangeLocation, setExchangeLocation] = useState<string[]>(
    existing?.ExchangeLocation?.filter(Boolean) ?? [],
  );
  const [sharePointLocation, setSharePointLocation] = useState<string[]>(
    existing?.SharePointLocation?.filter(Boolean) ?? [],
  );
  const [oneDriveLocation, setOneDriveLocation] = useState<string[]>(
    existing?.OneDriveLocation?.filter(Boolean) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Policy name is required.');
      return;
    }
    if (!applySensitivityLabel.trim()) {
      setError('A sensitivity label to apply is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let result;
      if (isNew) {
        const params: Record<string, unknown> = {
          Name: name,
          ApplySensitivityLabel: applySensitivityLabel,
        };
        if (mode) params.Mode = mode;
        if (exchangeLocation.length > 0) params.ExchangeLocation = exchangeLocation;
        if (sharePointLocation.length > 0) params.SharePointLocation = sharePointLocation;
        if (oneDriveLocation.length > 0) params.OneDriveLocation = oneDriveLocation;
        result = await invoke('New-SLAutoLabelPolicy', params);
      } else {
        const params: Record<string, unknown> = { Identity: existing!.Name };
        if (mode !== existing!.Mode) params.Mode = mode;
        result = await invoke('Set-SLAutoLabelPolicy', params);
      }
      if (result.success) {
        onSaved(name);
      } else {
        setError(result.error ?? 'Operation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    setError(null);

    try {
      const result = await invoke('Remove-SLAutoLabelPolicy', { Identity: existing.Name });
      if (result.success) {
        onDeleted?.();
      } else {
        setError(result.error ?? 'Delete failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }

    setDeleting(false);
    setShowDelete(false);
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">
          {isNew ? 'New Auto-Label Policy' : `Edit: ${existing!.Name}`}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          {isNew
            ? 'Create a policy that automatically applies sensitivity labels to matching content.'
            : 'Modify this auto-labeling policy.'}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      <TextField
        label="Policy Name"
        value={name}
        onChange={setName}
        required
        disabled={!isNew}
        placeholder="e.g., PII Auto-Label"
      />

      <TextField
        label="Apply Sensitivity Label"
        value={applySensitivityLabel}
        onChange={setApplySensitivityLabel}
        required
        disabled={!isNew}
        placeholder="e.g., Confidential"
        helpText="The sensitivity label to apply when content matches. Enter label name or GUID."
      />

      <SelectField
        label="Mode"
        value={mode}
        onChange={setMode}
        options={modeOptions}
        helpText="Start in simulation mode to preview matches before enforcing."
      />

      {!isNew && (
        <TextArea
          label="Comment"
          value={comment}
          onChange={setComment}
          placeholder="Describe the purpose of this policy..."
        />
      )}

      <div className="border-t border-white/[0.06] pt-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Scope Locations</h3>
        <div className="space-y-4">
          <TagInput
            label="Exchange"
            values={exchangeLocation}
            onChange={setExchangeLocation}
            placeholder="'All' or specific addresses..."
            helpText="Type 'All' for all mailboxes, or add specific email addresses."
            disabled={!isNew}
          />
          <TagInput
            label="SharePoint"
            values={sharePointLocation}
            onChange={setSharePointLocation}
            placeholder="'All' or site URLs..."
            helpText="Type 'All' or enter specific SharePoint site URLs."
            disabled={!isNew}
          />
          <TagInput
            label="OneDrive"
            values={oneDriveLocation}
            onChange={setOneDriveLocation}
            placeholder="'All' or site URLs..."
            disabled={!isNew}
          />
        </div>
        {!isNew && (
          <p className="text-xs text-zinc-600 mt-2">
            Location scoping can only be set during creation. Use Set-SLAutoLabelPolicy with -AddExchangeLocation / -RemoveExchangeLocation in PowerShell.
          </p>
        )}
      </div>

      <FormActions
        onSave={handleSave}
        onCancel={onCancel}
        onDelete={existing ? () => setShowDelete(true) : undefined}
        saving={saving}
        saveLabel={isNew ? 'Create Policy' : 'Save Changes'}
        isNew={isNew}
      />

      {showDelete && (
        <DeleteConfirm
          name={existing!.Name}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function DeleteConfirm({
  name,
  deleting,
  onConfirm,
  onCancel,
}: {
  name: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold text-white mb-2">Delete Auto-Label Policy</h3>
        <p className="text-sm text-zinc-400 mb-1">
          Permanently delete <strong className="text-zinc-200">{name}</strong>?
        </p>
        <p className="text-xs text-red-400/70 mb-6">
          Content previously labeled by this policy will keep its labels, but no new content will be auto-labeled.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm text-zinc-400 bg-white/[0.06] rounded-lg border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {deleting ? 'Deleting...' : 'Delete Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

