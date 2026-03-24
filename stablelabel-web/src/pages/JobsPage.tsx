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
import Modal from '@/components/Modal';
import type { Job, JobListPage, ScanResult, ScanResultPage, SensitivityLabel } from '@/lib/types';
import { Calendar, ChevronLeft, ChevronRight, FileText, FlaskConical, Play, Zap } from 'lucide-react';

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

interface SiteOption {
  id: string;
  displayName: string;
  webUrl: string;
}

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
  const [detailJob, setDetailJob] = useState<Job | null>(null);

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

  const createJob = async (name: string, config: Record<string, unknown>, scheduleCron?: string) => {
    if (!selected) return;
    try {
      await api.post(`/tenants/${selected.id}/jobs`, {
        name,
        config,
        schedule_cron: scheduleCron || null,
      });
      setShowCreate(false);
      await loadJobs();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create job');
    }
  };

  const getJobModeLabel = (job: Job) => {
    if (job.config.dry_run) return 'Dry Run';
    if (job.config.use_policies) return 'Policy-driven';
    if (job.config.target_label_id) return 'Static label';
    return '--';
  };

  const columns: Column<Job>[] = [
    {
      key: 'name', header: 'Name', render: (j) => (
        <button onClick={() => setDetailJob(j)} className="font-medium text-blue-400 hover:text-blue-300 text-left">
          {j.name}
        </button>
      ),
    },
    { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
    {
      key: 'mode', header: 'Mode', render: (j) => (
        <span className="text-xs text-zinc-400 flex items-center gap-1">
          {j.config.dry_run ? <FlaskConical size={12} className="text-yellow-400" /> : null}
          {getJobModeLabel(j)}
        </span>
      ),
    },
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
      key: 'schedule', header: 'Schedule', render: (j) =>
        j.schedule_cron ? (
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            <Calendar size={12} /> {j.schedule_cron}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">One-time</span>
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

      {showCreate && selected && (
        <CreateJobDialog
          tenantId={selected.id}
          onSubmit={createJob}
          onClose={() => setShowCreate(false)}
        />
      )}

      {detailJob && selected && <JobDetailPanel job={detailJob} tenantId={selected.id} onClose={() => setDetailJob(null)} />}

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

// ── Enhanced Create Job Dialog ────────────────────────────────

function CreateJobDialog({
  tenantId,
  onSubmit,
  onClose,
}: {
  tenantId: string;
  onSubmit: (name: string, config: Record<string, unknown>, scheduleCron?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'policy' | 'static'>('policy');
  const [labelId, setLabelId] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [scopeType, setScopeType] = useState<'all' | 'sites'>('all');
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [labels, setLabels] = useState<SensitivityLabel[]>([]);
  const [enableSchedule, setEnableSchedule] = useState(false);
  const [cronExpr, setCronExpr] = useState('0 2 * * 1');
  const [cronPreset, setCronPreset] = useState('weekly');

  // Load labels
  useEffect(() => {
    api.get<SensitivityLabel[]>(`/tenants/${tenantId}/labels?appliable_only=true`)
      .then(setLabels)
      .catch(() => {});
  }, [tenantId]);

  // Search sites when scope is "sites"
  useEffect(() => {
    if (scopeType !== 'sites') return;
    setLoadingSites(true);
    const query = siteSearch ? `?search=${encodeURIComponent(siteSearch)}` : '';
    api.get<SiteOption[]>(`/tenants/${tenantId}/sites${query}`)
      .then(setSites)
      .catch(() => setSites([]))
      .finally(() => setLoadingSites(false));
  }, [tenantId, scopeType, siteSearch]);

  const toggleSite = (siteId: string) => {
    setSelectedSites((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  const handleSubmit = () => {
    if (!name) return;
    const config: Record<string, unknown> = {};

    if (mode === 'policy') {
      config.use_policies = true;
    } else {
      config.target_label_id = labelId;
    }

    if (dryRun) config.dry_run = true;

    if (scopeType === 'sites' && selectedSites.length > 0) {
      config.site_ids = selectedSites;
    }

    const schedule = enableSchedule ? cronExpr : undefined;
    onSubmit(name, config, schedule);
  };

  const CRON_PRESETS = [
    { key: 'daily', label: 'Daily at 2 AM', cron: '0 2 * * *' },
    { key: 'weekly', label: 'Weekly (Monday 2 AM)', cron: '0 2 * * 1' },
    { key: 'biweekly', label: 'Every 2 weeks', cron: '0 2 1,15 * *' },
    { key: 'monthly', label: 'Monthly (1st, 2 AM)', cron: '0 2 1 * *' },
    { key: 'custom', label: 'Custom', cron: '' },
  ];

  const setCronPresetValue = (key: string) => {
    setCronPreset(key);
    const preset = CRON_PRESETS.find((p) => p.key === key);
    if (preset && preset.cron) setCronExpr(preset.cron);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Create Auto-Label Job</h2>

        <div className="space-y-4">
          {/* Job name */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Job Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly HR Document Scan"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Mode selection */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Labelling Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('policy')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  mode === 'policy'
                    ? 'border-blue-600 bg-blue-900/20'
                    : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} className={mode === 'policy' ? 'text-blue-400' : 'text-zinc-500'} />
                  <span className="text-sm font-medium">Policy-driven</span>
                </div>
                <p className="text-xs text-zinc-500">
                  Classify each file and apply labels based on your policies
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('static')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  mode === 'static'
                    ? 'border-blue-600 bg-blue-900/20'
                    : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Play size={14} className={mode === 'static' ? 'text-blue-400' : 'text-zinc-500'} />
                  <span className="text-sm font-medium">Static label</span>
                </div>
                <p className="text-xs text-zinc-500">
                  Apply one label to all matching files
                </p>
              </button>
            </div>
          </div>

          {/* Static label picker */}
          {mode === 'static' && (
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Target Label</label>
              {labels.length > 0 ? (
                <select
                  value={labelId}
                  onChange={(e) => setLabelId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a label...</option>
                  {labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.display_name || l.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={labelId}
                  onChange={(e) => setLabelId(e.target.value)}
                  placeholder="Label GUID"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          )}

          {/* Scope selector */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Scope</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setScopeType('all')}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  scopeType === 'all'
                    ? 'border-blue-600 bg-blue-900/20 text-blue-300'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All SharePoint sites
              </button>
              <button
                type="button"
                onClick={() => setScopeType('sites')}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  scopeType === 'sites'
                    ? 'border-blue-600 bg-blue-900/20 text-blue-300'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Specific sites
              </button>
            </div>

            {scopeType === 'sites' && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                <input
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  placeholder="Search SharePoint sites..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {loadingSites ? (
                  <p className="text-xs text-zinc-500 py-2">Loading sites...</p>
                ) : sites.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">No sites found. Sites are loaded from Graph API when the tenant is connected.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {sites.map((site) => (
                      <label
                        key={site.id}
                        className="flex items-center gap-2 text-xs text-zinc-300 py-1.5 px-2 rounded hover:bg-zinc-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSites.includes(site.id)}
                          onChange={() => toggleSite(site.id)}
                          className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="truncate">{site.displayName}</span>
                        <span className="text-zinc-600 truncate ml-auto">{site.webUrl}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedSites.length > 0 && (
                  <p className="text-xs text-blue-400 mt-2">{selectedSites.length} site(s) selected</p>
                )}
              </div>
            )}
          </div>

          {/* Dry run toggle */}
          <div className="flex items-center gap-3 py-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
            <div>
              <div className="flex items-center gap-1.5">
                <FlaskConical size={14} className={dryRun ? 'text-yellow-400' : 'text-zinc-500'} />
                <span className="text-sm text-zinc-200">Dry Run (Test Mode)</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Scan and classify files without applying labels — preview what would change
              </p>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSchedule}
                  onChange={(e) => setEnableSchedule(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
              <div>
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className={enableSchedule ? 'text-blue-400' : 'text-zinc-500'} />
                  <span className="text-sm text-zinc-200">Schedule</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Run automatically on a recurring schedule</p>
              </div>
            </div>
            {enableSchedule && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setCronPresetValue(preset.key)}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        cronPreset === preset.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {cronPreset === 'custom' && (
                  <input
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    placeholder="0 2 * * 1 (cron expression)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
                <p className="text-xs text-zinc-500">
                  Schedule: <code className="bg-zinc-800 px-1 rounded text-zinc-400">{cronExpr}</code>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!name || (mode === 'static' && !labelId)}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            {dryRun ? <><FlaskConical size={14} /> Create Dry Run</> : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Detail Panel ──────────────────────────────────────────

function JobDetailPanel({ job, tenantId, onClose }: { job: Job; tenantId: string; onClose: () => void }) {
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsPage, setResultsPage] = useState(1);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [loadingResults, setLoadingResults] = useState(false);

  const loadResults = useCallback(async () => {
    if (!tenantId) return;
    setLoadingResults(true);
    const filterParam = outcomeFilter ? `&outcome=${outcomeFilter}` : '';
    try {
      const data = await api.get<ScanResultPage>(
        `/tenants/${tenantId}/jobs/${job.id}/results?page=${resultsPage}&page_size=20${filterParam}`
      );
      setResults(data.items);
      setResultsTotal(data.total);
    } catch {
      setResults([]);
    }
    setLoadingResults(false);
  }, [tenantId, job.id, resultsPage, outcomeFilter]);

  useEffect(() => {
    if (showResults) loadResults();
  }, [showResults, loadResults]);

  const resultsTotalPages = Math.ceil(resultsTotal / 20);

  return (
    <Modal title={`Job: ${job.name}`} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-zinc-500 block text-xs">Status</span>
            <StatusBadge status={job.status} />
          </div>
          <div>
            <span className="text-zinc-500 block text-xs">Mode</span>
            <span className="text-zinc-200">
              {job.config.dry_run ? 'Dry Run' : job.config.use_policies ? 'Policy-driven' : 'Static'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-xs">Total Files</span>
            <span className="text-zinc-200">{job.total_files.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-xs">Processed</span>
            <span className="text-zinc-200">{job.processed_files.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-xs">Failed</span>
            <span className="text-red-400">{job.failed_files}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-xs">Skipped</span>
            <span className="text-zinc-200">{job.skipped_files}</span>
          </div>
          {job.schedule_cron && (
            <div className="col-span-2">
              <span className="text-zinc-500 block text-xs">Schedule</span>
              <code className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">{job.schedule_cron}</code>
            </div>
          )}
          {job.config.site_ids && (
            <div className="col-span-2">
              <span className="text-zinc-500 block text-xs">Scoped Sites</span>
              <span className="text-zinc-200 text-xs">{(job.config.site_ids as string[]).length} site(s)</span>
            </div>
          )}
          <div>
            <span className="text-zinc-500 block text-xs">Created</span>
            <span className="text-zinc-400 text-xs">{new Date(job.created_at).toLocaleString()}</span>
          </div>
          {job.started_at && (
            <div>
              <span className="text-zinc-500 block text-xs">Started</span>
              <span className="text-zinc-400 text-xs">{new Date(job.started_at).toLocaleString()}</span>
            </div>
          )}
          {job.completed_at && (
            <div>
              <span className="text-zinc-500 block text-xs">Completed</span>
              <span className="text-zinc-400 text-xs">{new Date(job.completed_at).toLocaleString()}</span>
            </div>
          )}
        </div>

        {job.config.error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
            <span className="text-xs text-red-400 block mb-1">Error</span>
            <p className="text-xs text-red-300">{job.config.error as string}</p>
          </div>
        )}

        {job.config.dry_run && job.status === 'completed' && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FlaskConical size={14} className="text-yellow-400" />
              <span className="text-xs text-yellow-400 font-medium">Dry Run Results</span>
            </div>
            <p className="text-xs text-yellow-300">
              {job.processed_files} files scanned. {job.processed_files - job.skipped_files - job.failed_files} would
              be labelled. {job.skipped_files} would be skipped (no matching policy).
              Check the Reports page for full entity detection breakdown.
            </p>
          </div>
        )}

        {/* Per-file results section */}
        {job.processed_files > 0 && (
          <div className="border-t border-zinc-800 pt-3">
            <button
              onClick={() => setShowResults(!showResults)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FileText size={14} />
              {showResults ? 'Hide' : 'View'} per-file results ({job.processed_files.toLocaleString()} files)
            </button>

            {showResults && (
              <div className="mt-3 space-y-2">
                {/* Outcome filter */}
                <div className="flex gap-1.5">
                  {['', 'labelled', 'skipped', 'failed'].map((o) => (
                    <button
                      key={o}
                      onClick={() => { setOutcomeFilter(o); setResultsPage(1); }}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        outcomeFilter === o ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {o || 'All'}
                    </button>
                  ))}
                </div>

                {loadingResults ? (
                  <p className="text-xs text-zinc-500 py-2">Loading results...</p>
                ) : results.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">No results found</p>
                ) : (
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-700">
                          <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">File</th>
                          <th className="text-left py-1.5 px-2 text-zinc-500 font-medium w-24">Outcome</th>
                          <th className="text-left py-1.5 px-2 text-zinc-500 font-medium w-28">Classification</th>
                          <th className="text-left py-1.5 px-2 text-zinc-500 font-medium w-16">Conf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.id} className="border-b border-zinc-800/50">
                            <td className="py-1.5 px-2 text-zinc-300 truncate max-w-[200px]" title={r.file_name}>{r.file_name}</td>
                            <td className="py-1.5 px-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                r.outcome === 'labelled' ? 'bg-green-900/40 text-green-300' :
                                r.outcome === 'failed' ? 'bg-red-900/40 text-red-300' :
                                'bg-zinc-700 text-zinc-400'
                              }`}>
                                {r.outcome}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-zinc-400">{r.classification ?? '--'}</td>
                            <td className="py-1.5 px-2 text-zinc-400 tabular-nums">
                              {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {resultsTotalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{resultsTotal} results</span>
                    <div className="flex gap-1">
                      <button
                        disabled={resultsPage <= 1}
                        onClick={() => setResultsPage(resultsPage - 1)}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span className="text-xs text-zinc-400 px-2 py-1">{resultsPage}/{resultsTotalPages}</span>
                      <button
                        disabled={resultsPage >= resultsTotalPages}
                        onClick={() => setResultsPage(resultsPage + 1)}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">
          Close
        </button>
      </div>
    </Modal>
  );
}
