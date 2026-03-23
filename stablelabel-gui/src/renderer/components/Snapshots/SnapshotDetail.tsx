import React, { useEffect, useState, useRef } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import ConfirmDialog from '../common/ConfirmDialog';
import type { SnapshotSummary, SnapshotDiff } from '../../lib/types';

interface Props {
  snapshotName: string;
  onDeleted: () => void;
  onCompare: (diff: SnapshotDiff) => void;
  onRestore?: () => void;
}

export default function SnapshotDetail({ snapshotName, onDeleted, onCompare, onRestore }: Props) {
  const { invoke } = usePowerShell();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const [snap, setSnap] = useState<SnapshotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const compareElapsed = useElapsedTime(comparing);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    invoke<SnapshotSummary[]>('Get-SLSnapshot').then(r => {
      if (cancelled) return;
      if (r.success && Array.isArray(r.data)) {
        const found = r.data.find(s => s.Name === snapshotName);
        if (found) setSnap(found); else setError('Snapshot not found');
      } else { setError(r.error ?? 'Failed'); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [snapshotName, invoke]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const r = await invoke('Remove-SLSnapshot', { Name: snapshotName });
      if (!mountedRef.current) return;
      if (r.success) { setShowDelete(false); onDeleted(); }
      else setError(r.error ?? 'Delete failed');
    } catch (e) { if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed'); }
    if (mountedRef.current) setDeleting(false);
  };

  const handleCompareLive = async () => {
    setComparing(true); setCompareError(null);
    try {
      const r = await invoke<SnapshotDiff>('Compare-SLSnapshot', { Name: snapshotName, Live: true });
      if (!mountedRef.current) return;
      if (r.success && r.data) onCompare(r.data);
      else setCompareError(r.error ?? 'Compare failed');
    } catch (e) { if (mountedRef.current) setCompareError(e instanceof Error ? e.message : 'Failed'); }
    if (mountedRef.current) setComparing(false);
  };

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error || !snap) return <div className="p-6"><div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">{error ?? 'Not found'}</div></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{snap.Name}</h2>
          <p className="text-sm text-zinc-400 mt-1">Captured {snap.CreatedAt} by {snap.CreatedBy}</p>
        </div>
        <span className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">{snap.Scope}</span>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-3">
        <Card label="Snapshot ID" value={snap.SnapshotId} mono />
        <Card label="Tenant ID" value={snap.TenantId} mono />
        <Card label="Size" value={`${snap.SizeMB?.toFixed(2)} MB`} />
      </div>

      {/* Item counts */}
      {snap.Items && Object.keys(snap.Items).length > 0 && (
        <div className="bg-white/[0.03] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Captured Items</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(snap.Items).map(([category, count]) => (
              <div key={category} className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.06] rounded-lg">
                <span className="text-xs text-zinc-300">{category}</span>
                <span className="text-sm font-medium text-zinc-200">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={handleCompareLive} disabled={comparing} className="px-4 py-2 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors disabled:opacity-40">
          {comparing ? 'Comparing...' : 'Compare to Live'}
        </button>
        {comparing && compareElapsed && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {compareElapsed}
          </span>
        )}
        {onRestore && (
          <button onClick={onRestore} className="px-4 py-2 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors">
            Restore
          </button>
        )}
        <button onClick={() => setShowDelete(true)} className="px-4 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors">
          Delete
        </button>
      </div>

      {compareError && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{compareError}</div>}

      <Card label="File Path" value={snap.Path} mono />

      {showDelete && (
        <ConfirmDialog
          title="Delete Snapshot"
          message={`Permanently delete snapshot "${snap.Name}"? This cannot be undone.`}
          confirmLabel="Delete Snapshot"
          variant="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function Card({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3">
      <dt className="text-xs text-zinc-500 mb-1">{label}</dt>
      <dd className={`text-sm text-zinc-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</dd>
    </div>
  );
}
