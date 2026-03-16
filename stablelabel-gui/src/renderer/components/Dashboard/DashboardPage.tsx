import React, { useEffect, useState, useCallback } from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { Page } from '../../lib/types';
import ExportButton from '../common/ExportButton';

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

    // Use functional updater to avoid stale closure over stats
    const updates: Partial<DashboardStats> = {};

    // Fire all queries in parallel
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

    // Snapshots are local — always available
    promises.push(
      invoke('Get-SLSnapshot').then((r) => {
        if (r.success && Array.isArray(r.data)) updates.snapshots = r.data.length;
      }).catch(() => {}),
    );

    // Elevation status
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

    // Fetch recent audit activity
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

  if (!anyConnected) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <WelcomeCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader />
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-600">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Connection status strip */}
      <ConnectionStrip status={status} />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Sensitivity Labels"
          value={stats.labels}
          loading={loading}
          color="blue"
          onClick={() => onNavigate?.('labels')}
        />
        <StatCard
          title="DLP Policies"
          value={stats.dlpPolicies}
          loading={loading}
          color="purple"
          onClick={() => onNavigate?.('dlp')}
        />
        <StatCard
          title="Retention Policies"
          value={stats.retentionPolicies}
          loading={loading}
          color="amber"
          onClick={() => onNavigate?.('retention')}
        />
        <StatCard
          title="Auto-Label Policies"
          value={stats.autoLabelPolicies}
          loading={loading}
          color="teal"
          onClick={() => onNavigate?.('labels')}
        />
        <StatCard
          title="Snapshots"
          value={stats.snapshots}
          loading={loading}
          color="green"
          onClick={() => onNavigate?.('snapshots')}
        />
        <StatCard
          title="Active Elevations"
          value={stats.activeElevations}
          loading={loading}
          color={stats.activeElevations && stats.activeElevations > 0 ? 'red' : 'gray'}
          onClick={() => onNavigate?.('elevation')}
        />
      </div>

      {/* Bottom row: recent activity + quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <RecentActivity entries={recentActivity} />
        <QuickActions onNavigate={onNavigate} invoke={invoke} />
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="text-gray-500 mt-1">Tenant compliance overview</p>
    </div>
  );
}

function WelcomeCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-300 mb-2">Not Connected</h2>
      <p className="text-gray-500 mb-4">
        Connect to Microsoft Graph and Security & Compliance PowerShell to get started.
      </p>
      <div className="flex flex-col gap-2 text-sm text-gray-600 max-w-md mx-auto">
        <div className="bg-gray-800/50 rounded p-3 text-left">
          <span className="text-blue-400 font-mono text-xs">Connect-SLGraph</span>
          <span className="text-gray-600 ml-2">— Labels, documents, sites</span>
        </div>
        <div className="bg-gray-800/50 rounded p-3 text-left">
          <span className="text-blue-400 font-mono text-xs">Connect-SLCompliance</span>
          <span className="text-gray-600 ml-2">— Policies, DLP, retention</span>
        </div>
        <div className="bg-gray-800/50 rounded p-3 text-left">
          <span className="text-blue-400 font-mono text-xs">Connect-SLProtection</span>
          <span className="text-gray-600 ml-2">— AIP templates (Windows)</span>
        </div>
      </div>
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {services.map((svc) => (
          <div key={svc.name} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${svc.connected ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className={`text-xs ${svc.connected ? 'text-gray-300' : 'text-gray-600'}`}>
              {svc.name}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {status.UserPrincipalName && <span>{status.UserPrincipalName}</span>}
        {status.TenantId && <span className="text-gray-700">|</span>}
        {status.TenantId && <span className="font-mono">{status.TenantId.substring(0, 8)}...</span>}
      </div>
    </div>
  );
}

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20' },
  teal:   { bg: 'bg-teal-500/10',   text: 'text-teal-400',   border: 'border-teal-500/20' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20' },
  red:    { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20' },
  gray:   { bg: 'bg-gray-500/10',   text: 'text-gray-400',   border: 'border-gray-500/20' },
};

function StatCard({
  title,
  value,
  loading,
  color,
  onClick,
}: {
  title: string;
  value: number | null;
  loading: boolean;
  color: string;
  onClick?: () => void;
}) {
  const c = colorMap[color] ?? colorMap.gray;

  return (
    <button
      onClick={onClick}
      className={`${c.bg} border ${c.border} rounded-lg p-4 text-left transition-all hover:brightness-125 cursor-pointer`}
    >
      <p className="text-sm text-gray-400">{title}</p>
      <p className={`text-3xl font-bold mt-1 ${c.text}`}>
        {loading && value === null ? (
          <span className="inline-block w-8 h-8 bg-gray-800 rounded animate-pulse" />
        ) : (
          value ?? '--'
        )}
      </p>
    </button>
  );
}

function RecentActivity({ entries }: { entries: AuditEntry[] }) {
  const resultColor = (result: string) => {
    if (result === 'success') return 'text-green-400';
    if (result === 'failed') return 'text-red-400';
    if (result === 'dry-run') return 'text-yellow-400';
    if (result === 'partial') return 'text-amber-400';
    return 'text-gray-400';
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Recent Activity</h3>
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
        <p className="text-xs text-gray-600">No recent activity recorded.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-medium ${resultColor(entry.Result)}`}>
                  {entry.Result === 'success' ? '+' : entry.Result === 'failed' ? '!' : '~'}
                </span>
                <span className="text-gray-300 truncate">{entry.Action}</span>
                <span className="text-gray-600 truncate">{entry.Target}</span>
              </div>
              <span className="text-gray-600 whitespace-nowrap ml-2">
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Quick Actions</h3>
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
      className="w-full p-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-left transition-colors disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-200">{label}</span>
        {loading && <span className="text-xs text-blue-400">Running...</span>}
        {result && <span className={`text-xs ${result === 'Snapshot created' ? 'text-green-400' : 'text-red-400'}`}>{result}</span>}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
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
