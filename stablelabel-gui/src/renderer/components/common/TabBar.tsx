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
  label: 'bg-blue-500',
  policy: 'bg-purple-500',
  autolabel: 'bg-teal-500',
  retention: 'bg-amber-500',
  dlp: 'bg-red-500',
};

export default function TabBar({ tabs, activeTabId, onSelect, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 bg-gray-950 border-b border-gray-800 px-1 pt-1 overflow-x-auto min-h-[36px]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const dotColor = kindColors[tab.kind] ?? 'bg-gray-500';

        return (
          <div
            key={tab.id}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t cursor-pointer border border-b-0 transition-colors max-w-[200px] ${
              isActive
                ? 'bg-gray-900 border-gray-700 text-gray-200'
                : 'bg-gray-950 border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-900/50'
            }`}
            onClick={() => onSelect(tab.id)}
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
