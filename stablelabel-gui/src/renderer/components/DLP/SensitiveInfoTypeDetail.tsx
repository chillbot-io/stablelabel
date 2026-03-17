import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { SensitiveInfoType } from '../../lib/types';

interface Props { sitName: string; }

export default function SensitiveInfoTypeDetail({ sitName }: Props) {
  const { invoke } = usePowerShell();
  const [sit, setSit] = useState<SensitiveInfoType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    invoke<SensitiveInfoType>('Get-SLSensitiveInfoType', { Identity: sitName }).then(r => {
      if (r.success && r.data) setSit(r.data);
      else setError(r.error ?? 'Not found');
      setLoading(false);
    });
  }, [sitName]);

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>;
  if (error || !sit) return <div className="p-6"><div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-sm text-red-300">{error ?? 'Not found'}</div></div>;

  const isCustom = sit.Publisher && sit.Publisher !== 'Microsoft Corporation';

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{sit.Name}</h2>
          {sit.Description && <p className="text-sm text-zinc-400 mt-1">{sit.Description}</p>}
        </div>
        {isCustom && <span className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">Custom</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card label="ID" value={sit.Id} mono />
        <Card label="Publisher" value={sit.Publisher ?? 'N/A'} />
        {sit.RecommendedConfidence != null && <Card label="Recommended Confidence" value={`${sit.RecommendedConfidence}%`} />}
        {sit.Type && <Card label="Type" value={sit.Type} />}
      </div>

      <RawJson data={sit} />
    </div>
  );
}

function Card({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-white/[0.03] rounded-lg p-3"><dt className="text-xs text-zinc-500 mb-1">{label}</dt><dd className={`text-sm text-zinc-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</dd></div>;
}
function RawJson({ data }: { data: unknown }) { const [o, setO] = useState(false); return <div className="border-t border-white/[0.06] pt-4"><button onClick={() => setO(!o)} className="text-xs text-zinc-500 hover:text-zinc-300">{o ? '▾ Hide' : '▸ Show'} raw JSON</button>{o && <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>}</div>; }
