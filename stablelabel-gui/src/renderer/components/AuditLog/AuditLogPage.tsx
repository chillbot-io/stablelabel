import React, { useEffect, useState, useCallback } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import ExportButton from '../common/ExportButton';

interface AuditEntry {
  Timestamp: string;
  Action: string;
  Target: string;
  Result: string;
  User?: string;
  Parameters?: string;
}

export default function AuditLogPage() {
  const { invoke } = usePowerShell();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(50);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const r = await invoke<AuditEntry[]>('Get-SLAuditLog', { Last: count });
      if (r.success && Array.isArray(r.data)) setEntries(r.data);
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    }
    setLoading(false);
  }, [invoke, count]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const resultColor = (result: string) => {
    if (result === 'success') return 'text-emerald-400';
    if (result === 'failed') return 'text-red-400';
    if (result === 'dry-run') return 'text-amber-400';
    if (result === 'partial') return 'text-amber-400';
    return 'text-zinc-400';
  };

  const resultBadge = (result: string) => {
    const colors: Record<string, string> = {
      success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      failed: 'bg-red-500/10 text-red-400 border-red-500/20',
      'dry-run': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      partial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return colors[result] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  };

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Audit Log</h2>
          <p className="text-sm text-zinc-500 mt-1">Full history of operations executed through StableLabel.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value={25}>Last 25</option>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={500}>Last 500</option>
          </select>
          <button
            onClick={fetchLog}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {entries.length > 0 && (
            <ExportButton
              data={entries}
              filename="stablelabel-audit-log"
              csvHeaders={['Timestamp', 'Action', 'Target', 'Result', 'User', 'Parameters']}
              csvRowMapper={(e) => {
                const a = e as AuditEntry;
                return [a.Timestamp, a.Action, a.Target, a.Result, a.User ?? '', a.Parameters ?? ''];
              }}
            />
          )}
        </div>
      </div>

      {entries.length === 0 && !loading ? (
        <div className="text-center py-12 text-zinc-600 text-sm">No audit entries found.</div>
      ) : (
        <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-500 text-left">
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2 text-zinc-500 whitespace-nowrap font-mono">
                    {new Date(entry.Timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{entry.Action}</td>
                  <td className="px-4 py-2 text-zinc-400 truncate max-w-[300px]" title={entry.Target}>
                    {entry.Target}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border ${resultBadge(entry.Result)}`}>
                      {entry.Result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
