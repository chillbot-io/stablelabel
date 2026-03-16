import React, { useState } from 'react';
import type { SnapshotDiff } from '../../lib/types';
import ExportButton from '../common/ExportButton';

interface Props { diff: SnapshotDiff; onClose: () => void; }

export default function SnapshotDiffView({ diff, onClose }: Props) {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Snapshot Comparison</h2>
          <p className="text-sm text-gray-400 mt-1">
            {diff.ReferenceSnapshot} vs {diff.ComparisonSource}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Compared at {diff.ComparedAt}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton data={diff} filename={`snapshot-diff-${diff.ReferenceSnapshot}`} label="Export" />
          <span className={`px-2 py-1 text-xs rounded ${diff.HasChanges ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
            {diff.HasChanges ? 'Changes Detected' : 'No Changes'}
          </span>
          <button onClick={onClose} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 rounded transition-colors">Close</button>
        </div>
      </div>

      {!diff.HasChanges ? (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-6 text-center">
          <p className="text-sm text-green-400">Tenant configuration matches the snapshot. No drift detected.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(diff.Categories).map(([category, data]) => (
            <CategoryDiff key={category} category={category} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryDiff({ category, data }: { category: string; data: { Added: Array<{ Identity: string }>; Removed: Array<{ Identity: string }>; Modified: Array<{ Identity: string; PropertyChanges?: Array<{ Property: string; OldValue: string; NewValue: string }> }>; Summary: { AddedCount: number; RemovedCount: number; ModifiedCount: number; UnchangedCount: number } } }) {
  const [expanded, setExpanded] = useState(data.Summary.AddedCount + data.Summary.RemovedCount + data.Summary.ModifiedCount > 0);
  const hasChanges = data.Summary.AddedCount + data.Summary.RemovedCount + data.Summary.ModifiedCount > 0;

  return (
    <div className={`border rounded-lg overflow-hidden ${hasChanges ? 'border-yellow-500/20' : 'border-gray-800'}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800/80 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{expanded ? '▾' : '▸'}</span>
          <span className="text-sm font-medium text-gray-200">{category}</span>
        </div>
        <div className="flex items-center gap-2">
          {data.Summary.AddedCount > 0 && <Badge label={`+${data.Summary.AddedCount}`} color="green" />}
          {data.Summary.RemovedCount > 0 && <Badge label={`-${data.Summary.RemovedCount}`} color="red" />}
          {data.Summary.ModifiedCount > 0 && <Badge label={`~${data.Summary.ModifiedCount}`} color="yellow" />}
          <span className="text-[10px] text-gray-600">{data.Summary.UnchangedCount} unchanged</span>
        </div>
      </button>

      {expanded && hasChanges && (
        <div className="px-4 py-3 space-y-2 bg-gray-950">
          {data.Added.map((item, i) => (
            <div key={`a-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-green-500/5">
              <span className="text-[10px] px-1 py-0.5 bg-green-500/20 text-green-400 rounded">Added</span>
              <span className="text-xs text-gray-300">{item.Identity}</span>
            </div>
          ))}
          {data.Removed.map((item, i) => (
            <div key={`r-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-red-500/5">
              <span className="text-[10px] px-1 py-0.5 bg-red-500/20 text-red-400 rounded">Removed</span>
              <span className="text-xs text-gray-300">{item.Identity}</span>
            </div>
          ))}
          {data.Modified.map((item, i) => (
            <ModifiedItem key={`m-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModifiedItem({ item }: { item: { Identity: string; PropertyChanges?: Array<{ Property: string; OldValue: string; NewValue: string }> } }) {
  const [expanded, setExpanded] = useState(false);
  const hasProps = item.PropertyChanges && item.PropertyChanges.length > 0;

  return (
    <div className="rounded bg-yellow-500/5">
      <div
        className={`flex items-center gap-2 px-2.5 py-1.5 ${hasProps ? 'cursor-pointer' : ''}`}
        onClick={() => hasProps && setExpanded(!expanded)}
      >
        <span className="text-[10px] px-1 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">Modified</span>
        <span className="text-xs text-gray-300 flex-1">{item.Identity}</span>
        {hasProps && (
          <span className="text-[10px] text-gray-500">{expanded ? '▾' : '▸'} {item.PropertyChanges!.length} prop{item.PropertyChanges!.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      {expanded && hasProps && (
        <div className="px-3 pb-2 space-y-1">
          {item.PropertyChanges!.map((pc, j) => (
            <div key={j} className="flex items-start gap-2 px-2 py-1 bg-gray-900/50 rounded text-[10px]">
              <span className="text-gray-400 font-medium min-w-[80px]">{pc.Property}</span>
              <span className="text-red-400 line-through">{pc.OldValue || '(empty)'}</span>
              <span className="text-gray-600">→</span>
              <span className="text-green-400">{pc.NewValue || '(empty)'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const cls = color === 'green' ? 'bg-green-500/10 text-green-400'
    : color === 'red' ? 'bg-red-500/10 text-red-400'
    : 'bg-yellow-500/10 text-yellow-400';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}
