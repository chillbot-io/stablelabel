import React, { useEffect, useState, useCallback } from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { Page } from '../../lib/types';
import ExportButton from '../common/ExportButton';
import ConnectionDialog from '../Connection/ConnectionDialog';

interface DashboardStats {
  labels: number | null;
  dlpPolicies: number | null;
  retentionPolicies: number | null;
  autoLabelPolicies: number | null;
  snapshots: number | null;
  activeElevations: number | null;
}

interface AuditEntry {
  Timestamp: string;
  Action: string;
  Target: string;
  Result: string;
}

interface DashboardPageProps {
  onNavigate?: (page: Page) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { status, refresh: refreshConnection } = useConnectionStatus();
  const { invoke } = usePowerShell();
  const [stats, setStats] = useState<DashboardStats>({
    labels: null,
    dlpPolicies: null,
    retentionPolicies: null,
    autoLabelPolicies: null,
    snapshots: null,
    activeElevations: null,
  });
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const graphConnected = status?.GraphConnected ?? false;
  const complianceConnected = status?.ComplianceConnected ?? false;
  const anyConnected = graphConnected || complianceConnected;

  const fetchStats = useCallback(async () => {
    if (!anyConnected) return;
    setLoading(true);

    const updates: Partial<DashboardStats> = {};
    const promises: Promise<void>[] = [];

    if (graphConnected) {
      promises.push(
        invoke('Get-SLLabel').then((r) => {
          if (r.success && Array.isArray(r.data)) updates.labels = r.data.length;
        }).catch(() => {}),
      );
    }

    if (complianceConnected) {
      promises.push(
        invoke('Get-SLDlpPolicy').then((r) => {
          if (r.success && Array.isArray(r.data)) updates.dlpPolicies = r.data.length;
        }).catch(() => {}),
        invoke('Get-SLRetentionPolicy').then((r) => {
          if (r.success && Array.isArray(r.data)) updates.retentionPolicies = r.data.length;
        }).catch(() => {}),
        invoke('Get-SLAutoLabelPolicy').then((r) => {
          if (r.success && Array.isArray(r.data)) updates.autoLabelPolicies = r.data.length;
        }).catch(() => {}),
      );
    }

    promises.push(
      invoke('Get-SLSnapshot').then((r) => {
        if (r.success && Array.isArray(r.data)) updates.snapshots = r.data.length;
      }).catch(() => {}),
    );

    promises.push(
      invoke('Get-SLElevationStatus').then((r) => {
        if (r.success && r.data) {
          const d = r.data as { State?: { ActiveJob?: unknown } };
          updates.activeElevations = d.State?.ActiveJob ? 1 : 0;
        }
      }).catch(() => {}),
    );

    await Promise.all(promises);
    setStats((prev) => ({ ...prev, ...updates }));

    try {
      const auditResult = await invoke<AuditEntry[]>('Get-SLAuditLog -Last 5');
      if (auditResult.success && Array.isArray(auditResult.data)) {
        setRecentActivity(auditResult.data);
      }
    } catch {
      // Audit log may not exist yet
    }

    setLoading(false);
    setLastRefreshed(new Date());
  }, [anyConnected, graphConnected, complianceConnected, invoke]);

  useEffect(() => {
    if (anyConnected) {
      fetchStats();
    }
  }, [anyConnected, fetchStats]);

  const handleRefresh = () => {
    refreshConnection();
    fetchStats();
  };

  const [showConnect, setShowConnect] = useState(false);

