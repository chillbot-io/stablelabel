import React, { useState, useCallback } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import TabBar, { type Tab } from '../common/TabBar';
import type { DlpPolicy, DlpRule } from '../../lib/types';
import DlpPolicyList from './DlpPolicyList';
import DlpPolicyDetail from './DlpPolicyDetail';
import DlpPolicyForm from './DlpPolicyForm';
import DlpRuleList from './DlpRuleList';
import DlpRuleDetail from './DlpRuleDetail';
import DlpRuleForm from './DlpRuleForm';
import SensitiveInfoTypeList from './SensitiveInfoTypeList';
import SensitiveInfoTypeDetail from './SensitiveInfoTypeDetail';

type BrowserSection = 'policies' | 'rules' | 'sit';

interface OpenTab extends Tab {
  type: string;
  itemId: string;
}

let formCounter = 0;

export default function DlpPage() {
  const [browserSection, setBrowserSection] = useState<BrowserSection>('policies');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback(
    (type: string, itemId: string, label: string, kind: string) => {
      const tabId = `${type}:${itemId}`;
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) {
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

  // Open detail handlers
  const handleOpenPolicy = useCallback(
    (name: string) => openTab('dlp-policy-detail', name, name, 'policy'),
    [openTab],
  );

  const handleOpenRule = useCallback(
    (name: string) => openTab('dlp-rule-detail', name, name, 'rule'),
    [openTab],
  );

  const handleOpenSit = useCallback(
    (name: string) => openTab('sit-detail', name, name, 'sit'),
    [openTab],
  );

  // New form handlers
  const handleNewPolicy = useCallback(() => {
    formCounter++;
    openTab('dlp-policy-form-new', `new-${formCounter}`, '+ New Policy', 'policy');
  }, [openTab]);

  const handleNewRule = useCallback(() => {
    formCounter++;
    openTab('dlp-rule-form-new', `new-${formCounter}`, '+ New Rule', 'rule');
  }, [openTab]);

  // Edit form handlers
  const handleEditPolicy = useCallback(
    (name: string) => openTab('dlp-policy-form-edit', name, `Edit: ${name}`, 'policy'),
    [openTab],
  );

  const handleEditRule = useCallback(
    (name: string) => openTab('dlp-rule-form-edit', name, `Edit: ${name}`, 'rule'),
    [openTab],
  );

  // After save: close form tab, open detail
  const handlePolicySaved = useCallback(
    (name: string) => {
      if (activeTabId) closeTab(activeTabId);
      handleOpenPolicy(name);
    },
    [activeTabId, closeTab, handleOpenPolicy],
  );

  const handleRuleSaved = useCallback(
    (name: string) => {
      if (activeTabId) closeTab(activeTabId);
      handleOpenRule(name);
    },
    [activeTabId, closeTab, handleOpenRule],
  );

  const handleDeleted = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left browser panel */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
        <div className="flex border-b border-gray-800">
          <SectionTab label="Policies" active={browserSection === 'policies'} onClick={() => setBrowserSection('policies')} accentColor="red" />
          <SectionTab label="Rules" active={browserSection === 'rules'} onClick={() => setBrowserSection('rules')} accentColor="orange" />
          <SectionTab label="Info Types" active={browserSection === 'sit'} onClick={() => setBrowserSection('sit')} accentColor="yellow" />
        </div>

        <div className="flex-1 overflow-hidden">
          {browserSection === 'policies' && <DlpPolicyList onOpen={handleOpenPolicy} onNew={handleNewPolicy} />}
          {browserSection === 'rules' && <DlpRuleList onOpen={handleOpenRule} onNew={handleNewRule} />}
          {browserSection === 'sit' && <SensitiveInfoTypeList onOpen={handleOpenSit} />}
        </div>
      </div>

      {/* Right workspace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />

        <div className="flex-1 overflow-auto">
          {activeTab ? (
            <TabContent
              tab={activeTab}
              onOpenPolicy={handleOpenPolicy}
              onOpenRule={handleOpenRule}
              onOpenSit={handleOpenSit}
              onEditPolicy={handleEditPolicy}
              onEditRule={handleEditRule}
              onPolicySaved={handlePolicySaved}
              onRuleSaved={handleRuleSaved}
              onDeleted={handleDeleted}
              onCancel={() => { if (activeTabId) closeTab(activeTabId); }}
            />
          ) : (
            <EmptyWorkspace tabCount={tabs.length} onSwitchSection={setBrowserSection} onNewPolicy={handleNewPolicy} onNewRule={handleNewRule} />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTab({ label, active, onClick, accentColor }: { label: string; active: boolean; onClick: () => void; accentColor: string }) {
  const borderColor = active
    ? accentColor === 'red' ? 'border-red-400' : accentColor === 'orange' ? 'border-orange-400' : 'border-yellow-400'
    : 'border-transparent';

  return (
    <button onClick={onClick} className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${borderColor} ${active ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}>
      {label}
    </button>
  );
}

function TabContent({
  tab,
  onOpenPolicy,
  onOpenRule,
  onOpenSit,
  onEditPolicy,
  onEditRule,
  onPolicySaved,
  onRuleSaved,
  onDeleted,
  onCancel,
}: {
  tab: OpenTab;
  onOpenPolicy: (name: string) => void;
  onOpenRule: (name: string) => void;
  onOpenSit: (name: string) => void;
  onEditPolicy: (name: string) => void;
  onEditRule: (name: string) => void;
  onPolicySaved: (name: string) => void;
  onRuleSaved: (name: string) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  switch (tab.type) {
    case 'dlp-policy-detail':
      return <DlpPolicyDetail policyName={tab.itemId} onEdit={onEditPolicy} onDeleted={onDeleted} onOpenRule={onOpenRule} />;
    case 'dlp-rule-detail':
      return <DlpRuleDetail ruleName={tab.itemId} onEdit={onEditRule} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />;
    case 'sit-detail':
      return <SensitiveInfoTypeDetail sitName={tab.itemId} />;
    case 'dlp-policy-form-new':
      return <DlpPolicyForm onSaved={onPolicySaved} onCancel={onCancel} />;
    case 'dlp-policy-form-edit':
      return <DlpPolicyFormWithData policyName={tab.itemId} onSaved={onPolicySaved} onCancel={onCancel} onDeleted={onDeleted} />;
    case 'dlp-rule-form-new':
      return <DlpRuleForm onSaved={onRuleSaved} onCancel={onCancel} />;
    case 'dlp-rule-form-edit':
      return <DlpRuleFormWithData ruleName={tab.itemId} onSaved={onRuleSaved} onCancel={onCancel} onDeleted={onDeleted} />;
    default:
      return <div className="p-6 text-gray-500">Unknown tab type</div>;
  }
}

function DlpPolicyFormWithData({ policyName, onSaved, onCancel, onDeleted }: { policyName: string; onSaved: (name: string) => void; onCancel: () => void; onDeleted: () => void }) {
  const { invoke } = usePowerShell();
  const [policy, setPolicy] = React.useState<DlpPolicy | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    invoke<DlpPolicy>(`Get-SLDlpPolicy -Identity '${esc(policyName)}'`).then((r) => {
      if (r.success && r.data) setPolicy(r.data);
      setLoading(false);
    });
  }, [policyName, invoke]);

  if (loading) return <div className="p-6"><div className="h-32 bg-gray-800 rounded animate-pulse" /></div>;
  return <DlpPolicyForm existing={policy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />;
}

function DlpRuleFormWithData({ ruleName, onSaved, onCancel, onDeleted }: { ruleName: string; onSaved: (name: string) => void; onCancel: () => void; onDeleted: () => void }) {
  const { invoke } = usePowerShell();
  const [rule, setRule] = React.useState<DlpRule | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    invoke<DlpRule>(`Get-SLDlpRule -Identity '${esc(ruleName)}'`).then((r) => {
      if (r.success && r.data) setRule(r.data);
      setLoading(false);
    });
  }, [ruleName, invoke]);

  if (loading) return <div className="p-6"><div className="h-32 bg-gray-800 rounded animate-pulse" /></div>;
  return <DlpRuleForm existing={rule} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />;
}

function EmptyWorkspace({
  tabCount,
  onSwitchSection,
  onNewPolicy,
  onNewRule,
}: {
  tabCount: number;
  onSwitchSection: (s: BrowserSection) => void;
  onNewPolicy: () => void;
  onNewRule: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-lg">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">
          {tabCount === 0 ? 'Select an item or create new' : 'No tab selected'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Browse DLP policies, rules, and sensitive information types in the left panel.
          Open multiple items as tabs for side-by-side reference.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <QuickLink label="Policies" description="DLP compliance policies" color="red" onClick={() => onSwitchSection('policies')} />
          <QuickLink label="Rules" description="Detection & actions" color="orange" onClick={() => onSwitchSection('rules')} />
          <QuickLink label="Info Types" description="Sensitive data patterns" color="yellow" onClick={() => onSwitchSection('sit')} />
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onNewPolicy}
            className="px-4 py-2 text-xs text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors"
          >
            + New DLP Policy
          </button>
          <button
            onClick={onNewRule}
            className="px-4 py-2 text-xs text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded transition-colors"
          >
            + New DLP Rule
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-600 space-y-1">
          <p>Tip: Items open as tabs — keep multiple open at once.</p>
          <p>Policies and rules have Edit and Delete. Info types are read-only.</p>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ label, description, color, onClick }: { label: string; description: string; color: string; onClick: () => void }) {
  const bg = color === 'red' ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
    : color === 'orange' ? 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20'
    : 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20';

  return (
    <button onClick={onClick} className={`p-3 rounded-lg border transition-colors text-left ${bg}`}>
      <div className="text-sm font-medium text-gray-200">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{description}</div>
    </button>
  );
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}
