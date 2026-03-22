import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useAuth } from '@/hooks/useAuth';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import type { Job, JobListPage } from '@/lib/types';

const PAGE_SIZE = 20;

const JOB_ACTIONS: Record<string, string[]> = {
  pending: ['start'],
  enumerating: ['pause', 'cancel'],
  running: ['pause', 'cancel'],
  paused: ['resume', 'cancel'],
  completed: ['rollback', 'copy'],
  failed: ['copy'],
  rolled_back: ['copy'],
};

export default function JobsPage() {
  const { user } = useAuth();
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const data = await api.get<JobListPage>(`/tenants/${selected.id}/jobs?page=${page}&page_size=${PAGE_SIZE}`);
      setJobs(data.items);
      setTotal(data.total);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load jobs');
    }
    setLoading(false);
  }, [selected, page, showError]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const doAction = async (jobId: string, action: string) => {
    if (!selected) return;
    setActing(jobId);
    try {
      await api.post(`/tenants/${selected.id}/jobs/${jobId}/${action}`);
      await loadJobs();
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to ${action} job`);
    }
    setActing(null);
  };

  const createJob = async (name: string, config: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await api.post(`/tenants/${selected.id}/jobs`, { name, config });
      setShowCreate(false);
      await loadJobs();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create job');
    }
  };

  const columns: Column<Job>[] = [
    { key: 'name', header: 'Name', render: (j) => <span className="font-medium">{j.name}</span> },
    { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
    {
      key: 'progress', header: 'Progress', render: (j) => {
        if (!j.total_files) return <span className="text-zinc-500">--</span>;
        const pct = Math.round((j.processed_files / j.total_files) * 100);
        return (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-zinc-400">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: 'files', header: 'Files', render: (j) => (
        <span className="text-xs text-zinc-400">
          {j.processed_files}/{j.total_files}
          {j.failed_files > 0 && <span className="text-red-400 ml-1">({j.failed_files} failed)</span>}
        </span>
      ),
    },
    {
      key: 'created', header: 'Created', render: (j) => (
        <span className="text-xs text-zinc-500">{new Date(j.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'actions', header: '', render: (j) => (
        <div className="flex gap-1">
          {(JOB_ACTIONS[j.status] ?? []).map((action) => (
            <button
              key={action}
              onClick={() => doAction(j.id, action)}
              disabled={acting === j.id}
              className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      ),
    },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      <PageHeader title="Jobs" description="Create, monitor, and control labelling jobs">
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
        {user?.role !== 'Viewer' && (
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm rounded-md transition-colors">
            New Job
          </button>
        )}
      </PageHeader>

      {showCreate && <CreateJobDialog onSubmit={createJob} onClose={() => setShowCreate(false)} />}

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <DataTable columns={columns} data={jobs} keyFn={(j) => j.id} emptyMessage="No jobs found" />
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">Prev</button>
              <span className="text-sm text-zinc-400 py-1">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateJobDialog({ onSubmit, onClose }: { onSubmit: (name: string, config: Record<string, unknown>) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [labelId, setLabelId] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Create Job</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Job Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Target Label ID (optional)</label>
            <input value={labelId} onChange={(e) => setLabelId(e.target.value)} placeholder="Leave empty for policy-driven" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button onClick={() => name && onSubmit(name, labelId ? { target_label_id: labelId } : { use_policies: true })} disabled={!name} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
