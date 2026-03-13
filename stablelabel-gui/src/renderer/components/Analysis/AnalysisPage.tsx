import React, { useState } from 'react';
import PermissionCheck from './PermissionCheck';
import PolicyConflicts from './PolicyConflicts';
import DeploymentReadiness from './DeploymentReadiness';
import LabelReport from './LabelReport';
import PolicyHealth from './PolicyHealth';
import LabelMismatch from './LabelMismatch';
import LabelDlpAlignment from './LabelDlpAlignment';

type Section = 'readiness' | 'permissions' | 'health' | 'conflicts' | 'alignment' | 'mismatch' | 'report';

const sections: Array<{ id: Section; label: string; description: string }> = [
  { id: 'readiness', label: 'Readiness', description: 'Pre-deployment checklist' },
  { id: 'permissions', label: 'Permissions', description: 'Verify user access' },
  { id: 'health', label: 'Policy Health', description: 'Status of all policies' },
  { id: 'conflicts', label: 'Conflicts', description: 'Overlapping policy rules' },
  { id: 'alignment', label: 'DLP Alignment', description: 'Label-to-DLP coverage' },
  { id: 'mismatch', label: 'Mismatches', description: 'Graph vs policy labels' },
  { id: 'report', label: 'Label Report', description: 'Full label summary' },
];

export default function AnalysisPage() {
  const [active, setActive] = useState<Section>('readiness');

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Analysis</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">Checks, reports, and diagnostics</p>
        </div>
        <div className="flex-1 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${active === s.id ? 'bg-gray-800 border-l-2 border-cyan-400' : 'hover:bg-gray-800/50 border-l-2 border-transparent'}`}
            >
              <div className="text-sm text-gray-200">{s.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-800">
          <div className="text-[10px] text-gray-600 space-y-1">
            <p>All checks are read-only.</p>
            <p>Requires Graph + Compliance.</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        {active === 'readiness' && <DeploymentReadiness />}
        {active === 'permissions' && <PermissionCheck />}
        {active === 'health' && <PolicyHealth />}
        {active === 'conflicts' && <PolicyConflicts />}
        {active === 'alignment' && <LabelDlpAlignment />}
        {active === 'mismatch' && <LabelMismatch />}
        {active === 'report' && <LabelReport />}
      </div>
    </div>
  );
}
