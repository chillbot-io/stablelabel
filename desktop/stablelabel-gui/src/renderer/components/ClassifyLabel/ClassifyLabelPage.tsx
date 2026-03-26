import React, { useState, useEffect, useRef } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import ScanProgressBar from '../common/ScanProgressBar';
import ConfirmDialog from '../common/ConfirmDialog';
import PolicyWizard from './PolicyWizard';
import {
  ClassificationPolicy,
  RunSummary,
  describeSchedule,
  isScheduleDue,
} from '../../lib/classification-policy';

const PREFS_KEY = 'classification_policies';

export default function ClassifyLabelPage() {
  const { invoke } = usePowerShell();
  const [policies, setPolicies] = useState<ClassificationPolicy[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ClassificationPolicy | null>(null);
  const [runningPolicyId, setRunningPolicyId] = useState<string | null>(null);
  const [dryRunMode, setDryRunMode] = useState(true);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const elapsed = useElapsedTime(!!runningPolicyId);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Load policies from encrypted preferences
  useEffect(() => {
    loadPolicies();
  }, []);

  // Schedule checker — runs every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      for (const p of policies) {
        if (p.enabled && p.schedule && !runningPolicyId) {
          if (isScheduleDue(p.schedule, now)) {
            runPolicy(p.id, false);
            break; // one at a time
          }
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [policies, runningPolicyId]);

  const loadPolicies = async () => {
    const prefs = await window.stablelabel.getPreferences();
    const saved = prefs[PREFS_KEY];
    if (Array.isArray(saved)) setPolicies(saved as ClassificationPolicy[]);
  };

  const savePolicies = async (updated: ClassificationPolicy[]) => {
    setPolicies(updated);
    await window.stablelabel.setPreferences({ [PREFS_KEY]: updated });
  };

  const handleSavePolicy = (policy: ClassificationPolicy) => {
    const idx = policies.findIndex((p) => p.id === policy.id);
    const updated = idx >= 0
      ? policies.map((p) => (p.id === policy.id ? policy : p))
      : [...policies, policy];
    savePolicies(updated);
    setWizardOpen(false);
    setEditingPolicy(null);
  };

  const handleDeletePolicy = (id: string) => {
    savePolicies(policies.filter((p) => p.id !== id));
    setDeleteConfirm(null);
  };

  const toggleEnabled = (id: string) => {
    savePolicies(policies.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Run a policy ────────────────────────────────────────
  const runPolicy = async (id: string, dryRun: boolean) => {
    const policy = policies.find((p) => p.id === id);
    if (!policy || runningPolicyId) return;

    setRunningPolicyId(id);
    setShowConfirm(null);
    const startTime = Date.now();

    // Build the LocalJobRunner config from the policy
    try {
      const result = await window.stablelabel.jobStart({
        use_policies: true,
        dry_run: dryRun,
        site_ids: policy.site_ids.length > 0 ? policy.site_ids : undefined,
        policies: [{
          policy_id: policy.id,
          policy_name: policy.name,
          target_label_id: policy.target_label_id,
          priority: 100,
          rules: {
            patterns: [{
              confidence_level: 85,
              primary_match: {
                type: 'entity',
                entity_types: policy.entity_types,
                min_confidence: policy.min_confidence,
                min_count: policy.min_count,
              },
            }],
          },
        }],
      });

      if (!result.success) {
        // Fallback — the job runner might not be available, try direct PS approach
        // This happens when the classifier bridge isn't running
        await runPolicyViaPowerShell(policy, dryRun, startTime);
        return;
      }

      // Wait for job completion via IPC event
      await new Promise<void>((resolve) => {
        const unsub = window.stablelabel.onJobCompleted((results) => {
          unsub();
          if (!mountedRef.current) return;

          const labeled = (results as Array<{outcome: string}>).filter((r) => r.outcome === 'labelled').length;
          const failed = (results as Array<{outcome: string}>).filter((r) => r.outcome === 'failed').length;
          const skipped = (results as Array<{outcome: string}>).filter((r) => r.outcome === 'skipped').length;

          const summary: RunSummary = {
            total_files: results.length,
            classified: results.length,
            matched: labeled + failed,
            labeled,
            failed,
            skipped,
            dry_run: dryRun,
            duration_ms: Date.now() - startTime,
          };

          savePolicies(policies.map((p) =>
            p.id === id ? { ...p, last_run_at: new Date().toISOString(), last_run_summary: summary } : p,
          ));
          resolve();
        });
      });
    } catch {
      // Fall back to PowerShell-based scan
      await runPolicyViaPowerShell(policy, dryRun, startTime);
    }

    if (mountedRef.current) setRunningPolicyId(null);
  };

  /** Fallback: run scan via PowerShell when classifier bridge is unavailable */
  const runPolicyViaPowerShell = async (
    policy: ClassificationPolicy,
    dryRun: boolean,
    startTime: number,
  ) => {
    // Use Invoke-SLAutoLabelScan for each site
    const siteIds = policy.site_ids.length > 0 ? policy.site_ids : ['__all__'];
    let totalLabeled = 0;
    let totalFailed = 0;
    let totalFiles = 0;

    for (const sid of siteIds) {
      const params: Record<string, unknown> = {
        LabelId: policy.target_label_id,
        Recursive: true,
      };
      if (sid !== '__all__') params.SiteId = sid;
      if (policy.extensions.length > 0) params.Extensions = policy.extensions;
      if (policy.skip_already_labeled) params.SkipAlreadyLabeled = true;
      if (dryRun) params.DryRun = true;

      interface ScanData { TotalFiles?: number; SuccessCount?: number; FailedCount?: number }
      const r = await invoke<ScanData>('Invoke-SLAutoLabelScan', params);
      if (r.success && r.data) {
        totalFiles += r.data.TotalFiles ?? 0;
        totalLabeled += r.data.SuccessCount ?? 0;
        totalFailed += r.data.FailedCount ?? 0;
      }
    }

    if (mountedRef.current) {
      const summary: RunSummary = {
        total_files: totalFiles,
        classified: totalFiles,
        matched: totalLabeled + totalFailed,
        labeled: totalLabeled,
        failed: totalFailed,
        skipped: totalFiles - totalLabeled - totalFailed,
        dry_run: dryRun,
        duration_ms: Date.now() - startTime,
      };

      savePolicies(policies.map((p) =>
        p.id === policy.id ? { ...p, last_run_at: new Date().toISOString(), last_run_summary: summary } : p,
      ));
    }
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Classify & Label</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Create policies that detect sensitive data and automatically apply labels.
          </p>
        </div>
        <button
          onClick={() => { setEditingPolicy(null); setWizardOpen(true); }}
          className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg"
        >
          + New Policy
        </button>
      </div>

      {policies.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">🛡</div>
          <div className="text-sm">No classification policies yet.</div>
          <div className="text-xs mt-1">Click "+ New Policy" to create your first one.</div>
        </div>
      )}

      {/* Policy list */}
      <div className="space-y-3">
        {policies.map((p) => {
          const isExpanded = expanded.has(p.id);
          const isRunning = runningPolicyId === p.id;

          return (
            <div
              key={p.id}
              className={`border rounded-lg transition-colors ${
                p.enabled ? 'border-zinc-700 bg-zinc-800/30' : 'border-zinc-800 bg-zinc-900/30 opacity-60'
              }`}
            >
              {/* Collapsed header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => toggleExpand(p.id)}
              >
                <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                <span className="font-medium text-zinc-200 flex-1">{p.name}</span>
                <span className="text-xs text-zinc-500">{p.target_label_name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  p.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700 text-zinc-500'
                }`}>
                  {p.enabled ? 'Active' : 'Paused'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingPolicy(p); setWizardOpen(true); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 px-2"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dryRunMode) runPolicy(p.id, true);
                    else setShowConfirm(p.id);
                  }}
                  disabled={isRunning || !!runningPolicyId}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 px-2 disabled:opacity-40"
                >
                  {isRunning ? 'Running...' : 'Run ▶'}
                </button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-2 border-t border-zinc-800 pt-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                    <div>
                      <span className="text-zinc-500">Entities: </span>
                      <span className="text-zinc-300">{p.entity_types.join(', ')}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Confidence: </span>
                      <span className="text-zinc-300">≥ {p.min_confidence}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Sites: </span>
                      <span className="text-zinc-300">{p.site_names.length > 0 ? p.site_names.join(', ') : 'All sites'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Extensions: </span>
                      <span className="text-zinc-300">{p.extensions.length > 0 ? p.extensions.join(', ') : 'All'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Schedule: </span>
                      <span className="text-zinc-300">{describeSchedule(p.schedule)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Last run: </span>
                      <span className="text-zinc-300">
                        {p.last_run_at ? new Date(p.last_run_at).toLocaleString() : 'Never'}
                      </span>
                    </div>
                  </div>

                  {p.last_run_summary && (
                    <div className="flex gap-3 mt-2 text-[11px]">
                      <span className="text-zinc-500">{p.last_run_summary.total_files} files</span>
                      <span className="text-emerald-400">{p.last_run_summary.labeled} labeled</span>
                      {p.last_run_summary.failed > 0 && (
                        <span className="text-red-400">{p.last_run_summary.failed} failed</span>
                      )}
                      <span className="text-zinc-600">{p.last_run_summary.skipped} skipped</span>
                      {p.last_run_summary.dry_run && (
                        <span className="text-amber-400">(dry run)</span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => toggleEnabled(p.id)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300"
                    >
                      {p.enabled ? 'Pause Policy' : 'Enable Policy'}
                    </button>
                    <span className="text-zinc-700">·</span>
                    <button
                      onClick={() => setDeleteConfirm(p.id)}
                      className="text-[11px] text-red-500/60 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Progress bar for running policy */}
              {isRunning && (
                <div className="px-4 pb-3">
                  <ScanProgressBar active={true} />
                  <div className="text-[11px] text-zinc-500 mt-1">{elapsed || 'Starting...'}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dry run toggle */}
      {policies.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-zinc-500 border-t border-zinc-800 pt-4">
          <ToggleField
            label="Dry Run mode"
            checked={dryRunMode}
            onChange={setDryRunMode}
            helpText="When enabled, Run buttons preview without applying labels"
          />
        </div>
      )}

      {/* Wizard */}
      {wizardOpen && (
        <PolicyWizard
          policy={editingPolicy}
          onSave={handleSavePolicy}
          onCancel={() => { setWizardOpen(false); setEditingPolicy(null); }}
        />
      )}

      {/* Run confirmation */}
      {showConfirm && (
        <ConfirmDialog
          title="Run Classification Policy"
          message={`This will scan files and apply label "${policies.find((p) => p.id === showConfirm)?.target_label_name}" to matching files. Run a dry run first if you haven't already.`}
          confirmLabel="Scan & Apply"
          variant="warning"
          onConfirm={() => runPolicy(showConfirm, false)}
          onCancel={() => setShowConfirm(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Policy"
          message={`Delete "${policies.find((p) => p.id === deleteConfirm)?.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => handleDeletePolicy(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// Re-export ToggleField since we use it inline
function ToggleField({ label, checked, onChange, helpText }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; helpText?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-500" />
      <span className="text-zinc-300">{label}</span>
      {helpText && <span className="text-zinc-600">— {helpText}</span>}
    </label>
  );
}
