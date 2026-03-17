import React, { useState } from 'react';
import ProtectionConfigPanel from './ProtectionConfigPanel';
import ProtectionTemplates from './ProtectionTemplates';
import OnboardingPolicy from './OnboardingPolicy';
import DocumentTracking from './DocumentTracking';
import ProtectionLogs from './ProtectionLogs';

type Section = 'config' | 'templates' | 'onboarding' | 'tracking' | 'logs';

const sections: Array<{ id: Section; label: string; description: string }> = [
  { id: 'config', label: 'Configuration', description: 'Service status, keys, admins' },
  { id: 'templates', label: 'Templates', description: 'Encryption & rights templates' },
  { id: 'onboarding', label: 'Onboarding', description: 'User access control policy' },
  { id: 'tracking', label: 'Doc Tracking', description: 'Track & revoke document access' },
  { id: 'logs', label: 'Logs', description: 'Protection tracking logs' },
];

const isWindows = typeof window !== 'undefined' && window.stablelabel?.platform === 'win32';

export default function ProtectionPage() {
  const [active, setActive] = useState<Section>('config');

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-white/[0.06] bg-zinc-950 flex flex-col">
        <div className="p-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-zinc-300">AIP Protection</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Azure Information Protection service management</p>
        </div>
        {!isWindows && (
          <div className="mx-2 mt-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg text-[10px] text-amber-400">
            AIPService requires Windows with PowerShell 5.1. Some operations may not be available on this platform.
          </div>
        )}
        <div className="flex-1 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${active === s.id ? 'bg-white/[0.06] border-l-2 border-blue-400' : 'hover:bg-white/[0.04] border-l-2 border-transparent'}`}
            >
              <div className="text-sm text-zinc-200">{s.label}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 space-y-1">
            <p>Requires AIPService connection.</p>
            <p>Windows-only for some operations.</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 max-w-4xl">
        {active === 'config' && <ProtectionConfigPanel />}
        {active === 'templates' && <ProtectionTemplates />}
        {active === 'onboarding' && <OnboardingPolicy />}
        {active === 'tracking' && <DocumentTracking />}
        {active === 'logs' && <ProtectionLogs />}
      </div>
    </div>
  );
}
