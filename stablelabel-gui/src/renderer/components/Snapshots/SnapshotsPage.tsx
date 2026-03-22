import React, { useState, useCallback } from 'react';
import SnapshotList from './SnapshotList';
import SnapshotDetail from './SnapshotDetail';
import SnapshotCreate from './SnapshotCreate';
import SnapshotDiffView from './SnapshotDiffView';
import SnapshotRestore from './SnapshotRestore';
import type { SnapshotDiff } from '../../lib/types';

type View = { type: 'empty' } | { type: 'detail'; name: string } | { type: 'create' } | { type: 'diff'; diff: SnapshotDiff } | { type: 'restore'; name: string };

export default function SnapshotsPage() {
  const [view, setView] = useState<View>({ type: 'empty' });
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedName = view.type === 'detail' ? view.name : null;

  const handleSelect = useCallback((name: string) => {
    setView({ type: 'detail', name });
  }, []);

  const handleCreated = useCallback((name: string) => {
    setRefreshKey(k => k + 1);
    setView({ type: 'detail', name });
  }, []);

  const handleDeleted = useCallback(() => {
    setRefreshKey(k => k + 1);
    setView({ type: 'empty' });
  }, []);

  const handleCompare = useCallback((diff: SnapshotDiff) => {
    setView({ type: 'diff', diff });
  }, []);

  const handleRestore = useCallback((name: string) => {
    setView({ type: 'restore', name });
  }, []);

  const handleRestored = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-zinc-950">
        <div className="p-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-300">Snapshots</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Capture, compare, and restore tenant config</p>
        </div>

        <div className="flex-1 overflow-hidden">
          <SnapshotList onSelect={handleSelect} selectedName={selectedName} refreshKey={refreshKey} />
        </div>

        <div className="p-2 border-t border-white/[0.06]">
          <button onClick={() => setView({ type: 'create' })} className="w-full py-1.5 text-xs text-blue-300 hover:text-blue-200 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors">
            + New Snapshot
          </button>
        </div>
      </div>

      {/* Right workspace */}
      <div className="flex-1 overflow-auto">
        {view.type === 'empty' && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <h2 className="text-lg font-semibold text-zinc-300 mb-2">Select a snapshot or create new</h2>
              <p className="text-sm text-zinc-500 mb-4">Snapshots capture your tenant's labels, policies, and rules for comparison or rollback.</p>
              <button onClick={() => setView({ type: 'create' })} className="px-4 py-2 text-xs text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors">
                + New Snapshot
              </button>
            </div>
          </div>
        )}
        {view.type === 'detail' && (
          <SnapshotDetail snapshotName={view.name} onDeleted={handleDeleted} onCompare={handleCompare} onRestore={() => handleRestore(view.name)} />
        )}
        {view.type === 'create' && (
          <SnapshotCreate onCreated={handleCreated} />
        )}
        {view.type === 'diff' && (
          <SnapshotDiffView diff={view.diff} onClose={() => setView({ type: 'empty' })} />
        )}
        {view.type === 'restore' && (
          <SnapshotRestore snapshotName={view.name} onClose={() => setView({ type: 'detail', name: view.name })} onRestored={handleRestored} />
        )}
      </div>
    </div>
  );
}