  if (!anyConnected) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <WelcomeCard onConnect={() => setShowConnect(true)} />
        {showConnect && (
          <ConnectionDialog
            onClose={() => setShowConnect(false)}
            onConnected={() => refreshConnection()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader />
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-[11px] text-zinc-600">
              {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors disabled:opacity-40"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <ConnectionStrip status={status} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Sensitivity Labels" value={stats.labels} loading={loading} onClick={() => onNavigate?.('labels')} />
        <StatCard title="DLP Policies" value={stats.dlpPolicies} loading={loading} onClick={() => onNavigate?.('dlp')} />
        <StatCard title="Retention Policies" value={stats.retentionPolicies} loading={loading} onClick={() => onNavigate?.('retention')} />
        <StatCard title="Auto-Label Policies" value={stats.autoLabelPolicies} loading={loading} onClick={() => onNavigate?.('labels')} />
        <StatCard title="Snapshots" value={stats.snapshots} loading={loading} onClick={() => onNavigate?.('snapshots')} />
        <StatCard
          title="Active Elevations"
          value={stats.activeElevations}
          loading={loading}
          alert={!!stats.activeElevations && stats.activeElevations > 0}
          onClick={() => onNavigate?.('elevation')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RecentActivity entries={recentActivity} />
        <QuickActions onNavigate={onNavigate} invoke={invoke} />
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
      <p className="text-zinc-500 text-sm mt-0.5">Tenant compliance overview</p>
    </div>
  );
}

function WelcomeCard({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-10 text-center max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-zinc-200 mb-2">Not Connected</h2>
      <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
        Connect to Microsoft Purview to manage sensitivity labels, DLP policies, retention, and more.
      </p>
      <button
        onClick={onConnect}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Connect to StableLabel
      </button>
      <p className="text-[11px] text-zinc-600 mt-5">
        Requires PowerShell 7+, Global Administrator, and Compliance Administrator roles.
      </p>
    </div>
  );
}

function ConnectionStrip({ status }: { status: { GraphConnected: boolean; ComplianceConnected: boolean; ProtectionConnected: boolean; UserPrincipalName: string | null; TenantId: string | null } | null }) {
  if (!status) return null;

  const services = [
    { name: 'Graph', connected: status.GraphConnected },
    { name: 'Compliance', connected: status.ComplianceConnected },
    { name: 'Protection', connected: status.ProtectionConnected },
  ];

  return (
    <div className="bg-white/[0.02] rounded-xl px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-5">
        {services.map((svc) => (
          <div key={svc.name} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${svc.connected ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
            <span className={`text-[12px] ${svc.connected ? 'text-zinc-300' : 'text-zinc-600'}`}>
              {svc.name}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
        {status.UserPrincipalName && <span>{status.UserPrincipalName}</span>}
        {status.TenantId && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="font-mono">{status.TenantId.substring(0, 8)}...</span>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  loading,
  alert,
  onClick,
}: {
  title: string;
  value: number | null;
  loading: boolean;
  alert?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white/[0.03] hover:bg-white/[0.05] rounded-xl p-5 text-left transition-colors cursor-pointer"
    >
      <p className="text-[12px] text-zinc-500">{title}</p>
      <p className={`text-3xl font-semibold mt-1.5 tracking-tight ${alert ? 'text-red-400' : 'text-white'}`}>
        {loading && value === null ? (
          <span className="inline-block w-8 h-8 bg-white/[0.06] rounded animate-pulse" />
        ) : (
          value ?? '--'
        )}
      </p>
    </button>
  );
}

function RecentActivity({ entries }: { entries: AuditEntry[] }) {
  const resultColor = (result: string) => {
    if (result === 'success') return 'text-emerald-400';
    if (result === 'failed') return 'text-red-400';
    if (result === 'dry-run') return 'text-amber-400';
    if (result === 'partial') return 'text-amber-400';
    return 'text-zinc-400';
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-medium text-zinc-300">Recent Activity</h3>
        {entries.length > 0 && (
          <ExportButton
            data={entries}
            filename="audit-log"
            csvHeaders={['Timestamp', 'Action', 'Target', 'Result']}
            csvRowMapper={(e) => { const a = e as AuditEntry; return [a.Timestamp, a.Action, a.Target, a.Result]; }}
          />
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[12px] text-zinc-600">No recent activity recorded.</p>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-medium ${resultColor(entry.Result)}`}>
                  {entry.Result === 'success' ? '+' : entry.Result === 'failed' ? '!' : '~'}
                </span>
                <span className="text-zinc-300 truncate">{entry.Action}</span>
                <span className="text-zinc-600 truncate">{entry.Target}</span>
              </div>
              <span className="text-zinc-600 whitespace-nowrap ml-2">
                {formatRelativeTime(entry.Timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickActions({
  onNavigate,
  invoke,
}: {
  onNavigate?: (page: Page) => void;
  invoke: (command: string) => Promise<{ success: boolean; data: unknown; error?: string }>;
}) {
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<string | null>(null);

  const takeSnapshot = async () => {
    setSnapshotting(true);
    setSnapshotResult(null);
    try {
      const result = await invoke("New-SLSnapshot -Name 'Dashboard-Quick' -Scope All");
      if (result.success) {
        setSnapshotResult('Snapshot created');
      } else {
        setSnapshotResult(result.error ?? 'Failed');
      }
    } catch {
      setSnapshotResult('Failed');
    }
    setSnapshotting(false);
    setTimeout(() => setSnapshotResult(null), 3000);
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-5">
      <h3 className="text-[13px] font-medium text-zinc-300 mb-4">Quick Actions</h3>
      <div className="space-y-2">
        <ActionButton
          label="Take Snapshot"
          description="Capture current tenant configuration"
          loading={snapshotting}
          result={snapshotResult}
          onClick={takeSnapshot}
        />
        <ActionButton
          label="Run Health Check"
          description="Analyze policy health across all services"
          onClick={() => onNavigate?.('analysis')}
        />
        <ActionButton
          label="View Templates"
          description="Pre-built compliance configurations"
          onClick={() => onNavigate?.('templates')}
        />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  description,
  onClick,
  loading,
  result,
}: {
  label: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
  result?: string | null;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full p-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg text-left transition-colors disabled:opacity-40"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-zinc-200">{label}</span>
        {loading && <span className="text-[11px] text-blue-400">Running...</span>}
        {result && <span className={`text-[11px] ${result === 'Snapshot created' ? 'text-emerald-400' : 'text-red-400'}`}>{result}</span>}
      </div>
      <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>
    </button>
  );
}

function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}
