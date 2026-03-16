import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface DeployResult {
  TemplateName: string;
  Type: string;
  ItemsCreated: number;
  Results: unknown[];
}

const templates = [
  {
    id: 'Healthcare-HIPAA',
    name: 'PHI',
    title: 'Protected Health Information',
    description: 'HIPAA compliance rules detecting protected health information in documents and emails.',
    type: 'DLP',
    infoTypes: ['U.S. Social Security Number', 'Drug Enforcement Agency Number', 'U.S. Health Insurance Claim Number'],
    color: 'red',
  },
  {
    id: 'PCI-DSS',
    name: 'PCI',
    title: 'Payment Card Industry',
    description: 'PCI-DSS rules detecting credit card numbers, magnetic stripe data, and cardholder information.',
    type: 'DLP',
    infoTypes: ['Credit Card Number', 'U.S. Bank Account Number', 'ABA Routing Number'],
    color: 'amber',
  },
  {
    id: 'PII-Protection',
    name: 'PII',
    title: 'Personally Identifiable Information',
    description: 'Detect and protect personal identifiers including SSNs, driver licenses, and passport numbers.',
    type: 'DLP',
    infoTypes: ['U.S. Social Security Number', 'U.S. Driver\'s License Number', 'U.S. Passport Number'],
    color: 'blue',
  },
  {
    id: 'GDPR-DLP',
    name: 'GDPR',
    title: 'General Data Protection Regulation',
    description: 'EU personal data protection rules covering national IDs, passports, and tax identifiers.',
    type: 'DLP',
    infoTypes: ['EU National Identification Number', 'EU Passport Number', 'EU Tax Identification Number'],
    color: 'purple',
  },
] as const;

type TemplateId = typeof templates[number]['id'];

const colorMap: Record<string, { card: string; badge: string; accent: string; glow: string }> = {
  red:    { card: 'border-red-500/20 hover:border-red-500/40', badge: 'bg-red-500/10 text-red-400', accent: 'text-red-400', glow: 'bg-red-500' },
  amber:  { card: 'border-amber-500/20 hover:border-amber-500/40', badge: 'bg-amber-500/10 text-amber-400', accent: 'text-amber-400', glow: 'bg-amber-500' },
  blue:   { card: 'border-blue-500/20 hover:border-blue-500/40', badge: 'bg-blue-500/10 text-blue-400', accent: 'text-blue-400', glow: 'bg-blue-500' },
  purple: { card: 'border-purple-500/20 hover:border-purple-500/40', badge: 'bg-purple-500/10 text-purple-400', accent: 'text-purple-400', glow: 'bg-purple-500' },
};

