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
import {
  ArrowRight,
  CheckCircle,
  FileSearch,
  FlaskConical,
  Play,
  Shield,
  Sparkles,
  Tag,
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
    </div>
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
  const conditions = (rules.conditions ?? []) as Array<{ type: string; entity_types?: string[]; patterns?: string[] }>;
  if (conditions.length === 0) return 'No conditions';
  const parts = conditions.map((c) => {
    if (c.type === 'entity_detected') return `${(c.entity_types ?? []).length} entity type(s)`;
    if (c.type === 'file_pattern') return `${(c.patterns ?? []).length} pattern(s)`;
    if (c.type === 'no_label') return 'Unlabelled';
    return c.type;
  });
  const mode = (rules.match_mode as string) === 'all' ? ' AND ' : ' OR ';
  return parts.join(mode);
}
