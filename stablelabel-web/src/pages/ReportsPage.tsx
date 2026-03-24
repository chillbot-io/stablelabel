import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import { useError } from '@/contexts/ErrorContext';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';
import type { OverviewStats } from '@/lib/types';

type ReportTab = 'overview' | 'summary' | 'detections' | 'labels' | 'throughput';

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  running: '#3b82f6',
  paused: '#f59e0b',
  pending: '#6b7280',
  rolled_back: '#8b5cf6',
};

export default function ReportsPage() {
  const { tenants, selected, setSelected } = useTenants();
  const { showError } = useError();
  const [tab, setTab] = useState<ReportTab>('overview');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  // Fetch overview stats
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api.get<OverviewStats>(`/tenants/${selected.id}/reports/overview`)
      .then((d) => { if (!controller.signal.aborted) setOverview(d); })
      .catch(() => { if (!controller.signal.aborted) setOverview(null); });
    return () => controller.abort();
  }, [selected]);

  // Fetch tab data
  useEffect(() => {
    if (!selected || tab === 'overview') return;
    const controller = new AbortController();
    setLoading(true);
    api.get<Record<string, unknown>[]>(`/tenants/${selected.id}/reports/${tab}?days=${days}`)
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch((err) => { if (!controller.signal.aborted) { setData([]); showError(err.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected, tab, days, showError]);

  const exportCsv = useCallback(() => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stablelabel-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, tab]);

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'summary', label: 'Job Summary' },
    { key: 'detections', label: 'Entity Detections' },
    { key: 'labels', label: 'Label Distribution' },
    { key: 'throughput', label: 'Throughput' },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Reports" description="Analytics and trend data">
        {tab !== 'overview' && (
          <>
            <button
              onClick={exportCsv}
              disabled={data.length === 0}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </>
        )}
        <TenantSelector tenants={tenants} selected={selected} onSelect={setSelected} />
      </PageHeader>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <OverviewPanel stats={overview} />
      ) : loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">No data for this period</div>
      ) : (
        <div className="space-y-6">
          <ChartPanel tab={tab} data={data} />
          <DataTable data={data} />
        </div>
      )}
    </div>
  );
}

/* ── Overview Stats ─────────────────────────────────────────── */

function OverviewPanel({ stats }: { stats: OverviewStats | null }) {
  if (!stats) return <div className="text-center py-12 text-zinc-500 text-sm">Select a tenant to view stats</div>;

  const cards: { label: string; value: number; color: string }[] = [
    { label: 'Total Jobs', value: stats.total_jobs, color: 'text-zinc-100' },
    { label: 'Completed', value: stats.completed_jobs, color: 'text-green-400' },
    { label: 'Files Labelled', value: stats.files_labelled, color: 'text-blue-400' },
    { label: 'Files Failed', value: stats.files_failed, color: 'text-red-400' },
    { label: 'Entity Types', value: stats.entity_types_detected, color: 'text-amber-400' },
    { label: 'Total Detections', value: stats.total_detections, color: 'text-purple-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{c.label}</div>
          <div className={`text-2xl font-semibold ${c.color}`}>{c.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Chart Panel ────────────────────────────────────────────── */

function ChartPanel({ tab, data }: { tab: ReportTab; data: Record<string, unknown>[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      {tab === 'summary' && <JobSummaryChart data={data} />}
      {tab === 'detections' && <DetectionsChart data={data} />}
      {tab === 'labels' && <LabelDistributionChart data={data} />}
      {tab === 'throughput' && <ThroughputChart data={data} />}
    </div>
  );
}

function JobSummaryChart({ data }: { data: Record<string, unknown>[] }) {
  // Pivot: group by day, stack by status
  const byDay = new Map<string, Record<string, number>>();
  for (const row of data) {
    const day = formatDate(row.day);
    const status = String(row.status);
    const count = Number(row.job_count ?? 0);
    if (!byDay.has(day)) byDay.set(day, { day: 0 } as unknown as Record<string, number>);
    const entry = byDay.get(day)!;
    entry[status] = (entry[status] ?? 0) + count;
  }
  const chartData = [...byDay.entries()].map(([day, counts]) => ({ day, ...counts }));
  const statuses = [...new Set(data.map((r) => String(r.status)))];

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-300 mb-4">Jobs by Day and Status</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="day" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
          <Legend />
          {statuses.map((s) => (
            <Bar key={s} dataKey={s} stackId="jobs" fill={STATUS_COLORS[s] ?? '#6b7280'} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DetectionsChart({ data }: { data: Record<string, unknown>[] }) {
  // Pivot: day → entity_type → count
  const byDay = new Map<string, Record<string, number>>();
  const entityTypes = new Set<string>();
  for (const row of data) {
    const day = formatDate(row.day);
    const entity = String(row.entity_type);
    entityTypes.add(entity);
    if (!byDay.has(day)) byDay.set(day, {});
    byDay.get(day)![entity] = Number(row.total_detections ?? 0);
  }
  const chartData = [...byDay.entries()].map(([day, counts]) => ({ day, ...counts }));
  const types = [...entityTypes];

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-300 mb-4">Entity Detections Over Time</h3>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="day" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
          <Legend />
          {types.map((t, i) => (
            <Area key={t} type="monotone" dataKey={t} stackId="detections"
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.3} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderPieLabel = ({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`;

function LabelDistributionChart({ data }: { data: Record<string, unknown>[] }) {
  const chartData = data.map((row) => ({
    name: String(row.label_applied ?? 'Unknown'),
    value: Number(row.file_count ?? 0),
  }));

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-300 mb-4">Label Distribution</h3>
      <div className="flex items-center gap-8">
        <ResponsiveContainer width="50%" height={320}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" outerRadius={120} dataKey="value"
              label={renderPieLabel}
              labelLine={{ stroke: '#71717a' }}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {chartData.map((item, i) => (
            <div key={item.name} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-zinc-400">{item.name}</span>
              <span className="ml-auto text-zinc-200 font-medium">{item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThroughputChart({ data }: { data: Record<string, unknown>[] }) {
  const chartData = data.map((row) => ({
    hour: formatDateTime(row.hour),
    'Avg files/s': Number(row.avg_fps ?? 0),
    'Max files/s': Number(row.max_fps ?? 0),
    'Total processed': Number(row.total_processed ?? 0),
    'Failed': Number(row.total_failed ?? 0),
  })).reverse();

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-300 mb-4">Throughput Over Time</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="hour" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
          <Legend />
          <Line type="monotone" dataKey="Avg files/s" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Max files/s" stroke="#22c55e" strokeWidth={1} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Data Table (fallback / detail view) ────────────────────── */

function DataTable({ data }: { data: Record<string, unknown>[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Raw Data</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {Object.keys(data[0]).map((key) => (
                <th key={key} className="text-left py-2 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  {key.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                {Object.entries(row).map(([key, val]) => (
                  <td key={key} className="py-2 px-3 text-zinc-300 whitespace-nowrap">
                    {formatValue(val)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Formatters ──────────────────────────────────────────────── */

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '--';
  if (typeof val === 'number') return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof val === 'string' && val.includes('T')) {
    try { return new Date(val).toLocaleDateString(); } catch { /* not a date */ }
  }
  return String(val);
}

function formatDate(val: unknown): string {
  if (typeof val === 'string') {
    try { return new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { /* fall through */ }
  }
  return String(val ?? '');
}

function formatDateTime(val: unknown): string {
  if (typeof val === 'string') {
    try {
      return new Date(val).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { /* fall through */ }
  }
  return String(val ?? '');
}
