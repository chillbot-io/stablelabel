import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import ExportButton from '../common/ExportButton';

interface ReadinessResult {
  Ready: boolean;
  Checks: Array<{
    Name: string;
    Status: string;
    Message: string;
  }>;
  Summary: string;
}

export default function DeploymentReadiness() {
  const { invoke } = usePowerShell();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadinessResult | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<ReadinessResult>('Test-SLDeploymentReadiness');
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Deployment Readiness</h3>
        <p className="text-xs text-zinc-500">Pre-deployment checklist to verify your environment is ready for label and DLP deployment.</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleRun} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
          {loading ? 'Running checks...' : 'Run Readiness Check'}
        </button>
        {result && (
          <ExportButton
            data={result}
            filename="deployment-readiness"
            csvHeaders={['Check', 'Status', 'Message']}
            csvRowMapper={(c) => { const ck = c as { Name: string; Status: string; Message: string }; return [ck.Name, ck.Status, ck.Message]; }}
          />
        )}
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      {result && (
        <div className="space-y-3">
          {/* Overall status */}
          <div className={`p-4 rounded-lg border ${result.Ready ? 'bg-emerald-400/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-lg ${result.Ready ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.Ready ? '\u2714' : '\u2716'}
              </span>
              <span className="text-sm font-medium text-zinc-200">
                {result.Ready ? 'Ready to deploy' : 'Not ready'}
              </span>
            </div>
            {result.Summary && <p className="text-xs text-zinc-400 mt-1">{result.Summary}</p>}
          </div>

          {/* Individual checks */}
          <div className="space-y-1.5">
            {result.Checks.map((check, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-white/[0.03] rounded-lg">
                <div>
                  <span className="text-sm text-zinc-200">{check.Name}</span>
                  {check.Message && <p className="text-xs text-zinc-500 mt-0.5">{check.Message}</p>}
                </div>
                <StatusBadge status={check.Status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Pass' ? 'bg-emerald-400/10 text-emerald-400'
    : status === 'Fail' ? 'bg-red-500/10 text-red-400'
    : 'bg-yellow-500/10 text-yellow-400';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-lg ${cls}`}>{status}</span>;
}
