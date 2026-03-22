import React, { useEffect, useState, useCallback, useRef } from 'react';
import type {
  ClassifierConfig,
  EntityConfig,
  CustomRecognizer,
} from '../../lib/types';
import EntityTypePanel from './EntityTypePanel';
import CustomRecognizerPanel from './CustomRecognizerPanel';
import DenyListPanel from './DenyListPanel';
import TestPanel from './TestPanel';

const STORAGE_KEY = 'stablelabel-classifier-config';

const TABS = ['Entities', 'Custom Recognizers', 'Deny Lists', 'Test'] as const;
type Tab = (typeof TABS)[number];

/** Default entity types from Presidio with sensible defaults */
const DEFAULT_ENTITIES: Record<string, EntityConfig> = {
  PERSON: { enabled: true, threshold: 0.5 },
  EMAIL_ADDRESS: { enabled: true, threshold: 0.5 },
  PHONE_NUMBER: { enabled: true, threshold: 0.5 },
  CREDIT_CARD: { enabled: true, threshold: 0.5 },
  US_SSN: { enabled: true, threshold: 0.5 },
  US_ITIN: { enabled: true, threshold: 0.5 },
  US_PASSPORT: { enabled: true, threshold: 0.5 },
  US_BANK_NUMBER: { enabled: true, threshold: 0.4 },
  US_DRIVER_LICENSE: { enabled: true, threshold: 0.5 },
  IBAN_CODE: { enabled: true, threshold: 0.5 },
  IP_ADDRESS: { enabled: false, threshold: 0.5 },
  CRYPTO: { enabled: false, threshold: 0.5 },
  NRP: { enabled: false, threshold: 0.5 },
  LOCATION: { enabled: false, threshold: 0.5 },
  DATE_TIME: { enabled: false, threshold: 0.3 },
  MEDICAL_LICENSE: { enabled: true, threshold: 0.5 },
  URL: { enabled: false, threshold: 0.5 },
  UK_NHS: { enabled: true, threshold: 0.5 },
  AU_ABN: { enabled: true, threshold: 0.5 },
  AU_ACN: { enabled: true, threshold: 0.5 },
  AU_TFN: { enabled: true, threshold: 0.5 },
  AU_MEDICARE: { enabled: true, threshold: 0.5 },
  SG_NRIC_FIN: { enabled: true, threshold: 0.5 },
  IN_PAN: { enabled: true, threshold: 0.5 },
  IN_AADHAAR: { enabled: true, threshold: 0.5 },
};

function loadConfig(): ClassifierConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ClassifierConfig;
      // Merge with defaults so new entity types get included
      const entities = { ...DEFAULT_ENTITIES };
      for (const [k, v] of Object.entries(parsed.entities ?? {})) {
        entities[k] = v;
      }
      return {
        entities,
        custom_recognizers: parsed.custom_recognizers ?? [],
        deny_lists: parsed.deny_lists ?? {},
      };
    }
  } catch {
    // Ignore
  }
  return {
    entities: { ...DEFAULT_ENTITIES },
    custom_recognizers: [],
    deny_lists: {},
  };
}

export default function ClassificationPage() {
  const [tab, setTab] = useState<Tab>('Entities');
  const [config, setConfig] = useState<ClassifierConfig>(loadConfig);
  const [classifierStatus, setClassifierStatus] = useState<{
    available: boolean;
    mode?: string;
    error?: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.stablelabel.checkClassifier().then(setClassifierStatus);
  }, []);

  // Use a ref to always have the latest config in callbacks without stale closures
  const configRef = useRef(config);
  configRef.current = config;

  const saveConfig = useCallback((newConfig: ClassifierConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Reload the engine with new config
    window.stablelabel.classifierInvoke('reload', { config: newConfig });
  }, []);

  const updateEntities = useCallback((entities: Record<string, EntityConfig>) => {
    saveConfig({ ...configRef.current, entities });
  }, [saveConfig]);

  const updateRecognizers = useCallback((custom_recognizers: CustomRecognizer[]) => {
    saveConfig({ ...configRef.current, custom_recognizers });
  }, [saveConfig]);

  const updateDenyLists = useCallback((deny_lists: Record<string, string[]>) => {
    saveConfig({ ...configRef.current, deny_lists });
  }, [saveConfig]);

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Data Classification</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Configure PII detection powered by Presidio + spaCy NER
        </p>
      </div>

      {/* Status banner */}
      <div className="bg-white/[0.03] rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              classifierStatus?.available ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          <div>
            <span className="text-[13px] text-zinc-200">
              Classifier Engine{' '}
              {classifierStatus === null
                ? 'checking...'
                : classifierStatus.available
                  ? `ready (${classifierStatus.mode})`
                  : 'unavailable'}
            </span>
            {classifierStatus?.error && (
              <p className="text-[11px] text-red-400 mt-0.5">{classifierStatus.error}</p>
            )}
          </div>
        </div>
        {saved && <span className="text-[12px] text-emerald-400">Config saved & engine reloaded</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-white/[0.06] text-blue-400 border-b-2 border-blue-500'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Entities' && (
        <EntityTypePanel entities={config.entities} onChange={updateEntities} />
      )}
      {tab === 'Custom Recognizers' && (
        <CustomRecognizerPanel recognizers={config.custom_recognizers} onChange={updateRecognizers} />
      )}
      {tab === 'Deny Lists' && (
        <DenyListPanel
          denyLists={config.deny_lists}
          entityTypes={Object.keys(config.entities)}
          onChange={updateDenyLists}
        />
      )}
      {tab === 'Test' && <TestPanel config={config} />}
    </div>
  );
}
