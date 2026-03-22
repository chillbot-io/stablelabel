import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import { ChevronRight, File, Folder } from 'lucide-react';
import type { DriveItem } from '@/lib/types';

interface BreadcrumbEntry {
  label: string;
  driveId: string;
  itemId: string | null;
}

export default function ExplorerPage() {
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [items, setItems] = useState<DriveItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState<{ id: string; name: string }[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDrives([]);
    setItems([]);
    setBreadcrumb([]);
    setSelectedDrive(null);
    api.get<{ value: { id: string; name: string }[] }>(`/tenants/${selected.id}/drives`)
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
                  </tr>
                </thead>
                <tbody>
                  {items
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
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
