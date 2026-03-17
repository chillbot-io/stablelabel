import React from 'react';

/** Single-line text input */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  mono,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  mono?: boolean;
  helpText?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
          mono ? 'font-mono text-xs' : ''
        }`}
      />
      {helpText && <p className="text-[11px] text-zinc-600 mt-1">{helpText}</p>}
    </div>
  );
}

/** Multi-line text area */
export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  helpText?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-40 resize-y transition-colors"
      />
      {helpText && <p className="text-[11px] text-zinc-600 mt-1">{helpText}</p>}
    </div>
  );
}

/** Dropdown select */
export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-40 transition-colors"
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helpText && <p className="text-[11px] text-zinc-600 mt-1">{helpText}</p>}
    </div>
  );
}

/** Number input */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  required,
  disabled,
  helpText,
}: {
  label: string;
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        min={min}
        max={max}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-40 transition-colors"
      />
      {helpText && <p className="text-[11px] text-zinc-600 mt-1">{helpText}</p>}
    </div>
  );
}

/** Toggle switch */
export function ToggleField({
  label,
  checked,
  onChange,
  disabled,
  helpText,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  helpText?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-0.5 ${
          checked ? 'bg-blue-600' : 'bg-zinc-700'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div>
        <span className="text-sm text-zinc-200">{label}</span>
        {helpText && <p className="text-[11px] text-zinc-600 mt-0.5">{helpText}</p>}
      </div>
    </div>
  );
}

/** Tag/chip input for comma-separated values (labels, locations) */
export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  helpText,
  disabled,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  helpText?: string;
  disabled?: boolean;
}) {
  const [input, setInput] = React.useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && input === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">{label}</label>
      <div className="bg-white/[0.05] border border-white/[0.08] rounded-lg p-2 min-h-[38px]">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-white/[0.08] text-zinc-200 rounded-md"
            >
              {v}
              {!disabled && (
                <button
                  onClick={() => removeTag(v)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  x
                </button>
              )}
            </span>
          ))}
        </div>
        {!disabled && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={addTag}
            placeholder={values.length === 0 ? placeholder : 'Add more...'}
            className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none"
          />
        )}
      </div>
      {helpText && <p className="text-[11px] text-zinc-600 mt-1">{helpText}</p>}
    </div>
  );
}

/** Form action bar (save/cancel/delete) */
export function FormActions({
  onSave,
  onCancel,
  onDelete,
  saving,
  saveLabel = 'Save',
  isNew,
}: {
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving?: boolean;
  saveLabel?: string;
  isNew?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
      <div>
        {onDelete && !isNew && (
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] rounded-lg transition-colors"
          >
            Delete
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] text-zinc-400 hover:text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  );
}
