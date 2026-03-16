import React from 'react';
import type { Page } from '../../lib/types';

interface NavItem {
  id: Page;
  label: string;
  icon: string;
  group: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', group: 'Overview' },
  { id: 'labels', label: 'Labels', icon: '◉', group: 'Information Protection' },
  { id: 'retention', label: 'Retention', icon: '⏱', group: 'Information Protection' },
  { id: 'dlp', label: 'DLP', icon: '⛨', group: 'Information Protection' },
  { id: 'documents', label: 'Documents', icon: '📄', group: 'Operations' },
  { id: 'fileshares', label: 'File Shares', icon: '📁', group: 'Operations' },
  { id: 'protection', label: 'Protection', icon: '🔐', group: 'Operations' },
  { id: 'elevation', label: 'Elevation', icon: '⬆', group: 'Operations' },
  { id: 'snapshots', label: 'Snapshots', icon: '📸', group: 'Safety' },
  { id: 'analysis', label: 'Analysis', icon: '🔍', group: 'Intelligence' },
  { id: 'templates', label: 'Templates', icon: '📋', group: 'Intelligence' },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const groups = [...new Set(navItems.map((item) => item.group))];

  return (
    <nav className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white tracking-tight">StableLabel</h1>
        <p className="text-xs text-gray-500 mt-0.5">Purview Compliance Manager</p>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {groups.map((group) => (
          <div key={group} className="mb-2">
            <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {group}
            </div>
            {navItems
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    currentPage === item.id
                      ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  {item.label}
                </button>
              ))}
          </div>
        ))}
      </div>

      {/* Settings + Version */}
      <div className="p-2 border-t border-gray-800">
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors ${
            currentPage === 'settings'
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'
          }`}
        >
          <span className="w-5 text-center">⚙</span>
          Settings
        </button>
        <p className="text-xs text-gray-600 px-4 mt-2">v0.1.0</p>
      </div>
    </nav>
  );
}
