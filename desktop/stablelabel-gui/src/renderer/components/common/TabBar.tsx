import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: string;
  kind: string; // 'label' | 'policy' | 'autolabel' — used for color coding
  dirty?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const kindColors: Record<string, string> = {
  label: 'bg-blue-400',
  policy: 'bg-violet-400',
  autolabel: 'bg-teal-400',
  rule: 'bg-orange-400',
  sit: 'bg-yellow-400',
};

export default function TabBar({ tabs, activeTabId, onSelect, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div role="tablist" className="flex items-center gap-0.5 bg-zinc-950 border-b border-white/[0.04] px-1 pt-1 overflow-x-auto min-h-[36px]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const dotColor = kindColors[tab.kind] ?? 'bg-zinc-500';

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-t cursor-pointer transition-colors max-w-[200px] ${
              isActive
                ? 'bg-white/[0.04] text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
            }`}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.id); } }}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />
            <span className="truncate">{tab.label}</span>
            {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
              title="Close tab"
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}
