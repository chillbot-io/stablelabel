import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, TagInput, FormActions } from '../common/FormFields';
import type { LabelPolicy } from '../../lib/types';

interface PolicyFormProps {
  /** If provided, we're editing an existing policy. Otherwise creating new. */
  existing?: LabelPolicy | null;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export default function PolicyForm({ existing, onSaved, onCancel, onDeleted }: PolicyFormProps) {
  const { invoke } = usePowerShell();
  const isNew = !existing;

  const [name, setName] = useState(existing?.Name ?? '');
  const [comment, setComment] = useState(existing?.Comment ?? '');
  const [labels, setLabels] = useState<string[]>(existing?.Labels ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Policy name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let result;
      if (isNew) {
        const params: Record<string, unknown> = { Name: name };
        if (labels.length > 0) params.Labels = labels;
        if (comment.trim()) params.Comment = comment;
        result = await invoke('New-SLLabelPolicy', params);
      } else {
        const params: Record<string, unknown> = { Identity: existing!.Name };
        if (comment !== (existing!.Comment ?? '')) params.Comment = comment;
        // For labels, use the full replacement
        if (JSON.stringify(labels) !== JSON.stringify(existing!.Labels ?? [])) {
          params.Labels = labels;
        }
        result = await invoke('Set-SLLabelPolicy', params);
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
      const result = await invoke('Remove-SLLabelPolicy', { Identity: existing.Name });
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
          {isNew ? 'New Label Policy' : `Edit: ${existing!.Name}`}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          {isNew
            ? 'Create a new sensitivity label publishing policy.'
            : 'Modify this label policy. Changes take effect after saving.'}
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
        placeholder="e.g., Finance Policy"
        helpText={isNew ? undefined : 'Policy names cannot be changed after creation.'}
      />

      <TextArea
        label="Comment"
        value={comment}
        onChange={setComment}
        placeholder="Describe the purpose of this policy..."
      />

      <TagInput
        label="Labels"
        values={labels}
        onChange={setLabels}
        placeholder="Type a label name and press Enter..."
        helpText="Sensitivity labels published by this policy. Enter exact label names or GUIDs."
      />

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
        <h3 className="text-lg font-semibold text-white mb-2">Delete Label Policy</h3>
        <p className="text-sm text-zinc-400 mb-1">
          Permanently delete <strong className="text-zinc-200">{name}</strong>?
        </p>
        <p className="text-xs text-red-400/70 mb-6">
          This will unpublish all labels in this policy. Users will no longer see them.
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

