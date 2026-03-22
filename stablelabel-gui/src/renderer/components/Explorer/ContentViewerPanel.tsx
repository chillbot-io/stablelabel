import React, { useState, useEffect } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface DocumentDetail {
  Name: string;
  Size: number;
  MimeType: string | null;
  WebUrl: string | null;
  CreatedDateTime: string | null;
  CreatedBy: string | null;
  LastModified: string | null;
  ModifiedBy: string | null;
  Labels: Array<{
    LabelId: string;
    Name: string;
    Description: string | null;
    Color: string | null;
    AssignmentMethod: string | null;
    IsProtected: boolean;
  }>;
  HasLabel: boolean;
  IsProtected: boolean;
}

interface ContentViewerPanelProps {
  driveId: string;
  itemId: string;
  fileName: string;
  onClose: () => void;
}

export default function ContentViewerPanel({ driveId, itemId, fileName, onClose }: ContentViewerPanelProps) {
  const { invoke } = usePowerShell();
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await invoke<DocumentDetail>('Get-SLDocumentDetail', {
          DriveId: driveId,
          ItemId: itemId,
        });
        if (cancelled) return;
        if (r.success && r.data) {
          setDetail(r.data);
        } else {
          setError(r.error ?? 'Failed to load details');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed');
      }
      if (!cancelled) setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [driveId, itemId, invoke]);

  return (
    <div className="w-80 flex-shrink-0 bg-zinc-950 border-l border-white/[0.06] flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-white/[0.06] flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200 truncate">{fileName}</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">Document Details</p>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-sm ml-2 shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading && (
          <div className="text-xs text-zinc-600 py-4 text-center">Loading details...</div>
        )}

        {error && (
          <div className="p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">{error}</div>
        )}

        {detail && (
          <>
            {/* Label section */}
            <Section title="Sensitivity Label">
              {detail.HasLabel ? (
                detail.Labels.map((label, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-2">
                      {label.Color && (
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.Color }} />
                      )}
                      <span className="text-sm font-medium text-zinc-200">{label.Name}</span>
                    </div>
                    {label.Description && (
                      <p className="text-[11px] text-zinc-500">{label.Description}</p>
                    )}
                    <DetailRow label="Assignment Method" value={formatAssignmentMethod(label.AssignmentMethod)} />
                    <DetailRow label="Label ID" value={label.LabelId} mono />
                    <DetailRow
                      label="Protection"
                      value={label.IsProtected ? 'Encrypted' : 'No encryption'}
                      valueClass={label.IsProtected ? 'text-amber-400' : 'text-zinc-400'}
                    />
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No sensitivity label applied</p>
              )}
            </Section>

            {/* Protection section */}
            <Section title="Encryption Status">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${detail.IsProtected ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                <span className={`text-xs ${detail.IsProtected ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {detail.IsProtected ? 'Document is encrypted (RMS)' : 'Not encrypted'}
                </span>
              </div>
            </Section>

            {/* File metadata */}
            <Section title="File Information">
              <DetailRow label="File Name" value={detail.Name} />
              <DetailRow label="Size" value={detail.Size ? formatSize(detail.Size) : 'Unknown'} />
              <DetailRow label="Type" value={detail.MimeType} />
              <DetailRow label="Created" value={detail.CreatedDateTime ? formatDateTime(detail.CreatedDateTime) : null} />
              <DetailRow label="Created By" value={detail.CreatedBy} />
              <DetailRow label="Last Modified" value={detail.LastModified ? formatDateTime(detail.LastModified) : null} />
              <DetailRow label="Modified By" value={detail.ModifiedBy} />
            </Section>

            {/* Link */}
            {detail.WebUrl && (
              <Section title="Location">
                <p className="text-[11px] text-zinc-500 break-all font-mono">{detail.WebUrl}</p>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono, valueClass }: { label: string; value: string | null | undefined; mono?: boolean; valueClass?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-right truncate ${mono ? 'font-mono text-[10px]' : ''} ${valueClass || 'text-zinc-300'}`}>{value}</span>
    </div>
  );
}

function formatAssignmentMethod(method: string | null): string {
  if (!method) return 'Unknown';
  switch (method.toLowerCase()) {
    case 'standard': return 'Manual';
    case 'auto': return 'Auto-label policy';
    case 'privileged': return 'Admin/service';
    default: return method;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}
