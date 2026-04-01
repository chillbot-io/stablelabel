import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTenants } from '@/hooks/useTenants';
import { useError } from '@/contexts/ErrorContext';
import { api } from '@/lib/api';
import TenantSelector from '@/components/TenantSelector';
import StatusBadge from '@/components/StatusBadge';
import type { Job, OverviewStats } from '@/lib/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const { tenants, selected, setSelected, loading: tenantsLoading } = useTenants();
  const { showError } = useError();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      api.get<OverviewStats>(`/tenants/${selected.id}/reports/overview`, { signal: controller.signal }).catch(() => null),
      api.get<{ items: Job[] }>(`/tenants/${selected.id}/jobs?page_size=5`, { signal: controller.signal }).catch(() => ({ items: [] })),
    ]).then(([overview, jobs]) => {
      if (controller.signal.aborted) return;
      setStats(overview);
      setRecentJobs(jobs?.items ?? []);
    }).catch((err) => {
      if (!controller.signal.aborted) showError(err.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [selected, showError]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Welcome back, {user?.displayName}
          </p>
        </div>
        {!tenantsLoading && tenants.length > 0 && (
          <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Connected Tenants" value={tenants.length} />
        <StatCard label="Total Jobs" value={stats?.total_jobs} loading={loading} />
        <StatCard label="Files Labelled" value={stats?.files_labelled} loading={loading} />
        <StatCard label="Files Failed" value={stats?.files_failed} loading={loading} />
        <StatCard label="Completed Jobs" value={stats?.completed_jobs} loading={loading} />
        <StatCard label="Entity Types Found" value={stats?.entity_types_detected} loading={loading} />
        <StatCard label="Total Detections" value={stats?.total_detections} loading={loading} />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h2 className="text-sm font-medium text-zinc-300 mb-4">Recent Jobs</h2>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No jobs yet</p>
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div>
                  <span className="text-sm text-zinc-200">{job.name}</span>
                  <span className="text-xs text-zinc-500 ml-3">
                    {job.processed_files}/{job.total_files} files
                  </span>
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value?: number | null; loading?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {loading ? '...' : (value ?? 0).toLocaleString()}
      </div>
    </div>
  );
}
