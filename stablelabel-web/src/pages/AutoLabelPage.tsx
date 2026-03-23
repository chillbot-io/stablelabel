/**
 * Auto-Label page — the flagship feature for E3 users.
 *
 * Unified hub that brings together:
 *  - Quick-start wizard for creating auto-label jobs
 *  - Policy overview with rule summaries
 *  - Recent job activity
 *  - How it works explanation for new users
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useAuth } from '@/hooks/useAuth';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import StatusBadge from '@/components/StatusBadge';
import type { Job, JobListPage, Policy, SensitivityLabel } from '@/lib/types';
import Modal from '@/components/Modal';
import {
  ArrowRight,
  CheckCircle,
  FileSearch,
  FlaskConical,
  Play,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';

export default function AutoLabelPage() {
  const { user } = useAuth();
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [labels, setLabels] = useState<SensitivityLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [showBulkRemove, setShowBulkRemove] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const [pols, jobPage, lbls] = await Promise.all([
        api.get<Policy[]>(`/tenants/${selected.id}/policies`),
        api.get<JobListPage>(`/tenants/${selected.id}/jobs?page=1&page_size=5`),
        api.get<SensitivityLabel[]>(`/tenants/${selected.id}/labels?appliable_only=true`),
      ]);
      setPolicies(pols);
      setRecentJobs(jobPage.items);
      setLabels(lbls);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load data');
    }
    setLoading(false);
  }, [selected, showError]);

  useEffect(() => { load(); }, [load]);

  const enabledPolicies = policies.filter((p) => p.is_enabled);
  const isOperator = user?.role !== 'Viewer';

  const quickStartJob = async (dryRun: boolean) => {
    if (!selected) return;
    const name = dryRun ? `Dry Run — ${new Date().toLocaleDateString()}` : `Auto-Label — ${new Date().toLocaleDateString()}`;
    try {
      await api.post(`/tenants/${selected.id}/jobs`, {
        name,
        config: { use_policies: true, dry_run: dryRun },
      });
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create job');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Auto-Label" description="E5-grade auto-labelling for E3 tenants">
          <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
        </PageHeader>
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title="Auto-Label" description="E5-grade auto-labelling for E3 tenants">
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
      </PageHeader>

      {/* How it works — shown when no policies exist */}
      {policies.length === 0 ? (
        <GettingStarted isOperator={isOperator} />
      ) : (
        <div className="space-y-6">
          {/* Quick actions */}
          {isOperator && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-3">
              <button
                onClick={() => quickStartJob(true)}
                className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-yellow-700 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-yellow-900/30 flex items-center justify-center shrink-0">
                  <FlaskConical size={20} className="text-yellow-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-yellow-300">Run Dry Run</div>
                  <p className="text-xs text-zinc-500">Scan all sites without applying labels</p>
                </div>
              </button>

              <button
                onClick={() => quickStartJob(false)}
                className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-blue-700 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Play size={20} className="text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-blue-300">Run Auto-Label</div>
                  <p className="text-xs text-zinc-500">Classify and label all files using policies</p>
                </div>
              </button>

              <Link
                to="/jobs"
                className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Zap size={20} className="text-zinc-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100">Advanced Job</div>
                  <p className="text-xs text-zinc-500">Custom scope, schedule, static label</p>
                </div>
              </Link>

              <button
                onClick={() => setShowCsvUpload(true)}
                className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-green-700 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center shrink-0">
                  <Upload size={20} className="text-green-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-green-300">CSV Upload</div>
                  <p className="text-xs text-zinc-500">Bulk label files from a CSV spreadsheet</p>
                </div>
              </button>

              <button
                onClick={() => setShowBulkRemove(true)}
                className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-red-700 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-red-900/30 flex items-center justify-center shrink-0">
                  <Trash2 size={20} className="text-red-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-red-300">Bulk Remove</div>
                  <p className="text-xs text-zinc-500">Remove labels or encryption from files</p>
                </div>
              </button>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active Policies" value={enabledPolicies.length} total={policies.length} />
            <StatCard label="Entity Types Covered" value={countEntityTypes(enabledPolicies)} />
            <StatCard label="Labels Available" value={labels.length} />
            <StatCard
              label="Recent Jobs"
              value={recentJobs.filter((j) => j.status === 'completed').length}
              total={recentJobs.length}
            />
          </div>

          {/* Two-column layout: Policies + Recent Jobs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Policies summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-200">Policies</h3>
                <Link to="/policies" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  Manage <ArrowRight size={12} />
                </Link>
              </div>
              <div className="divide-y divide-zinc-800">
                {policies.length === 0 && (
                  <p className="p-4 text-sm text-zinc-500">No policies configured</p>
                )}
                {policies.slice(0, 6).map((p) => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{p.name}</div>
                      <div className="text-xs text-zinc-500">
                        Priority {p.priority} &middot; {conditionSummary(p.rules)}
                      </div>
                    </div>
                    <StatusBadge status={p.is_enabled ? 'active' : 'pending'} />
                  </div>
                ))}
                {policies.length > 6 && (
                  <div className="px-4 py-2 text-xs text-zinc-500">
                    +{policies.length - 6} more
                  </div>
                )}
              </div>
            </div>

            {/* Recent jobs */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-200">Recent Jobs</h3>
                <Link to="/jobs" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              <div className="divide-y divide-zinc-800">
                {recentJobs.length === 0 && (
                  <p className="p-4 text-sm text-zinc-500">No jobs yet</p>
                )}
                {recentJobs.map((j) => (
                  <div key={j.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 truncate flex items-center gap-1.5">
                        {j.config.dry_run && <FlaskConical size={12} className="text-yellow-400 shrink-0" />}
                        {j.name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {j.processed_files}/{j.total_files} files &middot;{' '}
                        {new Date(j.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCsvUpload && selected && (
        <CsvUploadDialog tenantId={selected.id} onClose={() => setShowCsvUpload(false)} onDone={() => { setShowCsvUpload(false); load(); }} />
      )}

      {showBulkRemove && selected && (
        <BulkRemoveDialog tenantId={selected.id} onClose={() => setShowBulkRemove(false)} onDone={() => { setShowBulkRemove(false); load(); }} />
      )}
    </div>
  );
}

// ── CSV Upload Dialog ─────────────────────────────────────────

interface CsvResult {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  errors: string[];
  job_id: string;
}

function CsvUploadDialog({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: () => void }) {
  const { showError } = useError();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CsvResult | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.upload<CsvResult>(`/tenants/${tenantId}/documents/upload-csv`, file);
      setResult(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
  };

  return (
    <Modal title="CSV Upload — Bulk Label" onClose={onClose} wide>
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Upload a CSV file with columns: <code className="bg-zinc-800 px-1 rounded text-zinc-300">drive_id</code>,{' '}
            <code className="bg-zinc-800 px-1 rounded text-zinc-300">item_id</code>,{' '}
            <code className="bg-zinc-800 px-1 rounded text-zinc-300">filename</code>,{' '}
            <code className="bg-zinc-800 px-1 rounded text-zinc-300">label_id</code>
          </p>

          <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload size={24} className="mx-auto text-zinc-500 mb-2" />
              <p className="text-sm text-zinc-400">
                {file ? file.name : 'Click to select a CSV file'}
              </p>
              {file && <p className="text-xs text-zinc-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>}
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-3 py-1.5 text-sm rounded bg-green-600 hover:bg-green-500 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload & Apply'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-zinc-100">{result.total_rows}</div>
              <div className="text-xs text-zinc-500">Total Rows</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-green-400">{result.valid_rows}</div>
              <div className="text-xs text-zinc-500">Valid</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-red-400">{result.invalid_rows}</div>
              <div className="text-xs text-zinc-500">Invalid</div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 max-h-40 overflow-y-auto">
              <span className="text-xs text-red-400 font-medium block mb-1">Errors</span>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-300">{e}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={onDone} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500">Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Bulk Remove Dialog ────────────────────────────────────────

function BulkRemoveDialog({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: () => void }) {
  const { showError } = useError();
  const [mode, setMode] = useState<'label_only' | 'encryption_only' | 'label_and_encryption'>('label_only');
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [done, setDone] = useState(false);

  const handleRemove = async () => {
    if (!file) return;
    setRemoving(true);

    // Parse CSV client-side to extract items
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        showError('CSV must have a header row and at least one data row');
        setRemoving(false);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const driveIdx = headers.indexOf('drive_id');
      const itemIdx = headers.indexOf('item_id');
      const nameIdx = headers.indexOf('filename');

      if (driveIdx === -1 || itemIdx === -1) {
        showError('CSV must have drive_id and item_id columns');
        setRemoving(false);
        return;
      }

      const items = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
          drive_id: cols[driveIdx],
          item_id: cols[itemIdx],
          filename: nameIdx >= 0 ? cols[nameIdx] : '',
        };
      }).filter((i) => i.drive_id && i.item_id);

      await api.post(`/tenants/${tenantId}/documents/remove-label-bulk`, {
        tenant_id: tenantId,
        items,
        mode,
        dry_run: false,
      });
      setDone(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Bulk removal failed');
    }
    setRemoving(false);
  };

  const MODES = [
    { value: 'label_only' as const, label: 'Label Only', desc: 'Remove the sensitivity label metadata' },
    { value: 'encryption_only' as const, label: 'Encryption Only', desc: 'Remove protection but keep the label' },
    { value: 'label_and_encryption' as const, label: 'Label + Encryption', desc: 'Remove both label and protection' },
  ];

  return (
    <Modal title="Bulk Remove Labels" onClose={onClose} wide>
      {!done ? (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Removal Mode</label>
            <div className="space-y-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    mode === m.value ? 'border-red-600 bg-red-900/20' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-200">{m.label}</div>
                  <p className="text-xs text-zinc-500">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 block mb-1">File List (CSV)</label>
            <p className="text-xs text-zinc-500 mb-2">
              CSV with columns: <code className="bg-zinc-800 px-1 rounded">drive_id</code>, <code className="bg-zinc-800 px-1 rounded">item_id</code> (and optionally <code className="bg-zinc-800 px-1 rounded">filename</code>)
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-zinc-400"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
            <button
              onClick={handleRemove}
              disabled={!file || removing}
              className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-500 disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove Labels'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center py-4">
            <CheckCircle size={32} className="mx-auto text-green-400 mb-2" />
            <p className="text-sm text-zinc-200">Bulk removal complete</p>
          </div>
          <div className="flex justify-end">
            <button onClick={onDone} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500">Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Getting Started (onboarding) ──────────────────────────────

function GettingStarted({ isOperator }: { isOperator: boolean }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-900/30 mb-4">
          <Sparkles size={32} className="text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">E5-Grade Auto-Labelling for E3</h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          StableLabel gives your E3 tenant the same content-based auto-labelling that Microsoft
          reserves for E5 licenses — with even more granular control.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <StepCard
          number={1}
          icon={<Tag size={18} />}
          title="Check your labels"
          description="Make sure your sensitivity labels are synced from Microsoft Purview."
          link="/labels"
          linkText="View Labels"
        />
        <StepCard
          number={2}
          icon={<FileSearch size={18} />}
          title="Create policies"
          description="Define rules like: 'If credit card numbers detected with 80%+ confidence, apply Highly Confidential'."
          link="/policies"
          linkText="Create Policy"
        />
        <StepCard
          number={3}
          icon={<FlaskConical size={18} />}
          title="Run a dry run"
          description="Test your policies without applying labels — see what would change before committing."
          link="/jobs"
          linkText="Create Job"
        />
        <StepCard
          number={4}
          icon={<CheckCircle size={18} />}
          title="Go live"
          description="Run auto-labelling for real, or schedule it to run on a recurring basis."
          link="/jobs"
          linkText="Create Job"
        />
      </div>

      {isOperator && (
        <div className="text-center">
          <Link
            to="/policies"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Shield size={16} /> Create Your First Policy
          </Link>
        </div>
      )}
    </div>
  );
}

function StepCard({
  number,
  icon,
  title,
  description,
  link,
  linkText,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  link: string;
  linkText: string;
}) {
  return (
    <div className="flex items-start gap-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-sm font-bold text-zinc-400">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-400">{icon}</span>
          <span className="text-sm font-medium text-zinc-200">{title}</span>
        </div>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <Link
        to={link}
        className="text-xs text-blue-400 hover:text-blue-300 shrink-0 flex items-center gap-1"
      >
        {linkText} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function StatCard({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 tabular-nums">
        {value}
        {total !== undefined && <span className="text-sm text-zinc-500 font-normal"> / {total}</span>}
      </div>
    </div>
  );
}

function countEntityTypes(policies: Policy[]): number {
  const types = new Set<string>();
  for (const p of policies) {
    const conditions = (p.rules.conditions ?? []) as Array<{ type: string; entity_types?: string[] }>;
    for (const c of conditions) {
      if (c.type === 'entity_detected' && c.entity_types) {
        c.entity_types.forEach((t) => types.add(t));
      }
    }
  }
  return types.size;
}

function conditionSummary(rules: Record<string, unknown>): string {
  const conditions = (rules.conditions ?? []) as Array<{ type: string; entity_types?: string[]; patterns?: string[]; keywords?: string[] }>;
  if (conditions.length === 0) return 'No conditions';
  const parts = conditions.map((c) => {
    if (c.type === 'entity_detected') return `${(c.entity_types ?? []).length} entity type(s)`;
    if (c.type === 'file_pattern') return `${(c.patterns ?? []).length} file pattern(s)`;
    if (c.type === 'keyword_match') return `${(c.keywords ?? []).length} keyword(s)`;
    if (c.type === 'regex_match') return `${(c.patterns ?? []).length} regex(es)`;
    if (c.type === 'no_label') return 'Unlabelled';
    return c.type;
  });
  const mode = (rules.match_mode as string) === 'all' ? ' AND ' : ' OR ';
  return parts.join(mode);
}
