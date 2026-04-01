import React, { useEffect, useState } from 'react';

interface ScanProgress {
  phase: string;
  total: number;
  processed: number;
  success?: number;
  failed?: number;
  matched?: number;
  skipped?: number;
  file?: string;
  folders_scanned?: number;
  folders_remaining?: number;
}

interface Props {
  /** Whether the parent operation is currently running */
  active: boolean;
}

/**
 * Real-time progress bar that listens to SL_PROGRESS events from PowerShell.
 * Drop into any component that runs a bulk PS cmdlet.
 */
export default function ScanProgressBar({ active }: Props) {
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    return window.stablelabel.onPsProgress((p) => {
      setProgress(p as ScanProgress);
    });
  }, [active]);

  if (!active || !progress) return null;

  const pct = progress.total > 0
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : 0;

  const isEnumerating = progress.phase === 'enumerating';

  return (
    <div className="space-y-2 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
      {/* Phase label */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 capitalize">{progress.phase}</span>
        {!isEnumerating && (
          <span className="text-zinc-500 tabular-nums">
            {progress.processed} / {progress.total}
            {pct > 0 && ` (${pct}%)`}
          </span>
        )}
        {isEnumerating && progress.folders_scanned !== undefined && (
          <span className="text-zinc-500 tabular-nums">
            {progress.total} files found &middot; {progress.folders_scanned} folders scanned
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isEnumerating && (
        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Indeterminate bar for enumeration */}
      {isEnumerating && (
        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-blue-500/60 rounded-full animate-pulse" />
        </div>
      )}

      {/* Counters */}
      <div className="flex gap-4 text-[11px]">
        {progress.success !== undefined && (
          <span className="text-emerald-400">{progress.success} succeeded</span>
        )}
        {progress.failed !== undefined && progress.failed > 0 && (
          <span className="text-red-400">{progress.failed} failed</span>
        )}
        {progress.matched !== undefined && (
          <span className="text-zinc-400">{progress.matched} matched</span>
        )}
        {progress.skipped !== undefined && progress.skipped > 0 && (
          <span className="text-zinc-500">{progress.skipped} skipped</span>
        )}
      </div>

      {/* Current file */}
      {progress.file && (
        <div className="text-[11px] text-zinc-500 truncate" title={progress.file}>
          {progress.file}
        </div>
      )}
    </div>
  );
}
