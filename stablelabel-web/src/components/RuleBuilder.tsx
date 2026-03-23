/**
 * Visual rule builder for classification-to-label policies.
 *
 * Lets users construct conditions (entity detection, file patterns, no-label)
 * with AND/OR logic, confidence sliders, and entity type pickers — no raw JSON.
 */

import { useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

// ── Supported entity types (mirrors Presidio backend) ─────────

const ENTITY_TYPES = [
  { id: 'US_SSN', label: 'US Social Security Number', category: 'Identity' },
  { id: 'CREDIT_CARD', label: 'Credit Card Number', category: 'Financial' },
  { id: 'EMAIL_ADDRESS', label: 'Email Address', category: 'Contact' },
  { id: 'PHONE_NUMBER', label: 'Phone Number', category: 'Contact' },
  { id: 'PERSON', label: 'Person Name', category: 'Identity' },
  { id: 'US_PASSPORT', label: 'US Passport', category: 'Identity' },
  { id: 'US_DRIVER_LICENSE', label: 'US Driver License', category: 'Identity' },
  { id: 'US_BANK_NUMBER', label: 'US Bank Account', category: 'Financial' },
  { id: 'IBAN_CODE', label: 'IBAN Code', category: 'Financial' },
  { id: 'IP_ADDRESS', label: 'IP Address', category: 'Network' },
  { id: 'CRYPTO', label: 'Crypto Wallet', category: 'Financial' },
  { id: 'MEDICAL_LICENSE', label: 'Medical License', category: 'Medical' },
  { id: 'UK_NHS', label: 'UK NHS Number', category: 'Identity' },
  { id: 'AU_TFN', label: 'AU Tax File Number', category: 'Identity' },
  { id: 'AU_ABN', label: 'AU Business Number', category: 'Identity' },
  { id: 'AU_ACN', label: 'AU Company Number', category: 'Identity' },
  { id: 'AU_MEDICARE', label: 'AU Medicare Number', category: 'Identity' },
] as const;

const CATEGORIES = [...new Set(ENTITY_TYPES.map((e) => e.category))];

// ── Types ─────────────────────────────────────────────────────

export interface EntityCondition {
  type: 'entity_detected';
  entity_types: string[];
  min_confidence: number;
  min_count: number;
}

export interface FilePatternCondition {
  type: 'file_pattern';
  patterns: string[];
}

export interface NoLabelCondition {
  type: 'no_label';
}

export interface KeywordCondition {
  type: 'keyword_match';
  keywords: string[];
  case_sensitive: boolean;
  min_count: number;
}

export interface RegexCondition {
  type: 'regex_match';
  patterns: string[];
  min_count: number;
}

export type Condition = EntityCondition | FilePatternCondition | NoLabelCondition | KeywordCondition | RegexCondition;

export interface PolicyRules {
  conditions: Condition[];
  match_mode: 'any' | 'all';
}

interface Props {
  value: PolicyRules;
  onChange: (rules: PolicyRules) => void;
  readOnly?: boolean;
}

// ── Main component ────────────────────────────────────────────

export default function RuleBuilder({ value, onChange, readOnly }: Props) {
  const addCondition = (type: Condition['type']) => {
    let newCondition: Condition;
    if (type === 'entity_detected') {
      newCondition = { type: 'entity_detected', entity_types: [], min_confidence: 0.8, min_count: 1 };
    } else if (type === 'file_pattern') {
      newCondition = { type: 'file_pattern', patterns: [''] };
    } else if (type === 'keyword_match') {
      newCondition = { type: 'keyword_match', keywords: [''], case_sensitive: false, min_count: 1 };
    } else if (type === 'regex_match') {
      newCondition = { type: 'regex_match', patterns: [''], min_count: 1 };
    } else {
      newCondition = { type: 'no_label' };
    }
    onChange({ ...value, conditions: [...value.conditions, newCondition] });
  };

  const updateCondition = (index: number, updated: Condition) => {
    const conditions = [...value.conditions];
    conditions[index] = updated;
    onChange({ ...value, conditions });
  };

  const removeCondition = (index: number) => {
    onChange({ ...value, conditions: value.conditions.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {/* Match mode toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400">When</span>
        <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onChange({ ...value, match_mode: 'any' })}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              value.match_mode === 'any'
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ANY
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onChange({ ...value, match_mode: 'all' })}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              value.match_mode === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ALL
          </button>
        </div>
        <span className="text-sm text-zinc-400">conditions match, apply the target label</span>
      </div>

      {/* Conditions list */}
      <div className="space-y-3">
        {value.conditions.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-4 justify-center border border-dashed border-zinc-700 rounded-lg">
            <AlertTriangle size={14} />
            No conditions — add at least one below
          </div>
        )}

        {value.conditions.map((cond, i) => (
          <div key={i} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <ConditionEditor
                condition={cond}
                onChange={(c) => updateCondition(i, c)}
                readOnly={readOnly}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="text-zinc-500 hover:text-red-400 transition-colors mt-1 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {i < value.conditions.length - 1 && (
              <div className="text-center mt-3 -mb-1">
                <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
                  {value.match_mode === 'any' ? 'OR' : 'AND'}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add condition buttons */}
      {!readOnly && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addCondition('entity_detected')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            <Plus size={12} /> Entity Detection
          </button>
          <button
            type="button"
            onClick={() => addCondition('file_pattern')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            <Plus size={12} /> File Pattern
          </button>
          <button
            type="button"
            onClick={() => addCondition('keyword_match')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            <Plus size={12} /> Keyword Match
          </button>
          <button
            type="button"
            onClick={() => addCondition('regex_match')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            <Plus size={12} /> Regex Pattern
          </button>
          <button
            type="button"
            onClick={() => addCondition('no_label')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            <Plus size={12} /> No Label
          </button>
        </div>
      )}
    </div>
  );
}

// ── Condition editors ─────────────────────────────────────────

function ConditionEditor({
  condition,
  onChange,
  readOnly,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  readOnly?: boolean;
}) {
  if (condition.type === 'entity_detected') {
    return <EntityConditionEditor condition={condition} onChange={onChange} readOnly={readOnly} />;
  }
  if (condition.type === 'file_pattern') {
    return <FilePatternEditor condition={condition} onChange={onChange} readOnly={readOnly} />;
  }
  if (condition.type === 'keyword_match') {
    return <KeywordConditionEditor condition={condition} onChange={onChange} readOnly={readOnly} />;
  }
  if (condition.type === 'regex_match') {
    return <RegexConditionEditor condition={condition} onChange={onChange} readOnly={readOnly} />;
  }
  return (
    <div className="text-sm text-zinc-300">
      <span className="text-blue-400 font-medium">No Label</span>
      <span className="text-zinc-500 ml-2">— matches files that currently have no sensitivity label</span>
    </div>
  );
}

function EntityConditionEditor({
  condition,
  onChange,
  readOnly,
}: {
  condition: EntityCondition;
  onChange: (c: Condition) => void;
  readOnly?: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('all');

  const toggleEntity = (id: string) => {
    const types = condition.entity_types.includes(id)
      ? condition.entity_types.filter((t) => t !== id)
      : [...condition.entity_types, id];
    onChange({ ...condition, entity_types: types });
  };

  const filtered = filterCat === 'all'
    ? ENTITY_TYPES
    : ENTITY_TYPES.filter((e) => e.category === filterCat);

  return (
    <div className="flex-1 space-y-3">
      <div className="text-sm">
        <span className="text-blue-400 font-medium">Entity Detection</span>
        <span className="text-zinc-500 ml-2">— sensitive data found in file content</span>
      </div>

      {/* Selected entities */}
      <div>
        <label className="text-xs text-zinc-500 block mb-1.5">Entity Types</label>
        <div className="flex flex-wrap gap-1.5">
          {condition.entity_types.map((id) => {
            const entity = ENTITY_TYPES.find((e) => e.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-blue-900/40 text-blue-300 border border-blue-800"
              >
                {entity?.label ?? id}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleEntity(id)}
                    className="text-blue-400 hover:text-blue-200 ml-0.5"
                  >
                    &times;
                  </button>
                )}
              </span>
            );
          })}
          {condition.entity_types.length === 0 && (
            <span className="text-xs text-zinc-600">None selected</span>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
            >
              <Plus size={10} /> Add
            </button>
          )}
        </div>

        {/* Entity picker dropdown */}
        {showPicker && !readOnly && (
          <div className="mt-2 bg-zinc-900 border border-zinc-700 rounded-lg p-3 max-h-48 overflow-y-auto">
            <div className="flex gap-1.5 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setFilterCat('all')}
                className={`px-2 py-0.5 text-xs rounded ${filterCat === 'all' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat)}
                  className={`px-2 py-0.5 text-xs rounded ${filterCat === cat ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {filtered.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-2 text-xs text-zinc-300 py-1 px-2 rounded hover:bg-zinc-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={condition.entity_types.includes(e.id)}
                    onChange={() => toggleEntity(e.id)}
                    className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  {e.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confidence threshold */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-zinc-500 block mb-1">Min Confidence</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(condition.min_confidence * 100)}
              onChange={(e) =>
                !readOnly && onChange({ ...condition, min_confidence: parseInt(e.target.value) / 100 })
              }
              disabled={readOnly}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs text-zinc-300 w-10 text-right tabular-nums">
              {Math.round(condition.min_confidence * 100)}%
            </span>
          </div>
        </div>
        <div className="w-24">
          <label className="text-xs text-zinc-500 block mb-1">Min Count</label>
          <input
            type="number"
            min={1}
            max={100}
            value={condition.min_count}
            onChange={(e) =>
              !readOnly &&
              onChange({ ...condition, min_count: Math.max(1, parseInt(e.target.value) || 1) })
            }
            disabled={readOnly}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

function FilePatternEditor({
  condition,
  onChange,
  readOnly,
}: {
  condition: FilePatternCondition;
  onChange: (c: Condition) => void;
  readOnly?: boolean;
}) {
  const updatePattern = (index: number, value: string) => {
    const patterns = [...condition.patterns];
    patterns[index] = value;
    onChange({ ...condition, patterns });
  };

  const addPattern = () => {
    onChange({ ...condition, patterns: [...condition.patterns, ''] });
  };

  const removePattern = (index: number) => {
    onChange({ ...condition, patterns: condition.patterns.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex-1 space-y-3">
      <div className="text-sm">
        <span className="text-blue-400 font-medium">File Pattern</span>
        <span className="text-zinc-500 ml-2">— match files by name/extension (glob patterns)</span>
      </div>

      <div className="space-y-1.5">
        {condition.patterns.map((pattern, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={pattern}
              onChange={(e) => !readOnly && updatePattern(i, e.target.value)}
              placeholder="e.g. *.xlsx, financial*, *.pdf"
              disabled={readOnly}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            {!readOnly && condition.patterns.length > 1 && (
              <button
                type="button"
                onClick={() => removePattern(i)}
                className="text-zinc-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={addPattern}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Plus size={12} /> Add pattern
          </button>
        )}
      </div>
    </div>
  );
}

function KeywordConditionEditor({
  condition,
  onChange,
  readOnly,
}: {
  condition: KeywordCondition;
  onChange: (c: Condition) => void;
  readOnly?: boolean;
}) {
  const updateKeyword = (index: number, value: string) => {
    const keywords = [...condition.keywords];
    keywords[index] = value;
    onChange({ ...condition, keywords });
  };

  const addKeyword = () => {
    onChange({ ...condition, keywords: [...condition.keywords, ''] });
  };

  const removeKeyword = (index: number) => {
    onChange({ ...condition, keywords: condition.keywords.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex-1 space-y-3">
      <div className="text-sm">
        <span className="text-blue-400 font-medium">Keyword Match</span>
        <span className="text-zinc-500 ml-2">— match files containing specific words or phrases</span>
      </div>

      <div className="space-y-1.5">
        {condition.keywords.map((kw, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={kw}
              onChange={(e) => !readOnly && updateKeyword(i, e.target.value)}
              placeholder="e.g. confidential, internal only, salary"
              disabled={readOnly}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {!readOnly && condition.keywords.length > 1 && (
              <button type="button" onClick={() => removeKeyword(i)} className="text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button type="button" onClick={addKeyword} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            <Plus size={12} /> Add keyword
          </button>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={condition.case_sensitive}
            onChange={(e) => !readOnly && onChange({ ...condition, case_sensitive: e.target.checked })}
            disabled={readOnly}
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-xs text-zinc-400">Case sensitive</span>
        </div>
        <div className="w-24">
          <label className="text-xs text-zinc-500 block mb-1">Min Count</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={condition.min_count}
            onChange={(e) => !readOnly && onChange({ ...condition, min_count: Math.max(1, parseInt(e.target.value) || 1) })}
            disabled={readOnly}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

function RegexConditionEditor({
  condition,
  onChange,
  readOnly,
}: {
  condition: RegexCondition;
  onChange: (c: Condition) => void;
  readOnly?: boolean;
}) {
  const updatePattern = (index: number, value: string) => {
    const patterns = [...condition.patterns];
    patterns[index] = value;
    onChange({ ...condition, patterns });
  };

  const addPattern = () => {
    onChange({ ...condition, patterns: [...condition.patterns, ''] });
  };

  const removePattern = (index: number) => {
    onChange({ ...condition, patterns: condition.patterns.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex-1 space-y-3">
      <div className="text-sm">
        <span className="text-blue-400 font-medium">Regex Pattern</span>
        <span className="text-zinc-500 ml-2">— match files using regular expressions on content</span>
      </div>

      <div className="space-y-1.5">
        {condition.patterns.map((pattern, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={pattern}
              onChange={(e) => !readOnly && updatePattern(i, e.target.value)}
              placeholder="e.g. \b[A-Z]{2}\d{6}\b, PROJECT-\d+"
              disabled={readOnly}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            {!readOnly && condition.patterns.length > 1 && (
              <button type="button" onClick={() => removePattern(i)} className="text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button type="button" onClick={addPattern} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            <Plus size={12} /> Add pattern
          </button>
        )}
      </div>

      <div className="w-24">
        <label className="text-xs text-zinc-500 block mb-1">Min Matches</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={condition.min_count}
          onChange={(e) => !readOnly && onChange({ ...condition, min_count: Math.max(1, parseInt(e.target.value) || 1) })}
          disabled={readOnly}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
