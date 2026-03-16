import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { PolicyHealth as PolicyHealthType } from '../../lib/types';

export default function PolicyHealth() {
  const { invoke } = usePowerShell();
  const [policyType, setPolicyType] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PolicyHealthType[] | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResults(null);
    try {
      const r = await invoke<PolicyHealthType[]>(`Get-SLPolicyHealth -PolicyType '${policyType}'`);
      if (r.success) setResults(Array.isArray(r.data) ? r.data : r.data ? [r.data as unknown as PolicyHealthType] : []);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const healthy = results?.filter(p => p.HealthStatus === 'Healthy').length ?? 0;
  const warning = results?.filter(p => p.HealthStatus === 'Warning').length ?? 0;
  const errCount = results?.filter(p => p.HealthStatus === 'Error').length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Policy Health</h3>
        <p className="text-xs text-gray-500">Health status of label, DLP, and retention policies.</p>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Policy Type</label>
          <select value={policyType} onChange={e => setPolicyType(e.target.value)} className="px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500">
            <option value="All">All</option>
            <option value="Label">Label</option>
            <option value="DLP">DLP</option>
            <option value="Retention">Retention</option>
          </select>
        </div>
        <button onClick={handleRun} disabled={loading} className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
          {loading ? 'Checking...' : 'Check Health'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      {results && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-green-500/5 border border-green-500/20 rounded p-2.5 text-center">
              <dt className="text-[10px] text-gray-500">Healthy</dt>
              <dd className="text-lg font-bold text-green-400">{healthy}</dd>
            </div>
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2.5 text-center">
              <dt className="text-[10px] text-gray-500">Warning</dt>
              <dd className="text-lg font-bold text-yellow-400">{warning}</dd>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded p-2.5 text-center">
              <dt className="text-[10px] text-gray-500">Error</dt>
              <dd className="text-lg font-bold text-red-400">{errCount}</dd>
            </div>
          </div>

          {/* Per-policy */}
          <div className="space-y-1.5">
            {results.map((policy, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-gray-900 border border-gray-800 rounded">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200">{policy.Name}</span>
                    <span className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">{policy.Type}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500">
                    <span>Mode: {policy.Mode}</span>
                    <span>Rules: {policy.HasRules ? 'Yes' : 'No'}</span>
                    <span>Dist: {policy.DistributionStatus}</span>
                    <span>Modified: {policy.LastModified}</span>
                  </div>
                </div>
                <StatusBadge status={policy.HealthStatus} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Healthy' ? 'bg-green-500/10 text-green-400'
    : status === 'Error' ? 'bg-red-500/10 text-red-400'
    : 'bg-yellow-500/10 text-yellow-400';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{status}</span>;
}
