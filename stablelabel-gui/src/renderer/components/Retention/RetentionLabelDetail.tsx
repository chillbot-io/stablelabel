import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { RetentionLabel } from '../../lib/types';

interface Props {
  labelName: string;
  onEdit: (name: string) => void;
  onDeleted: () => void;
}

export default function RetentionLabelDetail({ labelName, onEdit, onDeleted }: Props) {
  const { invoke } = usePowerShell();
  const [label, setLabel] = useState<RetentionLabel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    invoke<RetentionLabel>(`Get-SLRetentionLabel -Identity '${labelName}'`).then(r => {
      if (r.success && r.data) setLabel(r.data);
      else setError(r.error ?? 'Not found');
      setLoading(false);
    });
  }, [labelName]);

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error || !label) return <div className="p-6"><div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">{error ?? 'Not found'}</div></div>;

  const durationText = label.RetentionDuration != null
    ? label.RetentionDuration >= 365
      ? `${Math.round(label.RetentionDuration / 365)} years (${label.RetentionDuration} days)`
      : `${label.RetentionDuration} days`
    : 'Unlimited';

  const actionText = label.RetentionAction === 'KeepAndDelete' ? 'Retain then delete'
    : label.RetentionAction === 'Keep' ? 'Retain forever'
    : label.RetentionAction === 'Delete' ? 'Delete after period'
    : label.RetentionAction ?? 'None';

  const typeText = label.RetentionType === 'CreationAgeInDays' ? 'From creation date'
    : label.RetentionType === 'ModificationAgeInDays' ? 'From last modified date'
    : label.RetentionType === 'TaggedAgeInDays' ? 'From when labeled'
    : label.RetentionType ?? 'N/A';

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{label.Name}</h2>
          {label.Comment && <p className="text-sm text-zinc-400 mt-1">{label.Comment}</p>}
        </div>
        <div className="flex items-center gap-2">
          {label.IsRecordLabel && <span className="px-2 py-1 text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg">Record</span>}
          {label.IsRegulatoryLabel && <span className="px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">Regulatory</span>}
          <button onClick={() => onEdit(labelName)} className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors">Edit</button>
        </div>
      </div>

      {/* Retention config — the most important thing to see at a glance */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">Retention Configuration</h3>
        <div className="grid grid-cols-3 gap-4">
          <div><dt className="text-xs text-zinc-500">Duration</dt><dd className="text-sm text-zinc-200 mt-0.5">{durationText}</dd></div>
          <div><dt className="text-xs text-zinc-500">Action</dt><dd className="text-sm text-zinc-200 mt-0.5">{actionText}</dd></div>
          <div><dt className="text-xs text-zinc-500">Based On</dt><dd className="text-sm text-zinc-200 mt-0.5">{typeText}</dd></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card label="GUID" value={label.Guid} mono />
        <Card label="Created" value={fmt(label.WhenCreated)} />
        <Card label="Last Modified" value={fmt(label.WhenChanged)} />
      </div>

      <RawJson data={label} />
    </div>
  );
}

function Card({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-white/[0.03] rounded-lg p-3"><dt className="text-xs text-zinc-500 mb-1">{label}</dt><dd className={`text-sm text-zinc-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</dd></div>;
}

function RawJson({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/[0.06] pt-4">
      <button onClick={() => setOpen(!open)} className="text-xs text-zinc-500 hover:text-zinc-300">{open ? '▾ Hide' : '▸ Show'} raw JSON</button>
      {open && <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function fmt(d: string | null | undefined) { if (!d) return 'N/A'; try { return new Date(d).toLocaleString(); } catch { return d; } }
