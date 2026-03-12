import React, { useState, useCallback } from 'react';
import TabBar, { type Tab } from '../common/TabBar';
import LabelList from './LabelList';
import LabelDetail from './LabelDetail';
import PolicyList from './PolicyList';
import PolicyDetail from './PolicyDetail';
import AutoLabelList from './AutoLabelList';
import AutoLabelDetail from './AutoLabelDetail';

type BrowserSection = 'labels' | 'policies' | 'autolabel';

interface OpenTab extends Tab {
  /** What to render: 'label-detail' | 'policy-detail' | 'autolabel-detail' */
  type: string;
  /** Identifier to pass to the detail component (label ID, policy name, etc.) */
  itemId: string;
}

export default function LabelsPage() {
  const [browserSection, setBrowserSection] = useState<BrowserSection>('labels');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Open or focus a tab
  const openTab = useCallback(
    (type: string, itemId: string, label: string, kind: string) => {
      const tabId = `${type}:${itemId}`;
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) {
          // Already open — just focus it
          setActiveTabId(tabId);
          return prev;
        }
        const newTab: OpenTab = { id: tabId, label, kind, type, itemId };
        setActiveTabId(tabId);
        return [...prev, newTab];
      });
      setActiveTabId(tabId);
    },
    [],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        // If we closed the active tab, focus the nearest remaining tab
        if (activeTabId === tabId) {
          if (next.length === 0) {
            setActiveTabId(null);
          } else {
            const newIdx = Math.min(idx, next.length - 1);
            setActiveTabId(next[newIdx].id);
          }
        }
        return next;
      });
    },
    [activeTabId],
  );

  // Handlers for cross-linking between detail views
  const handleOpenLabel = useCallback(
    (id: string, name: string) => openTab('label-detail', id, name, 'label'),
    [openTab],
  );

  const handleOpenPolicy = useCallback(
    (name: string) => openTab('policy-detail', name, name, 'policy'),
    [openTab],
  );

  const handleOpenAutoLabel = useCallback(
    (name: string) => openTab('autolabel-detail', name, name, 'autolabel'),
    [openTab],
  );

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left browser panel */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
        {/* Section switcher */}
        <div className="flex border-b border-gray-800">
          <SectionTab
            label="Labels"
            active={browserSection === 'labels'}
            onClick={() => setBrowserSection('labels')}
            accentColor="blue"
          />
          <SectionTab
            label="Policies"
            active={browserSection === 'policies'}
            onClick={() => setBrowserSection('policies')}
            accentColor="purple"
          />
          <SectionTab
            label="Auto"
            active={browserSection === 'autolabel'}
            onClick={() => setBrowserSection('autolabel')}
            accentColor="teal"
          />
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-hidden">
          {browserSection === 'labels' && (
            <LabelList onOpenLabel={handleOpenLabel} />
          )}
          {browserSection === 'policies' && (
            <PolicyList onOpenPolicy={handleOpenPolicy} />
          )}
          {browserSection === 'autolabel' && (
            <AutoLabelList onOpenAutoLabel={handleOpenAutoLabel} />
          )}
        </div>
      </div>

      {/* Right workspace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          onClose={closeTab}
        />

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {activeTab ? (
            <TabContent
              tab={activeTab}
              onOpenLabel={handleOpenLabel}
              onOpenPolicy={handleOpenPolicy}
              onOpenAutoLabel={handleOpenAutoLabel}
            />
          ) : (
            <EmptyWorkspace
              tabCount={tabs.length}
              onSwitchSection={setBrowserSection}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTab({
  label,
  active,
  onClick,
  accentColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  const borderColor = active
    ? accentColor === 'blue'
      ? 'border-blue-400'
      : accentColor === 'purple'
        ? 'border-purple-400'
        : 'border-teal-400'
    : 'border-transparent';

  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${borderColor} ${
        active ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function TabContent({
  tab,
  onOpenLabel,
  onOpenPolicy,
  onOpenAutoLabel,
}: {
  tab: OpenTab;
  onOpenLabel: (id: string, name: string) => void;
  onOpenPolicy: (name: string) => void;
  onOpenAutoLabel: (name: string) => void;
}) {
  switch (tab.type) {
    case 'label-detail':
      return <LabelDetail labelId={tab.itemId} onOpenPolicy={onOpenPolicy} />;
    case 'policy-detail':
      return <PolicyDetail policyName={tab.itemId} onOpenLabel={onOpenLabel} />;
    case 'autolabel-detail':
      return <AutoLabelDetail policyName={tab.itemId} onOpenLabel={onOpenLabel} />;
    default:
      return <div className="p-6 text-gray-500">Unknown tab type</div>;
  }
}

function EmptyWorkspace({
  tabCount,
  onSwitchSection,
}: {
  tabCount: number;
  onSwitchSection: (s: 'labels' | 'policies' | 'autolabel') => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">
          {tabCount === 0 ? 'Select an item to inspect' : 'No tab selected'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Click a label, policy, or auto-label rule in the left panel to open it here.
          You can open multiple items as tabs for side-by-side reference.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <QuickLink
            label="Labels"
            description="Sensitivity label hierarchy"
            color="blue"
            onClick={() => onSwitchSection('labels')}
          />
          <QuickLink
            label="Policies"
            description="Publishing policies"
            color="purple"
            onClick={() => onSwitchSection('policies')}
          />
          <QuickLink
            label="Auto-Label"
            description="Automatic labeling rules"
            color="teal"
            onClick={() => onSwitchSection('autolabel')}
          />
        </div>

        <div className="mt-6 text-xs text-gray-600 space-y-1">
          <p>Tip: Items open as tabs — you can keep multiple open at once.</p>
          <p>Labels link to their policies, and policies link back to labels.</p>
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  label,
  description,
  color,
  onClick,
}: {
  label: string;
  description: string;
  color: string;
  onClick: () => void;
}) {
  const bg =
    color === 'blue'
      ? 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
      : color === 'purple'
        ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20'
        : 'bg-teal-500/10 border-teal-500/20 hover:bg-teal-500/20';

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border transition-colors text-left ${bg}`}
    >
      <div className="text-sm font-medium text-gray-200">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{description}</div>
    </button>
  );
}
