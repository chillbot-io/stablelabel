import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import ExportButton from '../common/ExportButton';
import RawJsonSection from '../common/RawJsonSection';

interface LabelReportResult {
  TotalLabels: number;
  ActiveLabels: number;
  InactiveLabels: number;
  ParentLabels: number;
  SubLabels: number;
  PoliciesUsingLabels: Array<{ PolicyName: string; LabelCount: number }>;
  UnassignedLabels: string[];
}

export default function LabelReport() {
  const { invoke } = usePowerShell();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LabelReportResult | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setReport(null);
    try {
      const r = await invoke<LabelReportResult>('Get-SLLabelReport');
      if (r.success && r.data) setReport(r.data);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Label Report</h3>
        <p className="text-xs text-zinc-500">Comprehensive summary of sensitivity labels and their policy assignments.</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleRun} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
        {report && <ExportButton data={report} filename="label-report" />}
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      {report && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-2">
            <Stat label="Total" value={report.TotalLabels} />
            <Stat label="Active" value={report.ActiveLabels} color="green" />
            <Stat label="Inactive" value={report.InactiveLabels} color={report.InactiveLabels > 0 ? 'yellow' : undefined} />
            <Stat label="Parents" value={report.ParentLabels} />
            <Stat label="Sub-labels" value={report.SubLabels} />
          </div>

          {/* Policy assignments */}
          {report.PoliciesUsingLabels && report.PoliciesUsingLabels.length > 0 && (
            <div className="bg-white/[0.03] rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Policies Using Labels</h4>
              {report.PoliciesUsingLabels.map((pa, i) => (
                <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-white/[0.06] rounded-lg">
                  <span className="text-sm text-zinc-200">{pa.PolicyName}</span>
                  <span className="text-xs text-zinc-500">{pa.LabelCount} label{pa.LabelCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {/* Unassigned labels */}
          {report.UnassignedLabels && report.UnassignedLabels.length > 0 && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">Unassigned Labels ({report.UnassignedLabels.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {report.UnassignedLabels.map((l, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-white/[0.06] text-zinc-300 rounded-lg">{l}</span>
                ))}
              </div>
            </div>
          )}

          <RawJsonSection data={report} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const cls = color === 'green' ? 'text-emerald-400' : color === 'yellow' ? 'text-yellow-400' : 'text-zinc-200';
  return (
    <div className="bg-white/[0.03] rounded-lg p-2.5 text-center">
      <dt className="text-[10px] text-zinc-500">{label}</dt>
      <dd className={`text-lg font-bold ${cls}`}>{value}</dd>
    </div>
  );
}

