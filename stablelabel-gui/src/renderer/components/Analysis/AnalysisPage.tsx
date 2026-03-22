import React, { useState } from 'react';
import LabelReport from './LabelReport';
import LabelMismatch from './LabelMismatch';

type Section = 'mismatch' | 'report';

const sections: Array<{ id: Section; label: string; description: string }> = [
  { id: 'mismatch', label: 'Mismatches', description: 'Graph vs policy labels' },
  { id: 'report', label: 'Label Report', description: 'Full label summary' },
];

export default function AnalysisPage() {
  const [active, setActive] = useState<Section>('mismatch');

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-white/[0.06] bg-zinc-950 flex flex-col">
        <div className="p-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-300">Analysis</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Label reports and diagnostics</p>
        </div>
        <div className="flex-1 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${active === s.id ? 'bg-white/[0.06] border-l-2 border-cyan-400' : 'hover:bg-white/[0.04] border-l-2 border-transparent'}`}
            >
              <div className="text-sm text-zinc-200">{s.label}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 space-y-1">
            <p>All checks are read-only.</p>
            <p>Requires Graph + Compliance.</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        {active === 'mismatch' && <LabelMismatch />}
        {active === 'report' && <LabelReport />}
      </div>
    </div>
  );
}