export default function TemplatesPage() {
  const { invoke } = usePowerShell();
  const [selected, setSelected] = useState<TemplateId | null>(null);
  const [deploying, setDeploying] = useState<TemplateId | null>(null);
  const [dryRunning, setDryRunning] = useState<TemplateId | null>(null);
  const [results, setResults] = useState<Record<string, { result?: DeployResult; error?: string; isDryRun: boolean }>>({});

  const handleDeploy = async (id: TemplateId, dryRun: boolean) => {
    if (dryRun) setDryRunning(id); else setDeploying(id);
    try {
      const cmd = dryRun
        ? `Deploy-SLTemplate -Name '${id}' -DryRun`
        : `Deploy-SLTemplate -Name '${id}' -Confirm:$false`;
      const r = await invoke<DeployResult>(cmd);
      if (r.success && r.data) {
        setResults(prev => ({ ...prev, [id]: { result: r.data!, isDryRun: dryRun } }));
      } else {
        setResults(prev => ({ ...prev, [id]: { error: r.error ?? 'Deployment failed', isDryRun: dryRun } }));
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [id]: { error: e instanceof Error ? e.message : 'Failed', isDryRun: dryRun } }));
    }
    setDeploying(null); setDryRunning(null);
  };

  const active = templates.find(t => t.id === selected);

  return (
    <div className="flex h-full">
      {/* Left: template cards */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Classification Templates</h2>
          <p className="text-[10px] text-gray-500 mt-1">Content-based classification policies for compliance. Select a template to preview and deploy.</p>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {templates.map((t) => {
            const c = colorMap[t.color];
            const isSelected = selected === t.id;
            const res = results[t.id];
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${isSelected ? `${c.card} bg-gray-800/50` : `border-gray-800 hover:border-gray-700 bg-gray-900`}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${isSelected ? c.accent : 'text-gray-200'}`}>{t.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.badge}`}>{t.type}</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{t.title}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600">
                  <span>{t.infoTypes.length} sensitive info types</span>
                  {res?.result && !res.isDryRun && (
                    <span className="text-green-400">Deployed</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 overflow-auto">
        {!active ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-500 text-sm">Select a template to view details</p>
              <p className="text-gray-600 text-xs mt-1">4 compliance frameworks available</p>
            </div>
          </div>
        ) : (
          <TemplateDetail
            template={active}
            result={results[active.id]}
            deploying={deploying === active.id}
            dryRunning={dryRunning === active.id}
            onDeploy={(dryRun) => handleDeploy(active.id, dryRun)}
          />
        )}
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  result,
  deploying,
  dryRunning,
  onDeploy,
}: {
  template: typeof templates[number];
  result?: { result?: DeployResult; error?: string; isDryRun: boolean };
  deploying: boolean;
  dryRunning: boolean;
  onDeploy: (dryRun: boolean) => void;
}) {
  const c = colorMap[template.color];

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className={`text-xl font-bold ${c.accent}`}>{template.name}</h2>
          <span className={`text-[10px] px-2 py-0.5 rounded ${c.badge}`}>{template.type}</span>
        </div>
        <h3 className="text-sm text-gray-300">{template.title}</h3>
        <p className="text-xs text-gray-500 mt-1.5">{template.description}</p>
      </div>

      {/* What gets created */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What gets deployed</h4>

        <div className="p-2.5 bg-gray-800 rounded">
          <div className="text-xs text-gray-400 mb-1">DLP Policy</div>
          <div className="text-sm text-gray-200">{template.id}-Policy</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Exchange, SharePoint, OneDrive</div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-gray-400">DLP Rules ({template.infoTypes.length})</div>
          {template.infoTypes.map((sit, i) => (
            <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-gray-800 rounded">
              <div>
                <div className="text-sm text-gray-200">{template.id}-{sit.replace(/\s+/g, '-')}</div>
                <div className="text-[10px] text-gray-500">Detects: {sit}</div>
              </div>
              <span className="text-[10px] text-gray-600">minCount: 1</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onDeploy(true)}
          disabled={dryRunning || deploying}
          className="px-4 py-2 text-xs font-medium text-gray-200 bg-gray-800 border border-gray-700 hover:border-gray-600 disabled:opacity-50 rounded transition-colors"
        >
          {dryRunning ? 'Simulating...' : 'Dry Run'}
        </button>
        <button
          onClick={() => onDeploy(false)}
          disabled={deploying || dryRunning}
          className={`px-4 py-2 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 ${template.color === 'red' ? 'bg-red-600 hover:bg-red-500' : template.color === 'amber' ? 'bg-amber-600 hover:bg-amber-500' : template.color === 'blue' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'}`}
        >
          {deploying ? 'Deploying...' : 'Deploy'}
        </button>
      </div>

      {/* Result */}
      {result?.error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{result.error}</div>
      )}

      {result?.result && (
        <div className={`p-4 rounded-lg border ${result.isDryRun ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-medium ${result.isDryRun ? 'text-yellow-400' : 'text-green-400'}`}>
              {result.isDryRun ? 'Dry Run Complete' : 'Deployed Successfully'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-[10px] text-gray-500">Template</dt>
              <dd className="text-sm text-gray-200">{result.result.TemplateName}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-gray-500">Type</dt>
              <dd className="text-sm text-gray-200">{result.result.Type}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-gray-500">Items Created</dt>
              <dd className="text-sm text-gray-200">{result.result.ItemsCreated}</dd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
