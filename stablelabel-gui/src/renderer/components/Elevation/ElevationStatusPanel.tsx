import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { ElevationStatus, ElevatedJob, SuperUserStatus } from '../../lib/types';

export default function ElevationStatusPanel() {
  const { invoke } = usePowerShell();
  const [status, setStatus] = useState<ElevationStatus | null>(null);
  const [superUser, setSuperUser] = useState<SuperUserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [statusR, suR] = await Promise.all([
        invoke<ElevationStatus>('Get-SLElevationStatus'),
        invoke<SuperUserStatus>('Get-SLSuperUserStatus').catch(() => null),
      ]);
      if (statusR.success && statusR.data) setStatus(statusR.data);
      if (suR && suR.success && suR.data) setSuperUser(suR.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Elevation Status</h3>
        <p className="text-xs text-gray-500">Current privilege elevation state and job history.</p>
      </div>

      {/* Active job */}
      {status?.ActiveJob ? (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Active Elevated Job</h4>
            <span className="px-2 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded-full animate-pulse">Active</span>
          </div>
          <JobCard job={status.ActiveJob} />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">No active elevated job. All privileges are at baseline.</p>
        </div>
      )}

      {/* Super user status */}
      {superUser && (
        <div className={`rounded-lg p-4 ${superUser.Enabled ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-gray-900 border border-gray-800'}`}>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AIP Super User</h4>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${superUser.Enabled ? 'text-yellow-400' : 'text-gray-400'}`}>
              {superUser.Enabled ? 'Enabled' : 'Disabled'}
            </span>
            {superUser.SuperUsers?.length > 0 && (
              <span className="text-xs text-gray-500">({superUser.SuperUsers.length} super users)</span>
            )}
          </div>
          {superUser.Enabled && superUser.SuperUsers?.length > 0 && (
            <div className="mt-2 space-y-1">
              {superUser.SuperUsers.map((u, i) => (
                <div key={i} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300 font-mono">{u}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed jobs */}
      {status?.CompletedJobs && status.CompletedJobs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Jobs ({status.CompletedJobs.length})</h4>
          <div className="space-y-2 max-h-64 overflow-auto">
            {status.CompletedJobs.map((job, i) => <JobCard key={i} job={job} compact />)}
          </div>
        </div>
      )}

      <button onClick={load} className="text-xs text-gray-400 hover:text-gray-200">Refresh</button>
    </div>
  );
}

function JobCard({ job, compact }: { job: ElevatedJob; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${compact ? 'p-2.5 bg-gray-800 rounded' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-200">{job.UserPrincipalName}</span>
          <span className="text-xs text-gray-500 font-mono ml-2">{job.JobId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${job.Status === 'Active' ? 'bg-yellow-500/10 text-yellow-400' : job.Status === 'Completed' ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>{job.Status}</span>
          {job.Elevations?.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-500 hover:text-gray-300">{expanded ? '▾' : '▸'}</button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
        <span>Started: {job.StartedAt}</span>
        {job.CompletedAt && <span>Ended: {job.CompletedAt}</span>}
      </div>
      {expanded && job.Elevations && (
        <div className="mt-2 space-y-1">
          {job.Elevations.map((e, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 bg-gray-900 rounded text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded">{e.Type}</span>
                <span className="text-gray-300">{e.Target}</span>
              </div>
              <span className={`text-[10px] ${e.Status === 'Active' ? 'text-yellow-400' : 'text-gray-500'}`}>{e.Status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
