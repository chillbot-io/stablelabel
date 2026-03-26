import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useAuth } from '@/hooks/useAuth';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import Modal from '@/components/Modal';
import { ChevronRight, File, Folder, Tag, Trash2 } from 'lucide-react';
import type { DriveItem, SensitivityLabel } from '@/lib/types';

interface BreadcrumbEntry {
  label: string;
  driveId: string;
  itemId: string | null;
}

export default function ExplorerPage() {
  const { user } = useAuth();
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [items, setItems] = useState<DriveItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState<{ id: string; name: string }[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
  const [labelTarget, setLabelTarget] = useState<DriveItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<DriveItem | null>(null);
  const [labels, setLabels] = useState<SensitivityLabel[]>([]);
  const [labeling, setLabeling] = useState(false);

  const canEdit = user?.role !== 'Viewer';

  // Load labels when tenant changes
  useEffect(() => {
    if (!selected) return;
    api.get<SensitivityLabel[]>(`/tenants/${selected.id}/labels?appliable_only=true`)
      .then(setLabels)
      .catch(() => {});
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDrives([]);
    setItems([]);
    setBreadcrumb([]);
    setSelectedDrive(null);
    api.get<{ value: { id: string; name: string }[] }>(`/tenants/${selected.id}/drives`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setDrives(data.value ?? []); })
      .catch((err) => { if (!controller.signal.aborted) showError(err.message ?? 'Failed to load drives'); });
    return () => controller.abort();
  }, [selected, showError]);

  const loadFolder = useCallback(async (driveId: string, itemId: string | null) => {
    if (!selected) return;
    setLoading(true);
    const path = itemId
      ? `/tenants/${selected.id}/drives/${driveId}/items/${itemId}/children`
      : `/tenants/${selected.id}/drives/${driveId}/root/children`;
    try {
      const data = await api.get<{ value: DriveItem[] }>(path);
      setItems(data.value ?? []);
    } catch (err) {
      setItems([]);
      showError(err instanceof Error ? err.message : 'Failed to load folder');
    }
    setLoading(false);
  }, [selected, showError]);

  const navigateTo = (driveId: string, itemId: string | null, label: string, depth: number) => {
    const newBreadcrumb = [...breadcrumb.slice(0, depth), { label, driveId, itemId }];
    setBreadcrumb(newBreadcrumb);
    setSelectedDrive(driveId);
    loadFolder(driveId, itemId);
  };

  const applyLabel = async (item: DriveItem, labelId: string) => {
    if (!selected || !selectedDrive) return;
    setLabeling(true);
    try {
      await api.post(`/tenants/${selected.id}/documents/apply-label`, {
        drive_id: selectedDrive,
        item_id: item.id,
        sensitivity_label_id: labelId,
      });
      setLabelTarget(null);
      // Reload folder to reflect updated label
      const last = breadcrumb[breadcrumb.length - 1];
      if (last) loadFolder(last.driveId, last.itemId);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to apply label');
    }
    setLabeling(false);
  };

  const removeLabel = async (item: DriveItem) => {
    if (!selected || !selectedDrive) return;
    setLabeling(true);
    try {
      await api.post(`/tenants/${selected.id}/documents/remove-label`, {
        drive_id: selectedDrive,
        item_id: item.id,
      });
      setRemoveTarget(null);
      const last = breadcrumb[breadcrumb.length - 1];
      if (last) loadFolder(last.driveId, last.itemId);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove label');
    }
    setLabeling(false);
  };

  return (
    <div className="p-6">
      <PageHeader title="Explorer" description="Browse SharePoint sites and OneDrive files">
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
      </PageHeader>

      <div className="flex gap-6">
        <div className="w-56 shrink-0">
          <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">Drives</h3>
          <div className="space-y-0.5">
            {drives.map((d) => (
              <button
                key={d.id}
                onClick={() => navigateTo(d.id, null, d.name, 0)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedDrive === d.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                {d.name}
              </button>
            ))}
            {drives.length === 0 && <p className="text-xs text-zinc-500 px-3">No drives found</p>}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-zinc-400 mb-3">
              {breadcrumb.map((entry, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="text-zinc-600" />}
                  <button onClick={() => navigateTo(entry.driveId, entry.itemId, entry.label, i)} className="hover:text-zinc-200 transition-colors">
                    {entry.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-zinc-500">Loading...</div>
          ) : !selectedDrive ? (
            <div className="text-center py-12 text-zinc-500 text-sm">Select a drive to browse files</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">Empty folder</div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 uppercase" scope="col">Name</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 uppercase w-32" scope="col">Size</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 uppercase w-40" scope="col">Label</th>
                    {canEdit && <th className="text-right py-2 px-3 text-xs font-medium text-zinc-500 uppercase w-28" scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...items]
                    .sort((a, b) => (a.folder && !b.folder ? -1 : !a.folder && b.folder ? 1 : a.name.localeCompare(b.name)))
                    .map((item) => (
                      <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2 px-3">
                          {item.folder ? (
                            <button onClick={() => navigateTo(selectedDrive!, item.id, item.name, breadcrumb.length)} className="flex items-center gap-2 text-zinc-200 hover:text-zinc-100">
                              <Folder size={16} className="text-zinc-500" />
                              {item.name}
                            </button>
                          ) : (
                            <span className="flex items-center gap-2 text-zinc-300">
                              <File size={16} className="text-zinc-600" />
                              {item.name}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs text-zinc-500">
                          {item.size ? formatBytes(item.size) : '--'}
                        </td>
                        <td className="py-2 px-3 text-xs text-zinc-500">
                          {item.sensitivityLabel?.displayName ?? '--'}
                        </td>
                        {canEdit && (
                          <td className="py-2 px-3 text-right">
                            {!item.folder && (
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setLabelTarget(item)}
                                  title="Apply label"
                                  className="p-1 rounded text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-colors"
                                >
                                  <Tag size={14} />
                                </button>
                                {item.sensitivityLabel && (
                                  <button
                                    onClick={() => setRemoveTarget(item)}
                                    title="Remove label"
                                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {/* Apply Label Modal */}
      {labelTarget && (
        <Modal title={`Apply Label — ${labelTarget.name}`} onClose={() => setLabelTarget(null)}>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Select a sensitivity label to apply to this file.</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {labels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => applyLabel(labelTarget, l.id)}
                  disabled={labeling}
                  className="w-full text-left px-3 py-2 rounded text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-between"
                >
                  <span className="text-zinc-200">{l.display_name || l.name}</span>
                  {l.has_protection && <span className="text-xs text-yellow-500">Encrypted</span>}
                </button>
              ))}
              {labels.length === 0 && <p className="text-xs text-zinc-500 py-2">No labels available</p>}
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={() => setLabelTarget(null)} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          </div>
        </Modal>
      )}

      {/* Remove Label Confirmation */}
      {removeTarget && (
        <Modal title="Remove Label" onClose={() => setRemoveTarget(null)}>
          <p className="text-sm text-zinc-400 mb-4">
            Remove the sensitivity label <span className="text-zinc-200 font-medium">{removeTarget.sensitivityLabel?.displayName}</span> from <span className="text-zinc-200 font-medium">{removeTarget.name}</span>?
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRemoveTarget(null)} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
            <button
              onClick={() => removeLabel(removeTarget)}
              disabled={labeling}
              className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-500 disabled:opacity-50"
            >
              {labeling ? 'Removing...' : 'Remove Label'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
