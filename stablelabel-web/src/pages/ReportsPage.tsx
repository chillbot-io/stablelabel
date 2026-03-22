import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenants } from '@/hooks/useTenants';
import PageHeader from '@/components/PageHeader';
import TenantSelector from '@/components/TenantSelector';

type ReportTab = 'summary' | 'detections' | 'labels' | 'throughput';

export default function ReportsPage() {
  const { tenants, selected, setSelected } = useTenants();
  const [tab, setTab] = useState<ReportTab>('summary');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    const endpoint = `/tenants/${selected.id}/reports/${tab}?days=${days}`;
    api.get<Record<string, unknown>[]>(endpoint)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selected, tab, days]);

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'summary', label: 'Job Summary' },
    { key: 'detections', label: 'Entity Detections' },
    { key: 'labels', label: 'Label Distribution' },
    { key: 'throughput', label: 'Throughput' },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Reports" description="Analytics and trend data">
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

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">No data for this period</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
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
              {data.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="py-2 px-3 text-zinc-300">
                      {formatValue(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '--';
  if (typeof val === 'number') return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof val === 'string' && val.includes('T')) {
    try { return new Date(val).toLocaleDateString(); } catch { /* not a date */ }
  }
  return String(val);
}
