import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface MismatchResult {
  GraphOnly: string[];
  PolicyOnly: string[];
  Matched: string[];
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

  const hasMismatches = result && ((result.GraphOnly?.length ?? 0) > 0 || (result.PolicyOnly?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Label Mismatch</h3>
        <p className="text-xs text-gray-500">Find labels that exist in Graph but not in policies, or vice versa.</p>
      </div>

      <button onClick={handleRun} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
        {loading ? 'Checking...' : 'Check Mismatches'}
      </button>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      {result && (
        <div className="space-y-3">
          {!hasMismatches ? (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 text-center">
              <p className="text-sm text-green-400">All labels are properly matched between Graph and policies.</p>
              <p className="text-xs text-gray-500 mt-1">{result.Matched?.length ?? 0} labels aligned</p>
            </div>
          ) : (
            <>
              {result.GraphOnly && result.GraphOnly.length > 0 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">Graph Only ({result.GraphOnly.length})</h4>
                  <p className="text-xs text-gray-500 mb-2">Labels in Graph API but not referenced by any policy.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.GraphOnly.map((l, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-gray-800 text-gray-300 rounded">{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.PolicyOnly && result.PolicyOnly.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Policy Only ({result.PolicyOnly.length})</h4>
                  <p className="text-xs text-gray-500 mb-2">Labels referenced by policies but not found in Graph.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.PolicyOnly.map((l, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-gray-800 text-red-300 rounded">{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.Matched && result.Matched.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Matched ({result.Matched.length})</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {result.Matched.map((l, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-green-500/5 text-green-400 rounded">{l}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
