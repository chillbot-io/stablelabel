import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { DlpRule } from '../../lib/types';

interface Props { ruleName: string; onEdit: (name: string) => void; onDeleted: () => void; onOpenPolicy: (name: string) => void; }

export default function DlpRuleDetail({ ruleName, onEdit, onDeleted, onOpenPolicy }: Props) {
  const { invoke } = usePowerShell();
  const [rule, setRule] = useState<DlpRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    invoke<DlpRule>('Get-SLDlpRule', { Identity: ruleName }).then(r => {
      if (r.success && r.data) setRule(r.data);
      else setError(r.error ?? 'Not found');
      setLoading(false);
    });
  }, [ruleName]);

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error || !rule) return <div className="p-6"><div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">{error ?? 'Not found'}</div></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{rule.Name}</h2>
          {rule.Comment && <p className="text-sm text-zinc-400 mt-1">{rule.Comment}</p>}
        </div>
        <div className="flex items-center gap-2">
          {rule.Disabled && <span className="px-2 py-1 text-xs bg-white/[0.08]/50 text-zinc-400 border border-gray-600 rounded-lg">Disabled</span>}
          <button onClick={() => onEdit(ruleName)} className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors">Edit</button>
        </div>
      </div>

      {/* Key settings highlighted */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Rule Actions</h3>
        <div className="grid grid-cols-3 gap-4">
          <div><dt className="text-xs text-zinc-500">Block Access</dt><dd className={`text-sm mt-0.5 ${rule.BlockAccess ? 'text-red-400 font-medium' : 'text-zinc-400'}`}>{rule.BlockAccess ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-xs text-zinc-500">Notify Users</dt><dd className="text-sm text-zinc-200 mt-0.5">{rule.NotifyUser?.length ? rule.NotifyUser.join(', ') : 'None'}</dd></div>
          <div><dt className="text-xs text-zinc-500">Generate Alert</dt><dd className="text-sm text-zinc-200 mt-0.5">{rule.GenerateAlert?.length ? rule.GenerateAlert.join(', ') : 'None'}</dd></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card label="GUID" value={rule.Guid} mono />
        <div className="bg-white/[0.03] rounded-lg p-3">
          <dt className="text-xs text-zinc-500 mb-1">Parent Policy</dt>
          <dd><button onClick={() => onOpenPolicy(rule.Policy)} className="text-sm text-blue-400 hover:text-blue-300">{rule.Policy}</button></dd>
        </div>
        {rule.Priority != null && <Card label="Priority" value={String(rule.Priority)} />}
      </div>

      {/* Sensitive info types */}
      {rule.ContentContainsSensitiveInformation && rule.ContentContainsSensitiveInformation.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Detects Sensitive Info Types</h3>
          <div className="space-y-1.5">
            {rule.ContentContainsSensitiveInformation.map((sit, i) => {
              const s = sit as Record<string, unknown>;
              return <div key={i} className="px-2.5 py-1.5 bg-white/[0.06] rounded-lg text-xs text-zinc-300">{String(s.Name ?? s.name ?? JSON.stringify(s))}{s.minCount != null && <span className="text-zinc-500 ml-2">min: {String(s.minCount)}</span>}</div>;
            })}
          </div>
        </div>
      )}

      <RawJson data={rule} />
    </div>
  );
}

function Card({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-white/[0.03] rounded-lg p-3"><dt className="text-xs text-zinc-500 mb-1">{label}</dt><dd className={`text-sm text-zinc-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</dd></div>;
}
function RawJson({ data }: { data: unknown }) { const [o, setO] = useState(false); return <div className="border-t border-white/[0.06] pt-4"><button onClick={() => setO(!o)} className="text-xs text-zinc-500 hover:text-zinc-300">{o ? '▾ Hide' : '▸ Show'} raw JSON</button>{o && <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>}</div>; }
