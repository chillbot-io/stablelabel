import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { DlpPolicy, DlpRule } from '../../lib/types';

interface Props { policyName: string; onEdit: (name: string) => void; onDeleted: () => void; onOpenRule: (name: string) => void; }

const modeInfo = (mode: string | null) => {
  switch (mode?.toLowerCase()) {
    case 'enable': return { text: 'Enforcing', color: 'bg-emerald-400/10 text-emerald-400 border border-green-500/20', desc: 'This policy is actively enforcing DLP rules.' };
    case 'testwithnotifications': return { text: 'Test + Notifications', color: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20', desc: 'Running in test mode. Matches are logged and users notified, but content is not blocked.' };
    case 'testwithoutnotifications': return { text: 'Test (Silent)', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', desc: 'Running in silent test mode. Matches are logged but no notifications or blocking.' };
    default: return { text: mode ?? 'Unknown', color: 'bg-white/[0.08]/50 text-zinc-400 border border-gray-600', desc: '' };
  }
};

export default function DlpPolicyDetail({ policyName, onEdit, onDeleted, onOpenRule }: Props) {
  const { invoke } = usePowerShell();
  const [policy, setPolicy] = useState<DlpPolicy | null>(null);
  const [rules, setRules] = useState<DlpRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const escaped = policyName.replace(/'/g, "''");
    Promise.all([
      invoke<DlpPolicy>(`Get-SLDlpPolicy -Identity '${escaped}'`),
      invoke<DlpRule[]>(`Get-SLDlpRule -Policy '${escaped}'`),
    ]).then(([pRes, rRes]) => {
      if (pRes.success && pRes.data) setPolicy(pRes.data);
      else setError(pRes.error ?? 'Not found');
      if (rRes.success && Array.isArray(rRes.data)) setRules(rRes.data);
      setLoading(false);
    });
  }, [policyName]);

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error || !policy) return <div className="p-6"><div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">{error ?? 'Not found'}</div></div>;

  const mi = modeInfo(policy.Mode);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{policy.Name}</h2>
          {policy.Comment && <p className="text-sm text-zinc-400 mt-1">{policy.Comment}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs rounded-lg ${mi.color}`}>{mi.text}</span>
          <button onClick={() => onEdit(policyName)} className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors">Edit</button>
        </div>
      </div>

      {mi.desc && <div className={`rounded-lg p-3 border ${policy.Mode?.toLowerCase() === 'enable' ? 'bg-emerald-400/5 border-green-500/20' : policy.Mode?.toLowerCase() === 'testwithnotifications' ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}><p className="text-xs text-zinc-300">{mi.desc}</p></div>}

      <div className="grid grid-cols-2 gap-4">
        <Card label="GUID" value={policy.Guid} mono />
        <Card label="Created" value={fmt(policy.WhenCreated)} />
        <Card label="Last Modified" value={fmt(policy.WhenChanged)} />
      </div>

      {/* Rules */}
      <div className="bg-white/[0.03] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Rules ({rules.length})</h3>
        {rules.length === 0 ? <p className="text-sm text-zinc-500">No rules configured. Add rules to define what this policy detects.</p> : (
          <div className="space-y-2">
            {rules.map(rule => (
              <button key={rule.Guid ?? rule.Name} onClick={() => onOpenRule(rule.Name)} className="w-full text-left p-2.5 bg-white/[0.06] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-200">{rule.Name}</span>
                  <div className="flex items-center gap-1.5">
                    {rule.BlockAccess && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-lg">Blocks</span>}
                    {rule.Disabled && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.08] text-zinc-400 rounded-lg">Disabled</span>}
                  </div>
                </div>
                {rule.Comment && <p className="text-xs text-zinc-500 mt-0.5 truncate">{rule.Comment}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Locations */}
      <div className="bg-white/[0.03] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Scoped Locations</h3>
        <div className="space-y-3">
          <Loc label="Exchange" locations={policy.ExchangeLocation} />
          <Loc label="SharePoint" locations={policy.SharePointLocation} />
          <Loc label="OneDrive" locations={policy.OneDriveLocation} />
          <Loc label="Teams" locations={policy.TeamsLocation} />
        </div>
      </div>

      <RawJson data={policy} />
    </div>
  );
}

function Card({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-white/[0.03] rounded-lg p-3"><dt className="text-xs text-zinc-500 mb-1">{label}</dt><dd className={`text-sm text-zinc-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</dd></div>;
}
function Loc({ label, locations }: { label: string; locations: string[] | null }) {
  const items = locations?.filter(Boolean) ?? [];
  const isAll = items.length === 1 && items[0]?.toLowerCase() === 'all';
  return <div className="flex items-start gap-3"><span className="text-xs text-zinc-400 w-20 flex-shrink-0 pt-0.5">{label}</span>{items.length === 0 ? <span className="text-xs text-zinc-600">Not configured</span> : isAll ? <span className="text-xs text-emerald-400">All locations</span> : <div className="flex flex-wrap gap-1">{items.map(l => <span key={l} className="text-xs px-1.5 py-0.5 bg-white/[0.06] text-zinc-300 rounded-lg">{l}</span>)}</div>}</div>;
}
function RawJson({ data }: { data: unknown }) { const [o, setO] = useState(false); return <div className="border-t border-white/[0.06] pt-4"><button onClick={() => setO(!o)} className="text-xs text-zinc-500 hover:text-zinc-300">{o ? '▾ Hide' : '▸ Show'} raw JSON</button>{o && <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>}</div>; }
function fmt(d: string | null | undefined) { if (!d) return 'N/A'; try { return new Date(d).toLocaleString(); } catch { return d; } }
