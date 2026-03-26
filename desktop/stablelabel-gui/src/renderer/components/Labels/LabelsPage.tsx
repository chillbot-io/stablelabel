import React, { useState, useCallback, useRef } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import TabBar, { type Tab } from '../common/TabBar';
import type { LabelPolicy, AutoLabelPolicy } from '../../lib/types';
import LabelList from './LabelList';
import LabelDetail from './LabelDetail';
import PolicyList from './PolicyList';
import PolicyDetail from './PolicyDetail';
import PolicyForm from './PolicyForm';
import AutoLabelList from './AutoLabelList';
import AutoLabelDetail from './AutoLabelDetail';
import AutoLabelForm from './AutoLabelForm';

type BrowserSection = 'labels' | 'policies' | 'autolabel';

interface OpenTab extends Tab {
  type: string;
  itemId: string;
}

export default function LabelsPage() {
  const [browserSection, setBrowserSection] = useState<BrowserSection>('labels');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeTabIdRef = useRef(activeTabId);
  const formCounterRef = useRef(0);
  activeTabIdRef.current = activeTabId;

  const openTab = useCallback(
    (type: string, itemId: string, label: string, kind: string) => {
      const tabId = `${type}:${itemId}`;
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) return prev;
        const newTab: OpenTab = { id: tabId, label, kind, type, itemId };
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
        // Use ref to avoid stale closure on activeTabId
        if (activeTabIdRef.current === tabId) {
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
    [],
  );

  // View handlers
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

  // Form handlers — new
  const handleNewPolicy = useCallback(() => {
    formCounterRef.current++;
    openTab('policy-form-new', `new-${formCounterRef.current}`, '+ New Policy', 'policy');
  }, [openTab]);

  const handleNewAutoLabel = useCallback(() => {
    formCounterRef.current++;
    openTab('autolabel-form-new', `new-${formCounterRef.current}`, '+ New Auto-Label', 'autolabel');
  }, [openTab]);

  // Form handlers — edit (opens a form tab pre-populated with existing data)
  const handleEditPolicy = useCallback(
    (name: string) => openTab('policy-form-edit', name, `Edit: ${name}`, 'policy'),
    [openTab],
  );

  const handleEditAutoLabel = useCallback(
    (name: string) => openTab('autolabel-form-edit', name, `Edit: ${name}`, 'autolabel'),
    [openTab],
  );

  // After save: close form tab, open the detail tab for the saved item
  const handlePolicySaved = useCallback(
    (name: string) => {
      // Close the current form tab
      if (activeTabId) closeTab(activeTabId);
      // Open the detail view
      handleOpenPolicy(name);
    },
    [activeTabId, closeTab, handleOpenPolicy],
  );

  const handleAutoLabelSaved = useCallback(
    (name: string) => {
      if (activeTabId) closeTab(activeTabId);
      handleOpenAutoLabel(name);
    },
    [activeTabId, closeTab, handleOpenAutoLabel],
  );

  // After delete: close the tab
  const handleDeleted = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left browser panel */}
      <div className="w-64 flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-zinc-950">
        <div className="flex border-b border-white/[0.06]">
          <SectionTab label="Labels" active={browserSection === 'labels'} onClick={() => setBrowserSection('labels')} accentColor="blue" />
          <SectionTab label="Policies" active={browserSection === 'policies'} onClick={() => setBrowserSection('policies')} accentColor="purple" />
          <SectionTab label="Auto" active={browserSection === 'autolabel'} onClick={() => setBrowserSection('autolabel')} accentColor="teal" />
        </div>

        <div className="flex-1 overflow-hidden">
          {browserSection === 'labels' && <LabelList onOpenLabel={handleOpenLabel} />}
          {browserSection === 'policies' && <PolicyList onOpenPolicy={handleOpenPolicy} onNewPolicy={handleNewPolicy} />}
          {browserSection === 'autolabel' && <AutoLabelList onOpenAutoLabel={handleOpenAutoLabel} onNewAutoLabel={handleNewAutoLabel} />}
        </div>
      </div>

      {/* Right workspace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />

        <div className="flex-1 overflow-auto">
          {activeTab ? (
            <TabContent
              tab={activeTab}
              onOpenLabel={handleOpenLabel}
              onOpenPolicy={handleOpenPolicy}
              onOpenAutoLabel={handleOpenAutoLabel}
              onEditPolicy={handleEditPolicy}
              onEditAutoLabel={handleEditAutoLabel}
              onPolicySaved={handlePolicySaved}
              onAutoLabelSaved={handleAutoLabelSaved}
              onDeleted={handleDeleted}
              onCancel={() => { if (activeTabId) closeTab(activeTabId); }}
            />
          ) : (
            <EmptyWorkspace tabCount={tabs.length} onSwitchSection={setBrowserSection} onNewPolicy={handleNewPolicy} onNewAutoLabel={handleNewAutoLabel} />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTab({ label, active, onClick, accentColor }: { label: string; active: boolean; onClick: () => void; accentColor: string }) {
  const borderColor = active
    ? accentColor === 'blue' ? 'border-blue-400' : accentColor === 'purple' ? 'border-purple-400' : 'border-teal-400'
    : 'border-transparent';

  return (
    <button onClick={onClick} className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${borderColor} ${active ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
      {label}
    </button>
  );
}

function TabContent({
  tab,
  onOpenLabel,
  onOpenPolicy,
  onOpenAutoLabel,
  onEditPolicy,
  onEditAutoLabel,
  onPolicySaved,
  onAutoLabelSaved,
  onDeleted,
  onCancel,
}: {
  tab: OpenTab;
  onOpenLabel: (id: string, name: string) => void;
  onOpenPolicy: (name: string) => void;
  onOpenAutoLabel: (name: string) => void;
  onEditPolicy: (name: string) => void;
  onEditAutoLabel: (name: string) => void;
  onPolicySaved: (name: string) => void;
  onAutoLabelSaved: (name: string) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  switch (tab.type) {
    case 'label-detail':
      return <LabelDetail labelId={tab.itemId} onOpenPolicy={onOpenPolicy} />;
    case 'policy-detail':
      return <PolicyDetail policyName={tab.itemId} onOpenLabel={onOpenLabel} onEdit={onEditPolicy} onDeleted={onDeleted} />;
    case 'autolabel-detail':
      return <AutoLabelDetail policyName={tab.itemId} onOpenLabel={onOpenLabel} onEdit={onEditAutoLabel} onDeleted={onDeleted} />;
    case 'policy-form-new':
      return <PolicyForm onSaved={onPolicySaved} onCancel={onCancel} />;
    case 'policy-form-edit':
      return <PolicyFormWithData policyName={tab.itemId} onSaved={onPolicySaved} onCancel={onCancel} onDeleted={onDeleted} />;
    case 'autolabel-form-new':
      return <AutoLabelForm onSaved={onAutoLabelSaved} onCancel={onCancel} />;
    case 'autolabel-form-edit':
      return <AutoLabelFormWithData policyName={tab.itemId} onSaved={onAutoLabelSaved} onCancel={onCancel} onDeleted={onDeleted} />;
    default:
      return <div className="p-6 text-zinc-500">Unknown tab type</div>;
  }
}

/** Fetches existing policy data before rendering the edit form */
function PolicyFormWithData({ policyName, onSaved, onCancel, onDeleted }: { policyName: string; onSaved: (name: string) => void; onCancel: () => void; onDeleted: () => void }) {
  const { invoke } = usePowerShell();
  const [policy, setPolicy] = React.useState<LabelPolicy | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    invoke<LabelPolicy>('Get-SLLabelPolicy', { Identity: policyName }).then((r) => {
      if (r.success && r.data) setPolicy(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [policyName, invoke]);

  if (loading) return <div className="p-6"><div className="h-32 bg-white/[0.06] rounded-lg animate-pulse" /></div>;
  return <PolicyForm existing={policy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />;
}

/** Fetches existing auto-label policy data before rendering the edit form */
function AutoLabelFormWithData({ policyName, onSaved, onCancel, onDeleted }: { policyName: string; onSaved: (name: string) => void; onCancel: () => void; onDeleted: () => void }) {
  const { invoke } = usePowerShell();
  const [policy, setPolicy] = React.useState<AutoLabelPolicy | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    invoke<AutoLabelPolicy>('Get-SLAutoLabelPolicy', { Identity: policyName }).then((r) => {
      if (r.success && r.data) setPolicy(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [policyName, invoke]);

  if (loading) return <div className="p-6"><div className="h-32 bg-white/[0.06] rounded-lg animate-pulse" /></div>;
  return <AutoLabelForm existing={policy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />;
}

function EmptyWorkspace({
  tabCount,
  onSwitchSection,
  onNewPolicy,
  onNewAutoLabel,
}: {
  tabCount: number;
  onSwitchSection: (s: 'labels' | 'policies' | 'autolabel') => void;
  onNewPolicy: () => void;
  onNewAutoLabel: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-lg">
        <h2 className="text-lg font-semibold text-zinc-300 mb-2">
          {tabCount === 0 ? 'Select an item or create new' : 'No tab selected'}
        </h2>
        <p className="text-sm text-zinc-500 mb-6">
          Browse labels, policies, and auto-label rules in the left panel.
          Open multiple items as tabs for side-by-side reference.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <QuickLink label="Labels" description="View hierarchy" color="blue" onClick={() => onSwitchSection('labels')} />
          <QuickLink label="Policies" description="Publishing policies" color="purple" onClick={() => onSwitchSection('policies')} />
          <QuickLink label="Auto-Label" description="Automatic rules" color="teal" onClick={() => onSwitchSection('autolabel')} />
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onNewPolicy}
            className="px-4 py-2 text-xs text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-colors"
          >
            + New Label Policy
          </button>
          <button
            onClick={onNewAutoLabel}
            className="px-4 py-2 text-xs text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg transition-colors"
          >
            + New Auto-Label Policy
          </button>
        </div>

        <div className="mt-6 text-xs text-zinc-600 space-y-1">
          <p>Tip: Items open as tabs — keep multiple open at once.</p>
          <p>Detail views have Edit buttons. Policies have Delete.</p>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ label, description, color, onClick }: { label: string; description: string; color: string; onClick: () => void }) {
  const bg = color === 'blue' ? 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
    : color === 'purple' ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20'
    : 'bg-teal-500/10 border-teal-500/20 hover:bg-teal-500/20';

  return (
    <button onClick={onClick} className={`p-3 rounded-lg border transition-colors text-left ${bg}`}>
      <div className="text-sm font-medium text-zinc-200">{label}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
    </button>
  );
}
