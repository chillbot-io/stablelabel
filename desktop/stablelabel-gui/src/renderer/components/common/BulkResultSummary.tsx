import { useState } from 'react';

interface ResultItem {
  DriveId: string;
  ItemId: string;
  Status: string;
  Error: string | null;
}

interface BulkResultData {
  TotalItems: number;
  SuccessCount: number;
  FailedCount: number;
  DryRun: boolean;
  Results?: ResultItem[];
}

export default function BulkResultSummary({
  result,
  heading,
  subtitle,
}: {
  result: BulkResultData;
  heading?: string;
  subtitle?: string;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const title = heading ?? (result.DryRun ? 'Dry Run Results' : 'Results');

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        {title}{subtitle ? ` — ${subtitle}` : ''}
      </h4>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.06] rounded-lg p-2.5">
          <dt className="text-xs text-zinc-500">Total</dt>
          <dd className="text-lg font-bold text-zinc-200">{result.TotalItems}</dd>
        </div>
        <div className="bg-white/[0.06] rounded-lg p-2.5">
          <dt className="text-xs text-zinc-500">Succeeded</dt>
          <dd className="text-lg font-bold text-emerald-400">{result.SuccessCount}</dd>
        </div>
        <div className="bg-white/[0.06] rounded-lg p-2.5">
          <dt className="text-xs text-zinc-500">Failed</dt>
          <dd className={`text-lg font-bold ${result.FailedCount > 0 ? 'text-red-400' : 'text-zinc-400'}`}>{result.FailedCount}</dd>
        </div>
      </div>

      {result.Results && result.Results.length > 0 && (
        <div>
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-zinc-500 hover:text-zinc-300">
            {showDetails ? '▾ Hide' : '▸ Show'} item details
          </button>
          {showDetails && (
            <div className="mt-2 space-y-1 max-h-48 overflow-auto">
              {result.Results.map((item) => (
                <div key={`${item.DriveId}/${item.ItemId}`} className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.06] rounded-lg text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-400 font-mono truncate">{item.DriveId}/{item.ItemId}</span>
                    {item.Error && <span className="text-red-400/60 truncate">{item.Error}</span>}
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-lg shrink-0 ${
                    item.Status === 'Failed' ? 'bg-red-500/10 text-red-400' :
                    item.Status === 'DryRun' ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-emerald-400/10 text-emerald-400'
                  }`}>
                    {item.Status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
