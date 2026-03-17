import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface MismatchResult {
  InGraphOnly: Array<{ LabelId: string; LabelName: string }>;
  InPolicyOnly: Array<{ Reference: string; PolicyName: string }>;
  Matched: number;
  TotalGraphLabels: number;
  TotalPolicyReferences: number;
}

export default function LabelMismatch() {
  const { invoke } = usePowerShell();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MismatchResult | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<MismatchResult>('Get-SLLabelMismatch');
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const hasMismatches = result && ((result.InGraphOnly?.length ?? 0) > 0 || (result.InPolicyOnly?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Label Mismatch</h3>
        <p className="text-xs text-zinc-500">Find labels that exist in Graph but not in policies, or vice versa.</p>
      </div>

      <button onClick={handleRun} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
        {loading ? 'Checking...' : 'Check Mismatches'}
      </button>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      {result && (
        <div className="space-y-3">
          {!hasMismatches ? (
            <div className="bg-emerald-400/5 border border-green-500/20 rounded-lg p-4 text-center">
              <p className="text-sm text-emerald-400">All labels are properly matched between Graph and policies.</p>
              <p className="text-xs text-zinc-500 mt-1">{result.Matched} labels aligned</p>
            </div>
          ) : (
            <>
              {result.InGraphOnly && result.InGraphOnly.length > 0 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">Graph Only ({result.InGraphOnly.length})</h4>
                  <p className="text-xs text-zinc-500 mb-2">Labels in Graph API but not referenced by any policy.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.InGraphOnly.map((l, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-white/[0.06] text-zinc-300 rounded-lg" title={l.LabelId}>{l.LabelName}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.InPolicyOnly && result.InPolicyOnly.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Policy Only ({result.InPolicyOnly.length})</h4>
                  <p className="text-xs text-zinc-500 mb-2">Labels referenced by policies but not found in Graph.</p>
                  <div className="space-y-1">
                    {result.InPolicyOnly.map((l, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-white/[0.06] rounded-lg text-xs">
                        <span className="text-red-300">{l.Reference}</span>
                        <span className="text-zinc-500">{l.PolicyName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                <span className="text-xs text-zinc-500">{result.Matched} matched | {result.TotalGraphLabels} in Graph | {result.TotalPolicyReferences} in policies</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
