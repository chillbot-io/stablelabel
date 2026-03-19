import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface ConflictResult {
  PoliciesChecked: number;
  Conflicts: Array<{
    PolicyA: string;
    PolicyB: string;
    ConflictType: string;
    Detail: string;
  }>;
  HasConflicts: boolean;
}

export default function PolicyConflicts() {
  const { invoke } = usePowerShell();
  const [policyType, setPolicyType] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConflictResult | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<ConflictResult>('Test-SLPolicyConflict', { PolicyType: policyType });
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Policy Conflict Detection</h3>
        <p className="text-xs text-zinc-500">Find overlapping scopes and contradictory rules across compliance policies.</p>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Policy Type</label>
          <select value={policyType} onChange={e => setPolicyType(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500">
            <option value="All">All</option>
            <option value="Label">Label</option>
            <option value="DLP">DLP</option>
            <option value="Retention">Retention</option>
          </select>
        </div>
        <button onClick={handleRun} disabled={loading} className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
          {loading ? 'Analyzing...' : 'Detect Conflicts'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      {result && (
        <div className="space-y-3">
          <div className="text-xs text-zinc-500">{result.PoliciesChecked} policies checked</div>
          {!result.HasConflicts ? (
            <div className="bg-emerald-400/5 border border-green-500/20 rounded-lg p-4 text-center">
              <p className="text-sm text-emerald-400">No policy conflicts detected.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {result.Conflicts.map((conflict, i) => (
                <div key={i} className="p-3 rounded-lg border bg-yellow-500/5 border-yellow-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-zinc-300">{conflict.ConflictType}</span>
                  </div>
                  <p className="text-xs text-zinc-400">{conflict.Detail}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-zinc-300 rounded-lg">{conflict.PolicyA}</span>
                    <span className="text-[10px] text-zinc-600">vs</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-zinc-300 rounded-lg">{conflict.PolicyB}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
