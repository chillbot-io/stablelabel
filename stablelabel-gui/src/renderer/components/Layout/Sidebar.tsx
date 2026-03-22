import React from 'react';
import type { Page } from '../../lib/types';

/* ------------------------------------------------------------------ */
/*  SVG icon components — geometric, authoritative, stroke-based      */
/* ------------------------------------------------------------------ */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const icons: Record<string, React.ReactNode> = {
  /* Dashboard — 4 quadrants */
  dashboard: (
    <Icon>
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </Icon>
  ),
  /* Labels — classification tag */
  labels: (
    <Icon>
      <path d="M2.5 4.5a2 2 0 012-2h3.586a1 1 0 01.707.293l8 8a1 1 0 010 1.414l-3.586 3.586a1 1 0 01-1.414 0l-8-8A1 1 0 012.5 7.086V4.5z" />
      <circle cx="6.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  ),
  /* Documents — page with folded corner */
  documents: (
    <Icon>
      <path d="M5 2h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M12 2v4h4" />
    </Icon>
  ),
  /* Manual Label — upload arrow */
  'manual-label': (
    <Icon>
      <path d="M4 17h12" />
      <path d="M10 3v10" />
      <path d="M6 9l4-4 4 4" />
    </Icon>
  ),
  /* Bulk Ops — trash/sweep */
  'bulk-ops': (
    <Icon>
      <path d="M4 6h12" />
      <path d="M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6" />
      <path d="M8 6V4h4v2" />
      <path d="M9 9v5" />
      <path d="M11 9v5" />
    </Icon>
  ),
  /* Explorer — folder tree */
  explorer: (
    <Icon>
      <path d="M2 6a1 1 0 011-1h4.5l2 2H17a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" />
      <path d="M8 13h4" />
    </Icon>
  ),
  /* Snapshots — stacked layers */
  snapshots: (
    <Icon>
      <path d="M10 3l7 3.5-7 3.5-7-3.5L10 3z" />
      <path d="M3 10l7 3.5L17 10" />
      <path d="M3 14l7 3.5 7-3.5" />
    </Icon>
  ),
  /* Analysis — bar chart */
  analysis: (
    <Icon>
      <path d="M3 17V11" strokeWidth="2.5" />
      <path d="M8 17V7" strokeWidth="2.5" />
      <path d="M13 17V9" strokeWidth="2.5" />
      <path d="M18 17V3" strokeWidth="2.5" />
    </Icon>
  ),
  /* Settings — horizontal sliders */
  settings: (
    <Icon>
      <path d="M3 5h14" />
      <path d="M3 10h14" />
      <path d="M3 15h14" />
      <circle cx="7" cy="5" r="1.5" fill="currentColor" />
      <circle cx="13" cy="10" r="1.5" fill="currentColor" />
      <circle cx="9" cy="15" r="1.5" fill="currentColor" />
    </Icon>
  ),
};

/* ------------------------------------------------------------------ */
/*  Navigation structure                                               */
/* ------------------------------------------------------------------ */

interface NavItem {
  id: Page;
  label: string;
  group: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview' },
  { id: 'labels', label: 'Labels', group: 'Sensitivity Labels' },
  { id: 'documents', label: 'Documents', group: 'Operations' },
  { id: 'manual-label', label: 'CSV Upload', group: 'Operations' },
  { id: 'bulk-ops', label: 'Bulk Removal', group: 'Operations' },
  { id: 'explorer', label: 'Explorer', group: 'Browse' },
  { id: 'snapshots', label: 'Snapshots', group: 'Safety' },
  { id: 'analysis', label: 'Analysis', group: 'Intelligence' },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const groups = [...new Set(navItems.map((item) => item.group))];

  return (
    <nav className="w-56 bg-white/[0.02] flex flex-col">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-[15px] font-semibold text-white tracking-tight">StableLabel</h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">Sensitivity Label Management</p>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group} className="mt-4 first:mt-0">
            <div className="px-3 mb-1 text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
              {group}
            </div>
            {navItems
              .filter((item) => item.group === group)
              .map((item) => {
                const active = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] rounded-lg transition-colors ${
                      active
                        ? 'bg-blue-500/[0.12] text-blue-400'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                    }`}
                  >
                    {icons[item.id]}
                    {item.label}
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      {/* Footer: Settings + Version */}
      <div className="px-2 pb-3 pt-1 border-t border-white/[0.04]">
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] rounded-lg transition-colors ${
            currentPage === 'settings'
              ? 'bg-blue-500/[0.12] text-blue-400'
              : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
          }`}
        >
          {icons.settings}
          Settings
        </button>
        <p className="text-[10px] text-zinc-600 px-3 mt-1.5">v0.1.0</p>
      </div>
    </nav>
  );
}
