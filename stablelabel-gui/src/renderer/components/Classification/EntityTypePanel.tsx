import React, { useState } from 'react';
import type { EntityConfig } from '../../lib/types';

/** Human-readable descriptions for common Presidio entity types */
const ENTITY_DESCRIPTIONS: Record<string, string> = {
  PERSON: 'Full person names',
  EMAIL_ADDRESS: 'Email addresses',
  PHONE_NUMBER: 'Phone numbers (US/intl)',
  CREDIT_CARD: 'Credit/debit card numbers',
  US_SSN: 'US Social Security Numbers',
  US_ITIN: 'US Individual Taxpayer IDs',
  US_PASSPORT: 'US Passport numbers',
  US_BANK_NUMBER: 'US Bank account numbers',
  US_DRIVER_LICENSE: 'US Driver license numbers',
  IBAN_CODE: 'International Bank Account Numbers',
  IP_ADDRESS: 'IPv4/IPv6 addresses',
  CRYPTO: 'Cryptocurrency wallet addresses',
  NRP: 'Nationality, religion, political group',
  LOCATION: 'Physical locations/addresses',
  DATE_TIME: 'Dates and times',
  MEDICAL_LICENSE: 'Medical license numbers',
  URL: 'Web URLs',
  UK_NHS: 'UK National Health Service numbers',
  AU_ABN: 'Australian Business Numbers',
  AU_ACN: 'Australian Company Numbers',
  AU_TFN: 'Australian Tax File Numbers',
  AU_MEDICARE: 'Australian Medicare numbers',
  SG_NRIC_FIN: 'Singapore NRIC/FIN numbers',
  IN_PAN: 'Indian PAN numbers',
  IN_AADHAAR: 'Indian Aadhaar numbers',
};

/** Group entities by category */
const ENTITY_GROUPS: Record<string, string[]> = {
  'Financial': ['CREDIT_CARD', 'IBAN_CODE', 'US_BANK_NUMBER', 'CRYPTO'],
  'US Government IDs': ['US_SSN', 'US_ITIN', 'US_PASSPORT', 'US_DRIVER_LICENSE'],
  'Personal Info': ['PERSON', 'EMAIL_ADDRESS', 'PHONE_NUMBER', 'LOCATION', 'DATE_TIME', 'NRP'],
  'Healthcare': ['MEDICAL_LICENSE', 'UK_NHS', 'AU_MEDICARE'],
  'Australia': ['AU_ABN', 'AU_ACN', 'AU_TFN', 'AU_MEDICARE'],
  'Asia-Pacific': ['SG_NRIC_FIN', 'IN_PAN', 'IN_AADHAAR'],
  'Technical': ['IP_ADDRESS', 'URL'],
};

interface EntityTypePanelProps {
  entities: Record<string, EntityConfig>;
  onChange: (entities: Record<string, EntityConfig>) => void;
}

export default function EntityTypePanel({ entities, onChange }: EntityTypePanelProps) {
  const [filter, setFilter] = useState('');

  const toggleEntity = (type: string) => {
    const updated = { ...entities };
    updated[type] = { ...updated[type], enabled: !updated[type].enabled };
    onChange(updated);
  };

  const setThreshold = (type: string, threshold: number) => {
    const updated = { ...entities };
    updated[type] = { ...updated[type], threshold };
    onChange(updated);
  };

  const enableAll = () => {
    const updated: Record<string, EntityConfig> = {};
    for (const [k, v] of Object.entries(entities)) {
      updated[k] = { ...v, enabled: true };
    }
    onChange(updated);
  };

  const disableAll = () => {
    const updated: Record<string, EntityConfig> = {};
    for (const [k, v] of Object.entries(entities)) {
      updated[k] = { ...v, enabled: false };
    }
    onChange(updated);
  };

  const enabledCount = Object.values(entities).filter((e) => e.enabled).length;
  const totalCount = Object.keys(entities).length;

  // Get categorized entities, putting ungrouped ones at the bottom
  const groupedTypes = new Set(Object.values(ENTITY_GROUPS).flat());
  const ungrouped = Object.keys(entities).filter((t) => !groupedTypes.has(t));

  return (
    <div className="space-y-4">
      {/* Header with filter and bulk actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter entities..."
            className="w-64 px-3 py-1.5 text-[12px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <span className="text-[11px] text-zinc-500">
            {enabledCount}/{totalCount} enabled
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={enableAll}
            className="px-3 py-1 text-[11px] text-zinc-400 hover:text-emerald-400 bg-white/[0.04] hover:bg-emerald-500/[0.08] rounded-lg transition-colors"
          >
            Enable All
          </button>
          <button
            onClick={disableAll}
            className="px-3 py-1 text-[11px] text-zinc-400 hover:text-red-400 bg-white/[0.04] hover:bg-red-500/[0.08] rounded-lg transition-colors"
          >
            Disable All
          </button>
        </div>
      </div>

      {/* Entity groups */}
      {Object.entries(ENTITY_GROUPS).map(([group, types]) => {
        const filteredTypes = types.filter(
          (t) =>
            t in entities &&
            (filter === '' ||
              t.toLowerCase().includes(filter.toLowerCase()) ||
              (ENTITY_DESCRIPTIONS[t] ?? '').toLowerCase().includes(filter.toLowerCase())),
        );
        if (filteredTypes.length === 0) return null;

        return (
          <div key={group} className="bg-white/[0.03] rounded-xl p-4">
            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              {group}
            </h3>
            <div className="space-y-1">
              {filteredTypes.map((type) => (
                <EntityRow
                  key={type}
                  type={type}
                  config={entities[type]}
                  description={ENTITY_DESCRIPTIONS[type] ?? type}
                  onToggle={() => toggleEntity(type)}
                  onThresholdChange={(t) => setThreshold(type, t)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Ungrouped / custom entity types */}
      {ungrouped.length > 0 && (() => {
        const filteredUngrouped = ungrouped.filter(
          (t) =>
            filter === '' ||
            t.toLowerCase().includes(filter.toLowerCase()),
        );
        if (filteredUngrouped.length === 0) return null;
        return (
          <div className="bg-white/[0.03] rounded-xl p-4">
            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Other
            </h3>
            <div className="space-y-1">
              {filteredUngrouped.map((type) => (
                <EntityRow
                  key={type}
                  type={type}
                  config={entities[type]}
                  description={ENTITY_DESCRIPTIONS[type] ?? type}
                  onToggle={() => toggleEntity(type)}
                  onThresholdChange={(t) => setThreshold(type, t)}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function EntityRow({
  type,
  config,
  description,
  onToggle,
  onThresholdChange,
}: {
  type: string;
  config: EntityConfig;
  description: string;
  onToggle: () => void;
  onThresholdChange: (threshold: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
      {/* Toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={config.enabled}
        onClick={onToggle}
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors flex-shrink-0 ${
          config.enabled ? 'bg-blue-600' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            config.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className={`text-[12px] font-mono ${config.enabled ? 'text-zinc-200' : 'text-zinc-500'}`}>
          {type}
        </span>
        <span className="text-[11px] text-zinc-500 ml-2">{description}</span>
      </div>

      {/* Threshold slider */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-zinc-500 w-6 text-right">
          {Math.round(config.threshold * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(config.threshold * 100)}
          onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
          disabled={!config.enabled}
          className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-30"
        />
      </div>
    </div>
  );
}
