import React, { useState, useEffect } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField } from '../common/FormFields';
import {
  ClassificationPolicy,
  PolicySchedule,
  AVAILABLE_ENTITIES,
  createBlankPolicy,
} from '../../lib/classification-policy';

interface Props {
  /** Existing policy to edit, or null for new */
  policy: ClassificationPolicy | null;
  onSave: (policy: ClassificationPolicy) => void;
  onCancel: () => void;
}

interface LabelOption {
  Id: string;
  DisplayName: string;
  Name: string;
}

interface SiteOption {
  Id: string;
  DisplayName: string;
}

export default function PolicyWizard({ policy, onSave, onCancel }: Props) {
  const { invoke } = usePowerShell();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ClassificationPolicy>(policy ?? createBlankPolicy());
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    loadLabels();
    loadSites();
  }, []);

  const loadLabels = async () => {
    setLoadingLabels(true);
    const r = await invoke<LabelOption[]>('Get-SLLabel', {});
    if (r.success && Array.isArray(r.data)) setLabels(r.data);
    setLoadingLabels(false);
  };

  const loadSites = async () => {
    setLoadingSites(true);
    const r = await invoke<SiteOption[]>('Get-SLSiteList', {});
    if (r.success && Array.isArray(r.data)) setSites(r.data);
    setLoadingSites(false);
  };

  const update = (patch: Partial<ClassificationPolicy>) => {
    setDraft((d) => ({ ...d, ...patch, updated_at: new Date().toISOString() }));
  };

  const toggleEntity = (id: string) => {
    const current = draft.entity_types;
    update({
      entity_types: current.includes(id)
        ? current.filter((e: string) => e !== id)
        : [...current, id],
    });
  };

  const toggleSite = (id: string, name: string) => {
    const idx = draft.site_ids.indexOf(id);
    if (idx >= 0) {
      update({
        site_ids: draft.site_ids.filter((_: string, i: number) => i !== idx),
        site_names: draft.site_names.filter((_: string, i: number) => i !== idx),
      });
    } else {
      update({
        site_ids: [...draft.site_ids, id],
        site_names: [...draft.site_names, name],
      });
    }
  };

  const canProceed = (): boolean => {
    if (step === 1) return draft.name.trim().length > 0 && draft.entity_types.length > 0;
    if (step === 2) return draft.target_label_id.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !draft.name.trim()) {
      setNameError('Policy name is required');
      return;
    }
    setNameError('');
    if (step < 4) setStep(step + 1);
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      setStep(1);
      setNameError('Policy name is required');
      return;
    }
    onSave(draft);
  };

  const grouped = AVAILABLE_ENTITIES.reduce((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {} as Record<string, typeof AVAILABLE_ENTITIES>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[640px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {policy ? 'Edit Policy' : 'Create Classification Policy'}
          </h2>
          <div className="flex gap-1 mt-3">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-blue-500' : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>
          <div className="text-xs text-zinc-500 mt-2">
            Step {step} of 4: {['Detection', 'Label', 'Scope', 'Schedule'][step - 1]}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Name + Entity types */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <TextField
                  label="Policy Name *"
                  value={draft.name}
                  onChange={(v: string) => { update({ name: v }); setNameError(''); }}
                  placeholder="e.g., PCI Detection, HIPAA Compliance"
                />
                {nameError && <div className="text-xs text-red-400 mt-1">{nameError}</div>}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-zinc-400 mb-2">
                  Entity Types to Detect *
                </label>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([category, entities]) => (
                    <div key={category}>
                      <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-1">{category}</div>
                      <div className="flex flex-wrap gap-2">
                        {entities.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => toggleEntity(e.id)}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                              draft.entity_types.includes(e.id)
                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                                : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                            }`}
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Min Confidence (0.0–1.0)"
                  value={String(draft.min_confidence)}
                  onChange={(v: string) => {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n >= 0 && n <= 1) update({ min_confidence: n });
                  }}
                />
                <TextField
                  label="Min Entity Count"
                  value={String(draft.min_count)}
                  onChange={(v: string) => {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 1) update({ min_count: n });
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 2: Target label */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-zinc-400 mb-2">
                  Apply this sensitivity label to matching files
                </label>
                {loadingLabels ? (
                  <div className="text-xs text-zinc-500">Loading labels...</div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {labels.map((l) => (
                      <button
                        key={l.Id}
                        onClick={() => update({ target_label_id: l.Id, target_label_name: l.DisplayName || l.Name })}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                          draft.target_label_id === l.Id
                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                            : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        {l.DisplayName || l.Name}
                        <span className="text-[10px] text-zinc-600 ml-2">{l.Id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {draft.target_label_id && (
                <div className="text-sm text-zinc-400">
                  Selected: <span className="text-white font-medium">{draft.target_label_name}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Scope */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-zinc-400 mb-2">
                  SharePoint Sites to Scan
                </label>
                <div className="text-xs text-zinc-500 mb-2">
                  Leave all unchecked to scan all sites.
                </div>
                {loadingSites ? (
                  <div className="text-xs text-zinc-500">Loading sites...</div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {sites.map((s) => (
                      <label
                        key={s.Id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={draft.site_ids.includes(s.Id)}
                          onChange={() => toggleSite(s.Id, s.DisplayName || s.Id)}
                          className="accent-blue-500"
                        />
                        <span className="text-sm text-zinc-300">{s.DisplayName || s.Id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <TextField
                label="File Extensions (comma-separated, optional)"
                value={draft.extensions.join(', ')}
                onChange={(v: string) => update({ extensions: v.split(',').map((s: string) => s.trim().replace(/^\./, '')).filter(Boolean) })}
                placeholder="docx, pdf, xlsx"
              />

              <ToggleField
                label="Skip Already Labeled"
                checked={draft.skip_already_labeled}
                onChange={(v: boolean) => update({ skip_already_labeled: v })}
                helpText="Skip files that already have any sensitivity label"
              />
            </div>
          )}

          {/* Step 4: Schedule */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-zinc-400 mb-2">
                  Run Schedule
                </label>
                <div className="space-y-2">
                  {(['none', 'daily', 'weekly', 'monthly'] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => {
                        if (freq === 'none') {
                          update({ schedule: null });
                        } else {
                          update({
                            schedule: {
                              frequency: freq,
                              hour: draft.schedule?.hour ?? 6,
                              minute: draft.schedule?.minute ?? 0,
                              day_of_week: freq === 'weekly' ? (draft.schedule?.day_of_week ?? 1) : undefined,
                              day_of_month: freq === 'monthly' ? (draft.schedule?.day_of_month ?? 1) : undefined,
                            },
                          });
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        (freq === 'none' && !draft.schedule) || draft.schedule?.frequency === freq
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {freq === 'none' ? 'Manual only' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {draft.schedule && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Hour (0–23)"
                    value={String(draft.schedule.hour)}
                    onChange={(v: string) => {
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0 && n <= 23 && draft.schedule) {
                        update({ schedule: { ...draft.schedule, hour: n } });
                      }
                    }}
                  />
                  <TextField
                    label="Minute (0–59)"
                    value={String(draft.schedule.minute)}
                    onChange={(v: string) => {
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0 && n <= 59 && draft.schedule) {
                        update({ schedule: { ...draft.schedule, minute: n } });
                      }
                    }}
                  />
                  {draft.schedule.frequency === 'weekly' && (
                    <div>
                      <label className="block text-[12px] font-medium text-zinc-400 mb-1">Day of Week</label>
                      <select
                        value={draft.schedule.day_of_week ?? 1}
                        onChange={(e) => {
                          if (draft.schedule) {
                            update({ schedule: { ...draft.schedule, day_of_week: parseInt(e.target.value, 10) } });
                          }
                        }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
                      >
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {draft.schedule.frequency === 'monthly' && (
                    <TextField
                      label="Day of Month (1–28)"
                      value={String(draft.schedule.day_of_month ?? 1)}
                      onChange={(v: string) => {
                        const n = parseInt(v, 10);
                        if (!isNaN(n) && n >= 1 && n <= 28 && draft.schedule) {
                          update({ schedule: { ...draft.schedule, day_of_month: n } });
                        }
                      }}
                    />
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg space-y-1 text-sm">
                <div className="text-zinc-400">Policy Summary</div>
                <div className="text-white font-medium">{draft.name || '(unnamed)'}</div>
                <div className="text-zinc-500">
                  Detect: {draft.entity_types.length > 0 ? draft.entity_types.join(', ') : 'none selected'}
                </div>
                <div className="text-zinc-500">
                  Label: {draft.target_label_name || 'none selected'}
                </div>
                <div className="text-zinc-500">
                  Sites: {draft.site_ids.length > 0 ? draft.site_names.join(', ') : 'All sites'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex justify-between">
          <button onClick={onCancel} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200">
                ← Back
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-40"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={!draft.name.trim() || draft.entity_types.length === 0 || !draft.target_label_id}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-40"
              >
                {policy ? 'Save Changes' : 'Create Policy'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
