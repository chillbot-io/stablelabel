import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface AlignmentResult {
  LabelsChecked: number;
  AlignedLabels: Array<{ LabelId: string; LabelName: string; DlpRule: string }>;
  UnprotectedLabels: Array<{ LabelId: string; LabelName: string }>;
  Recommendations: string[];
}

export default function LabelDlpAlignment() {
  const { invoke } = usePowerShell();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlignmentResult | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<AlignmentResult>('Test-SLLabelDlpAlignment');
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const unprotectedCount = result?.UnprotectedLabels?.length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Label-DLP Alignment</h3>
        <p className="text-xs text-gray-500">Check which sensitivity labels are backed by DLP rules and which have gaps.</p>
      </div>

      <button onClick={handleRun} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
        {loading ? 'Analyzing...' : 'Check Alignment'}
      </button>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      {result && (
        <div className="space-y-4">
          {/* Coverage summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded p-3 text-center">
              <dt className="text-[10px] text-gray-500">Checked</dt>
              <dd className="text-lg font-bold text-gray-200">{result.LabelsChecked}</dd>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded p-3 text-center">
              <dt className="text-[10px] text-gray-500">Aligned</dt>
              <dd className="text-lg font-bold text-green-400">{result.AlignedLabels?.length ?? 0}</dd>
            </div>
            <div className={`rounded p-3 text-center ${unprotectedCount > 0 ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-gray-900 border border-gray-800'}`}>
              <dt className="text-[10px] text-gray-500">Unprotected</dt>
              <dd className={`text-lg font-bold ${unprotectedCount > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>{unprotectedCount}</dd>
            </div>
          </div>

          {/* Aligned labels */}
          {result.AlignedLabels && result.AlignedLabels.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Aligned Labels</h4>
              <div className="space-y-1">
                {result.AlignedLabels.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-gray-800 rounded text-xs">
                    <span className="text-gray-200">{a.LabelName}</span>
                    <span className="text-gray-500">{a.DlpRule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unprotected labels */}
          {unprotectedCount > 0 && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">Unprotected Labels</h4>
              <div className="flex flex-wrap gap-1.5">
                {result.UnprotectedLabels.map((l, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-gray-800 text-gray-300 rounded" title={l.LabelId}>{l.LabelName}</span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.Recommendations && result.Recommendations.length > 0 && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Recommendations</h4>
              <ul className="space-y-1.5">
                {result.Recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">-</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
