import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import ConfirmDialog from '../common/ConfirmDialog';
import ShowPowerShell from '../common/ShowPowerShell';

interface PlanStep {
  Phase: string;
  Category: string;
  Identity: string;
  Action: string;
}

interface DryRunResult {
  SnapshotName: string;
  TotalChanges: number;
  Removals: number;
  Creates: number;
  Updates: number;
  DryRun: boolean;
  Plan: PlanStep[];
}

interface RestoreResult {
  SnapshotName: string;
  PreRestoreSnapshot: string;
  TotalChanges: number;
  Succeeded: number;
  Failed: number;
  Results: Array<{
    Step: PlanStep;
    Status: string;
    Error: string | null;
  }>;
}

interface Props {
  snapshotName: string;
  onClose: () => void;
  onRestored: () => void;
}

export default function SnapshotRestore({ snapshotName, onClose, onRestored }: Props) {
  const { invoke } = usePowerShell();

  // Phase 1: dry-run
  const [plan, setPlan] = useState<DryRunResult | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const planElapsed = useElapsedTime(planLoading);

  // Phase 2: execute
  const [showConfirm, setShowConfirm] = useState(false);
  const [executing, setExecuting] = useState(false);
  const executeElapsed = useElapsedTime(executing);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Fetch dry-run plan on mount
  useEffect(() => {
    setPlanLoading(true);
    setPlanError(null);
    invoke<DryRunResult>('Restore-SLSnapshot', { Name: snapshotName, DryRun: true })
      .then((r) => {
        if (r.success && r.data) {
          setPlan(r.data);
        } else {
          setPlanError(r.error ?? 'Failed to generate restore plan');
        }
        setPlanLoading(false);
      })
      .catch((e) => {
        setPlanError(e instanceof Error ? e.message : 'Failed');
        setPlanLoading(false);
      });
  }, [snapshotName, invoke]);

  const handleExecute = async () => {
    setShowConfirm(false);
    setExecuting(true);
    setExecuteError(null);
    try {
      const r = await invoke<RestoreResult>('Restore-SLSnapshot', { Name: snapshotName });
      if (r.success && r.data) {
        setResult(r.data);
        onRestored();
      } else {
        setExecuteError(r.error ?? 'Restore failed');
      }
    } catch (e) {
      setExecuteError(e instanceof Error ? e.message : 'Failed');
    }
    setExecuting(false);
  };

  const phaseColor = (phase: string) => {
    if (phase === 'Remove') return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (phase === 'Create') return 'bg-emerald-400/10 text-emerald-400 border-emerald-500/20';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  // Loading state
  if (planLoading) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <h2 className="text-xl font-bold text-white">Restore: {snapshotName}</h2>
        <div className="flex items-center gap-3">
          <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-400">Computing restore plan... {planElapsed}</span>
        </div>
      </div>
    );
  }

  // Plan error
  if (planError) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <h2 className="text-xl font-bold text-white">Restore: {snapshotName}</h2>
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{planError}</div>
        <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] rounded-lg transition-colors">
          Back
        </button>
      </div>
    );
  }

  // No changes needed
  if (plan && plan.TotalChanges === 0) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <h2 className="text-xl font-bold text-white">Restore: {snapshotName}</h2>
        <div className="bg-emerald-400/5 border border-green-500/20 rounded-lg p-6 text-center">
          <p className="text-sm text-emerald-400">Tenant configuration already matches this snapshot. No changes needed.</p>
        </div>
        <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] rounded-lg transition-colors">
          Back
        </button>
      </div>
    );
  }

  // Show results after execution
  if (result) {
    const allSuccess = result.Failed === 0;
    return (
      <div className="p-6 max-w-3xl space-y-5">
        <h2 className="text-xl font-bold text-white">Restore Complete</h2>

        <div className={`p-4 rounded-lg border ${allSuccess ? 'bg-emerald-400/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
          <p className={`text-sm font-medium ${allSuccess ? 'text-emerald-400' : 'text-amber-400'}`}>
            {allSuccess
              ? `All ${result.Succeeded} operations succeeded.`
              : `${result.Succeeded} succeeded, ${result.Failed} failed.`}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Pre-restore backup saved as "{result.PreRestoreSnapshot}"
          </p>
        </div>

        {/* Step-by-step results */}
        <div className="space-y-1.5">
          {result.Results.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              r.Status === 'Success' ? 'bg-white/[0.02]' : 'bg-red-500/5'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${r.Status === 'Success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${phaseColor(r.Step.Phase)}`}>
                {r.Step.Phase}
              </span>
              <span className="text-zinc-400">{r.Step.Category}:</span>
              <span className="text-zinc-200">{r.Step.Identity}</span>
              {r.Error && <span className="text-red-400 ml-auto truncate max-w-[200px]" title={r.Error}>{r.Error}</span>}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-amber-500/70">
          Note: Policy changes may take up to 24 hours to propagate across your tenant.
        </p>

        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-zinc-300 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors">
          Done
        </button>
      </div>
    );
  }

  // Show dry-run plan + execute button
  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Restore: {snapshotName}</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Review the restore plan below. A pre-restore backup will be created automatically.
        </p>
        <p className="text-[11px] text-zinc-600 mt-1">
          Sensitivity label definitions are read-only and cannot be restored — only policies are modified.
        </p>
      </div>

      {/* Summary badges */}
      {plan && (
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 text-xs bg-zinc-800 text-zinc-200 rounded-lg font-medium">
            {plan.TotalChanges} change{plan.TotalChanges !== 1 ? 's' : ''}
          </span>
          {plan.Removals > 0 && (
            <span className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
              {plan.Removals} removal{plan.Removals !== 1 ? 's' : ''}
            </span>
          )}
          {plan.Creates > 0 && (
            <span className="px-2 py-1 text-[11px] bg-emerald-400/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
              {plan.Creates} create{plan.Creates !== 1 ? 's' : ''}
            </span>
          )}
          {plan.Updates > 0 && (
            <span className="px-2 py-1 text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
              {plan.Updates} update{plan.Updates !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Plan steps */}
      {plan && (
        <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="text-xs font-medium text-zinc-400">Restore Plan (dry run)</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {plan.Plan.map((step, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="text-zinc-600 w-4 text-right">{i + 1}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${phaseColor(step.Phase)}`}>
                  {step.Phase}
                </span>
                <span className="text-zinc-400">{step.Category}</span>
                <span className="text-zinc-200 font-medium">{step.Identity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ShowPowerShell cmdlet="Restore-SLSnapshot" params={{ Name: snapshotName }} />

      {executeError && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{executeError}</div>}

      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={executing}
          className="px-4 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors"
        >
          {executing ? 'Restoring...' : 'Execute Restore'}
        </button>
        {executing && executeElapsed && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            {executeElapsed}
          </span>
        )}
        <button onClick={onClose} disabled={executing} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] rounded-lg transition-colors disabled:opacity-40">
          Cancel
        </button>
      </div>

      {showConfirm && plan && (
        <ConfirmDialog
          title="Confirm Restore"
          message={`This will apply ${plan.TotalChanges} change${plan.TotalChanges !== 1 ? 's' : ''} to your tenant (${plan.Removals} removals, ${plan.Creates} creates, ${plan.Updates} updates). A pre-restore backup will be saved automatically.`}
          confirmLabel="Restore Now"
          variant="warning"
          onConfirm={handleExecute}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
