import React, { useState, useEffect, useCallback } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { formatSize, formatShortDate } from '../../lib/format';
import type { DriveLocation, FileItem } from './ExplorerPage';

interface FileListPanelProps {
  location: DriveLocation;
  onNavigate: (loc: DriveLocation) => void;
  onViewFile: (driveId: string, itemId: string, name: string) => void;
}

interface DriveChildrenResult {
  DriveId: string;
  ParentId: string | null;
  Count: number;
  Items: FileItem[];
}

export default function FileListPanel({ location, onNavigate, onViewFile }: FileListPanelProps) {
  const { invoke } = usePowerShell();
  const [items, setItems] = useState<FileItem[]>([]);
  const [driveId, setDriveId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Label action state
  const [labelName, setLabelName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const params: Record<string, unknown> = {};

      if (location.driveId.startsWith('site:')) {
        params.SiteId = location.driveId.replace('site:', '');
      } else {
        params.DriveId = location.driveId;
      }

      if (location.itemId) {
        params.ItemId = location.itemId;
      }

      const r = await invoke<DriveChildrenResult>('Get-SLDriveChildren', params);
      if (r.success && r.data) {
        setItems(r.data.Items || []);
        setDriveId(r.data.DriveId);
      } else {
        setError(r.error ?? 'Failed to load files');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setLoading(false);
  }, [location, invoke]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const handleFolderClick = (item: FileItem) => {
    const currentItemIds = location.itemIds ?? [undefined];
    onNavigate({
      driveId: driveId || location.driveId,
      itemId: item.Id,
      path: [...location.path, item.Name],
      itemIds: [...currentItemIds, item.Id],
    });
  };

  const handleBreadcrumb = (index: number) => {
    const itemIds = location.itemIds ?? [undefined];
    onNavigate({
      driveId: location.driveId,
      itemId: itemIds[index],
      path: location.path.slice(0, index + 1),
      itemIds: itemIds.slice(0, index + 1),
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const files = items.filter(i => !i.IsFolder);
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map(f => f.Id)));
    }
  };

  const handleLabelSelected = async () => {
    if (!labelName.trim() || selected.size === 0) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const selectedItems = items
        .filter(i => selected.has(i.Id))
        .map(i => ({ DriveId: driveId, ItemId: i.Id }));

      const r = await invoke('Set-SLDocumentLabelBulk', {
        Items: selectedItems,
        LabelName: labelName.trim(),
        DryRun: dryRun || undefined,
      });
      if (r.success) {
        setActionResult(dryRun
          ? `Dry run: ${selected.size} files would be labelled "${labelName}"`
          : `Applied label "${labelName}" to ${selected.size} files`);
      } else {
        setActionResult(`Error: ${r.error}`);
      }
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
    setActionLoading(false);
  };

  const handleUnlabelSelected = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const selectedItems = items
        .filter(i => selected.has(i.Id))
        .map(i => ({ DriveId: driveId, ItemId: i.Id }));

      const r = await invoke('Remove-SLDocumentLabelBulk', {
        Items: selectedItems,
        Mode: 'LabelOnly',
        DryRun: dryRun || undefined,
      });
      if (r.success) {
        setActionResult(dryRun
          ? `Dry run: ${selected.size} files would be unlabelled`
          : `Removed labels from ${selected.size} files`);
      } else {
        setActionResult(`Error: ${r.error}`);
      }
    } catch (e) {
      setActionResult(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
    setActionLoading(false);
  };

  const files = items.filter(i => !i.IsFolder);
  const allSelected = files.length > 0 && selected.size === files.length;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-1 text-xs">
        {location.path.map((segment, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-zinc-600">/</span>}
            <button
              onClick={() => handleBreadcrumb(i)}
              className={`px-1 py-0.5 rounded ${i === location.path.length - 1 ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {segment}
            </button>
          </React.Fragment>
        ))}
        {loading && <span className="text-zinc-600 ml-2">Loading...</span>}
      </div>

      {/* Toolbar */}
      {selected.size > 0 && (
        <div className="px-3 py-2 border-b border-white/[0.06] bg-blue-500/[0.04] flex items-center gap-2">
          <span className="text-xs text-blue-400">{selected.size} selected</span>
          <label className="flex items-center gap-1.5 ml-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-xs text-zinc-400">Dry run</span>
          </label>
          <div className="flex-1" />
          <input
            type="text"
            value={labelName}
            onChange={e => setLabelName(e.target.value)}
            placeholder="Label name..."
            className="px-2 py-1 text-xs bg-white/[0.05] border border-white/[0.08] rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 w-40"
          />
          <button
            onClick={handleLabelSelected}
            disabled={actionLoading || !labelName.trim()}
            className={`px-2 py-1 text-xs text-white disabled:opacity-50 rounded transition-colors ${
              dryRun ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {dryRun ? 'Preview Label' : 'Apply Label'}
          </button>
          <button
            onClick={handleUnlabelSelected}
            disabled={actionLoading}
            className={`px-2 py-1 text-xs text-white disabled:opacity-50 rounded transition-colors ${
              dryRun ? 'bg-orange-600 hover:bg-orange-500' : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {dryRun ? 'Preview Unlabel' : 'Remove Labels'}
          </button>
        </div>
      )}

      {/* Action result */}
      {actionResult && (
        <div className={`px-3 py-1.5 text-xs border-b border-white/[0.06] ${actionResult.startsWith('Error') ? 'text-red-400 bg-red-900/10' : 'text-emerald-400 bg-emerald-900/10'}`}>
          {actionResult}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-400 bg-red-900/10 border-b border-white/[0.06]">{error}</div>
      )}

      {/* File list header */}
      <div className="px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.01] grid grid-cols-[28px_1fr_80px_120px_100px] gap-2 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
        <div>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="rounded border-zinc-600"
          />
        </div>
        <div>Name</div>
        <div className="text-right">Size</div>
        <div>Modified</div>
        <div>Actions</div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.Id}
            className={`px-3 py-1.5 grid grid-cols-[28px_1fr_80px_120px_100px] gap-2 text-xs items-center border-b border-white/[0.02] hover:bg-white/[0.03] transition-colors ${
              selected.has(item.Id) ? 'bg-blue-500/[0.06]' : ''
            }`}
          >
            <div>
              {!item.IsFolder && (
                <input
                  type="checkbox"
                  checked={selected.has(item.Id)}
                  onChange={() => toggleSelect(item.Id)}
                  className="rounded border-zinc-600"
                />
              )}
            </div>
            <div className="truncate">
              {item.IsFolder ? (
                <button
                  onClick={() => handleFolderClick(item)}
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <span className="text-zinc-500">📁</span>
                  {item.Name}
                  {item.ChildCount !== null && (
                    <span className="text-zinc-600 text-[10px]">({item.ChildCount})</span>
                  )}
                </button>
              ) : (
                <span className="text-zinc-300">{item.Name}</span>
              )}
            </div>
            <div className="text-right text-zinc-500">
              {item.Size !== null ? formatSize(item.Size) : ''}
            </div>
            <div className="text-zinc-500 truncate">
              {item.LastModified ? formatShortDate(item.LastModified) : ''}
            </div>
            <div>
              {!item.IsFolder && (
                <button
                  onClick={() => onViewFile(driveId, item.Id, item.Name)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors"
                >
                  Details
                </button>
              )}
            </div>
          </div>
        ))}

        {!loading && items.length === 0 && !error && (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
            This folder is empty
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-white/[0.06] text-[10px] text-zinc-600 flex justify-between">
        <span>{items.length} items ({files.length} files)</span>
        <button onClick={fetchChildren} disabled={loading} className="hover:text-zinc-400 transition-colors">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}

