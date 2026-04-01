import React, { useState } from 'react';
import type { CustomRecognizer } from '../../lib/types';

interface CustomRecognizerPanelProps {
  recognizers: CustomRecognizer[];
  onChange: (recognizers: CustomRecognizer[]) => void;
}

const EMPTY_RECOGNIZER: CustomRecognizer = {
  name: '',
  entity_type: '',
  pattern: '',
  score: 0.6,
  context_words: [],
};

export default function CustomRecognizerPanel({ recognizers, onChange }: CustomRecognizerPanelProps) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<CustomRecognizer>({ ...EMPTY_RECOGNIZER });
  const [error, setError] = useState<string | null>(null);

  const startNew = () => {
    setDraft({ ...EMPTY_RECOGNIZER });
    setEditing('new');
    setError(null);
  };

  const startEdit = (index: number) => {
    setDraft({ ...recognizers[index] });
    setEditing(index);
    setError(null);
  };

  const cancel = () => {
    setEditing(null);
    setError(null);
  };

  const save = () => {
    if (!draft.name.trim()) { setError('Name is required'); return; }
    if (!draft.entity_type.trim()) { setError('Entity type is required'); return; }
    if (!draft.pattern.trim()) { setError('Regex pattern is required'); return; }

    // Validate regex
    try {
      new RegExp(draft.pattern);
    } catch {
      setError('Invalid regex pattern');
      return;
    }

    // Normalize entity type to uppercase
    const normalized = { ...draft, entity_type: draft.entity_type.toUpperCase().replace(/\s+/g, '_') };

    const updated = [...recognizers];
    if (editing === 'new') {
      updated.push(normalized);
    } else if (typeof editing === 'number') {
      updated[editing] = normalized;
    }

    onChange(updated);
    setEditing(null);
    setError(null);
  };

  const remove = (index: number) => {
    onChange(recognizers.filter((_, i) => i !== index));
    if (editing === index) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-zinc-400">
          Add custom pattern-based recognizers. These use regex to detect entity types specific to your organization.
        </p>
        <button
          onClick={startNew}
          disabled={editing !== null}
          className="px-3 py-1.5 text-[12px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40"
        >
          Add Recognizer
        </button>
      </div>

      {/* Existing recognizers */}
      {recognizers.length === 0 && editing === null && (
        <div className="bg-white/[0.03] rounded-xl p-8 text-center">
          <p className="text-[13px] text-zinc-500">No custom recognizers configured.</p>
          <p className="text-[11px] text-zinc-600 mt-1">
            Add one to detect organization-specific patterns like employee IDs, case numbers, etc.
          </p>
        </div>
      )}

      {recognizers.map((rec, i) => (
        <div
          key={`${rec.name}-${rec.entity_type}`}
          className="bg-white/[0.03] rounded-xl p-4 flex items-start justify-between gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-zinc-200">{rec.name}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-blue-500/[0.12] text-blue-400 rounded">
                {rec.entity_type}
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-500 mt-1 truncate">{rec.pattern}</p>
            {rec.context_words.length > 0 && (
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Context: {rec.context_words.join(', ')}
              </p>
            )}
            <p className="text-[11px] text-zinc-600 mt-0.5">
              Score: {Math.round(rec.score * 100)}%
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => startEdit(i)}
              disabled={editing !== null}
              className="px-2 py-1 text-[11px] text-zinc-400 hover:text-blue-400 bg-white/[0.04] hover:bg-blue-500/[0.08] rounded transition-colors disabled:opacity-40"
            >
              Edit
            </button>
            <button
              onClick={() => remove(i)}
              disabled={editing !== null}
              className="px-2 py-1 text-[11px] text-zinc-400 hover:text-red-400 bg-white/[0.04] hover:bg-red-500/[0.08] rounded transition-colors disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {/* Editor form */}
      {editing !== null && (
        <RecognizerForm
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={cancel}
          error={error}
          isNew={editing === 'new'}
        />
      )}
    </div>
  );
}

function RecognizerForm({
  draft,
  onChange,
  onSave,
  onCancel,
  error,
  isNew,
}: {
  draft: CustomRecognizer;
  onChange: (r: CustomRecognizer) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
  isNew: boolean;
}) {
  const [contextInput, setContextInput] = useState('');

  const addContext = () => {
    const word = contextInput.trim().toLowerCase();
    if (word && !draft.context_words.includes(word)) {
      onChange({ ...draft, context_words: [...draft.context_words, word] });
    }
    setContextInput('');
  };

  const removeContext = (word: string) => {
    onChange({ ...draft, context_words: draft.context_words.filter((w) => w !== word) });
  };

  return (
    <div className="bg-white/[0.03] border border-blue-500/20 rounded-xl p-5 space-y-4">
      <h3 className="text-[13px] font-semibold text-zinc-200">
        {isNew ? 'New Custom Recognizer' : 'Edit Recognizer'}
      </h3>

      {error && (
        <div className="p-2 bg-red-900/20 border border-red-800 rounded-lg text-[12px] text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">Name</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="e.g., Employee ID"
            className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">Entity Type</label>
          <input
            type="text"
            value={draft.entity_type}
            onChange={(e) => onChange({ ...draft, entity_type: e.target.value })}
            placeholder="e.g., EMPLOYEE_ID"
            className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
          />
          <p className="text-[10px] text-zinc-600 mt-1">Will be uppercased automatically</p>
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
          Regex Pattern
        </label>
        <input
          type="text"
          value={draft.pattern}
          onChange={(e) => onChange({ ...draft, pattern: e.target.value })}
          placeholder="e.g., EMP-\d{6}"
          className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
        />
        <p className="text-[10px] text-zinc-600 mt-1">Python regex syntax (re module)</p>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
          Confidence Score: {Math.round(draft.score * 100)}%
        </label>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(draft.score * 100)}
          onChange={(e) => onChange({ ...draft, score: Number(e.target.value) / 100 })}
          className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <p className="text-[10px] text-zinc-600 mt-1">Base score assigned when pattern matches</p>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
          Context Words (optional)
        </label>
        <div className="bg-white/[0.05] border border-white/[0.08] rounded-lg p-2 min-h-[38px]">
          <div className="flex flex-wrap gap-1.5 mb-1">
            {draft.context_words.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-white/[0.08] text-zinc-200 rounded-md"
              >
                {w}
                <button onClick={() => removeContext(w)} className="text-zinc-500 hover:text-red-400">
                  x
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addContext();
              }
            }}
            onBlur={addContext}
            placeholder={draft.context_words.length === 0 ? 'e.g., employee, id, badge...' : 'Add more...'}
            className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none"
          />
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Nearby words that boost confidence when found. Press Enter or comma to add.
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-white/[0.06]">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-[13px] text-zinc-400 hover:text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-4 py-1.5 text-[13px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          {isNew ? 'Add Recognizer' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
