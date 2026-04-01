import { useState } from 'react';

export default function RawJsonSection({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-white/[0.06] pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? '▾ Hide' : '▸ Show'} raw JSON
      </button>
      {expanded && (
        <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
