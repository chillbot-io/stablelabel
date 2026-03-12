import React, { useState, useCallback } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import TabBar, { type Tab } from '../common/TabBar';
import RetentionLabelList from './RetentionLabelList';
import RetentionLabelDetail from './RetentionLabelDetail';
import RetentionLabelForm from './RetentionLabelForm';
import RetentionPolicyList from './RetentionPolicyList';
import RetentionPolicyDetail from './RetentionPolicyDetail';
import RetentionPolicyForm from './RetentionPolicyForm';

type BrowserSection = 'labels' | 'policies';

interface OpenTab extends Tab {
  type: string;
  itemId: string;
}

let formCounter = 0;

export default function RetentionPage() {
  const { invoke } = usePowerShell();
  const [browserSection, setBrowserSection] = useState<BrowserSection>('labels');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback((type: string, itemId: string, label: string, kind: string) => {
    const tabId = `${type}:${itemId}`;
    setTabs(prev => {
      if (prev.find(t => t.id === tabId)) { setActiveTabId(tabId); return prev; }
      setActiveTabId(tabId);
      return [...prev, { id: tabId, label, kind, type, itemId }];
    });
    setActiveTabId(tabId);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next.length === 0 ? null : next[Math.min(idx, next.length - 1)].id);
      }
      return next;
    });
  }, [activeTabId]);

  // View
  const handleOpenLabel = useCallback((name: string) => openTab('ret-label-detail', name, name, 'retention'), [openTab]);
  const handleOpenPolicy = useCallback((name: string) => openTab('ret-policy-detail', name, name, 'retention'), [openTab]);

  // New
  const handleNewLabel = useCallback(() => { formCounter++; openTab('ret-label-form-new', `new-${formCounter}`, '+ New Label', 'retention'); }, [openTab]);
  const handleNewPolicy = useCallback(() => { formCounter++; openTab('ret-policy-form-new', `new-${formCounter}`, '+ New Policy', 'retention'); }, [openTab]);

  // Edit
  const handleEditLabel = useCallback((name: string) => openTab('ret-label-form-edit', name, `Edit: ${name}`, 'retention'), [openTab]);
  const handleEditPolicy = useCallback((name: string) => openTab('ret-policy-form-edit', name, `Edit: ${name}`, 'retention'), [openTab]);

  // After save/delete
  const handleLabelSaved = useCallback((name: string) => { if (activeTabId) closeTab(activeTabId); handleOpenLabel(name); }, [activeTabId, closeTab, handleOpenLabel]);
  const handlePolicySaved = useCallback((name: string) => { if (activeTabId) closeTab(activeTabId); handleOpenPolicy(name); }, [activeTabId, closeTab, handleOpenPolicy]);
  const handleDeleted = useCallback(() => { if (activeTabId) closeTab(activeTabId); }, [activeTabId, closeTab]);
  const handleCancel = useCallback(() => { if (activeTabId) closeTab(activeTabId); }, [activeTabId, closeTab]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;

  const renderContent = () => {
    if (!activeTab) return <EmptyWorkspace onSwitchSection={setBrowserSection} onNewLabel={handleNewLabel} onNewPolicy={handleNewPolicy} />;

    switch (activeTab.type) {
      case 'ret-label-detail':
        return <RetentionLabelDetail labelName={activeTab.itemId} onEdit={handleEditLabel} onDeleted={handleDeleted} />;
      case 'ret-policy-detail':
        return <RetentionPolicyDetail policyName={activeTab.itemId} onEdit={handleEditPolicy} onDeleted={handleDeleted} />;
      case 'ret-label-form-new':
        return <RetentionLabelForm onSaved={handleLabelSaved} onCancel={handleCancel} />;
      case 'ret-label-form-edit':
        return <FormWithData type="label" name={activeTab.itemId} invoke={invoke} onSaved={handleLabelSaved} onCancel={handleCancel} onDeleted={handleDeleted} />;
      case 'ret-policy-form-new':
        return <RetentionPolicyForm onSaved={handlePolicySaved} onCancel={handleCancel} />;
      case 'ret-policy-form-edit':
        return <FormWithData type="policy" name={activeTab.itemId} invoke={invoke} onSaved={handlePolicySaved} onCancel={handleCancel} onDeleted={handleDeleted} />;
      default:
        return <div className="p-6 text-gray-500">Unknown tab type</div>;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
        <div className="flex border-b border-gray-800">
          <button onClick={() => setBrowserSection('labels')} className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${browserSection === 'labels' ? 'border-amber-400 text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Labels</button>
          <button onClick={() => setBrowserSection('policies')} className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${browserSection === 'policies' ? 'border-amber-400 text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Policies</button>
        </div>
        <div className="flex-1 overflow-hidden">
          {browserSection === 'labels' && <RetentionLabelList onOpenLabel={handleOpenLabel} onNewLabel={handleNewLabel} />}
          {browserSection === 'policies' && <RetentionPolicyList onOpenPolicy={handleOpenPolicy} onNewPolicy={handleNewPolicy} />}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
        <div className="flex-1 overflow-auto">{renderContent()}</div>
      </div>
    </div>
  );
}

function FormWithData({ type, name, invoke, onSaved, onCancel, onDeleted }: {
  type: 'label' | 'policy';
  name: string;
  invoke: (cmd: string) => Promise<{ success: boolean; data: unknown; error?: string }>;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const cmd = type === 'label'
      ? `Get-SLRetentionLabel -Identity '${name}'`
      : `Get-SLRetentionPolicy -Identity '${name}'`;
    invoke(cmd).then(r => {
      if (r.success && r.data) setData(r.data as never);
      setLoading(false);
    });
  }, [name, type]);

  if (loading) return <div className="p-6"><div className="h-32 bg-gray-800 rounded animate-pulse" /></div>;

  return type === 'label'
    ? <RetentionLabelForm existing={data} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />
    : <RetentionPolicyForm existing={data} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />;
}

function EmptyWorkspace({ onSwitchSection, onNewLabel, onNewPolicy }: {
  onSwitchSection: (s: BrowserSection) => void;
  onNewLabel: () => void;
  onNewPolicy: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-lg">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Retention Management</h2>
        <p className="text-sm text-gray-500 mb-6">Browse retention labels and policies in the left panel, or create new ones.</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button onClick={() => onSwitchSection('labels')} className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 transition-colors text-left">
            <div className="text-sm font-medium text-gray-200">Labels</div>
            <div className="text-xs text-gray-500 mt-0.5">Duration, action, type</div>
          </button>
          <button onClick={() => onSwitchSection('policies')} className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 transition-colors text-left">
            <div className="text-sm font-medium text-gray-200">Policies</div>
            <div className="text-xs text-gray-500 mt-0.5">Location scoping</div>
          </button>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={onNewLabel} className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors">+ New Retention Label</button>
          <button onClick={onNewPolicy} className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors">+ New Retention Policy</button>
        </div>
      </div>
    </div>
  );
}
