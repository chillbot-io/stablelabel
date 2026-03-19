import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface PermissionResult {
  UserPrincipalName: string;
  ScopesChecked: string[];
  GroupMemberships: string[];
  Results: Array<{ Scope: string; HasAccess: boolean; Details: string }>;
}

export default function PermissionCheck() {
  const { invoke } = usePowerShell();
  const [scope, setScope] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PermissionResult | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<PermissionResult>('Test-SLPermission', { Scope: scope });
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Permission Check</h3>
        <p className="text-xs text-zinc-500">Verify the current user has required permissions for StableLabel operations.</p>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Scope</label>
          <select value={scope} onChange={e => setScope(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500">
            <option value="All">All</option>
            <option value="Labels">Labels</option>
            <option value="DLP">DLP</option>
            <option value="Retention">Retention</option>
            <option value="Protection">Protection</option>
          </select>
        </div>
        <button onClick={handleRun} disabled={loading} className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
          {loading ? 'Checking...' : 'Run Check'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      {result && (
        <div className="space-y-3">
          {result.UserPrincipalName && (
            <div className="text-xs text-zinc-500">User: <span className="text-zinc-300">{result.UserPrincipalName}</span></div>
          )}
          <div className="space-y-1.5">
            {result.Results.map((check, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg">
                <div>
                  <span className="text-sm text-zinc-200">{check.Scope}</span>
                  {check.Details && <p className="text-xs text-zinc-500 mt-0.5">{check.Details}</p>}
                </div>
                <StatusBadge hasAccess={check.HasAccess} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ hasAccess }: { hasAccess: boolean }) {
  const cls = hasAccess ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-500/10 text-red-400';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-lg ${cls}`}>{hasAccess ? 'Pass' : 'Fail'}</span>;
}
