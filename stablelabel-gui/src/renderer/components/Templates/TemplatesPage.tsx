import React, { useState, useEffect } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface DeployResult {
  TemplateName: string;
  Type: string;
  ItemsCreated: number;
  Results: unknown[];
}

interface TemplateData {
  Name: string;
  Description: string;
  Type: string;
  SensitiveInfoTypes?: string[];
  Labels?: string[];
}

/** Hardcoded fallback templates used when Get-SLTemplate is unavailable */
const fallbackTemplates: TemplateData[] = [
  {
    Name: 'Standard-Labels',
    Description: 'Basic sensitivity label hierarchy: Public, Internal, Confidential, Highly Confidential with sublabels',
    Type: 'Labels',
    Labels: ['Public', 'Internal', 'Confidential', 'Confidential\\All Employees', 'Highly Confidential', 'Highly Confidential\\All Employees'],
  },
  {
    Name: 'Healthcare-HIPAA',
    Description: 'HIPAA compliance rules detecting protected health information in documents and emails',
    Type: 'DLP',
    SensitiveInfoTypes: ['U.S. Social Security Number', 'Drug Enforcement Agency Number', 'U.S. Health Insurance Claim Number'],
  },
  {
    Name: 'PCI-DSS',
    Description: 'PCI-DSS rules detecting credit card numbers, bank accounts, and routing numbers',
    Type: 'DLP',
    SensitiveInfoTypes: ['Credit Card Number', 'U.S. Bank Account Number', 'ABA Routing Number'],
  },
  {
    Name: 'PII-Protection',
    Description: 'Detect and protect personal identifiers including SSNs, driver licenses, and passport numbers',
    Type: 'DLP',
    SensitiveInfoTypes: ['U.S. Social Security Number', "U.S. Driver's License Number", 'U.S. Passport Number'],
  },
  {
    Name: 'GDPR-DLP',
    Description: 'EU personal data protection rules covering national IDs, passports, and tax identifiers',
    Type: 'DLP',
    SensitiveInfoTypes: ['EU National Identification Number', 'EU Passport Number', 'EU Tax Identification Number'],
  },
];

const typeColorMap: Record<string, string> = {
  DLP: 'red',
  Labels: 'green',
};

const colorMap: Record<string, { card: string; badge: string; accent: string; btn: string }> = {
  red:    { card: 'border-red-500/20 hover:border-red-500/40', badge: 'bg-red-500/10 text-red-400', accent: 'text-red-400', btn: 'bg-red-600 hover:bg-red-500' },
  green:  { card: 'border-green-500/20 hover:border-green-500/40', badge: 'bg-green-500/10 text-green-400', accent: 'text-green-400', btn: 'bg-green-600 hover:bg-green-500' },
  amber:  { card: 'border-amber-500/20 hover:border-amber-500/40', badge: 'bg-amber-500/10 text-amber-400', accent: 'text-amber-400', btn: 'bg-amber-600 hover:bg-amber-500' },
  blue:   { card: 'border-blue-500/20 hover:border-blue-500/40', badge: 'bg-blue-500/10 text-blue-400', accent: 'text-blue-400', btn: 'bg-blue-600 hover:bg-blue-500' },
  purple: { card: 'border-purple-500/20 hover:border-purple-500/40', badge: 'bg-purple-500/10 text-purple-400', accent: 'text-purple-400', btn: 'bg-purple-600 hover:bg-purple-500' },
};

function getColor(t: TemplateData) {
  return typeColorMap[t.Type] ?? 'blue';
}

export default function TemplatesPage() {
  const { invoke } = usePowerShell();
  const [templates, setTemplates] = useState<TemplateData[]>(fallbackTemplates);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [dryRunning, setDryRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { result?: DeployResult; error?: string; isDryRun: boolean }>>({});

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const r = await invoke<TemplateData[]>('Get-SLTemplate');
      if (r.success && Array.isArray(r.data) && r.data.length > 0) {
        setTemplates(r.data);
      }
      // On failure, keep fallback templates
    } catch {
      // Keep fallback templates
    }
    setLoadingTemplates(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleDeploy = async (name: string, dryRun: boolean) => {
    if (dryRun) setDryRunning(name); else setDeploying(name);
    try {
      const cmd = dryRun
        ? `Deploy-SLTemplate -Name '${esc(name)}' -DryRun`
        : `Deploy-SLTemplate -Name '${esc(name)}' -Confirm:$false`;
      const r = await invoke<DeployResult>(cmd);
      if (r.success && r.data) {
        setResults(prev => ({ ...prev, [name]: { result: r.data!, isDryRun: dryRun } }));
      } else {
        setResults(prev => ({ ...prev, [name]: { error: r.error ?? 'Deployment failed', isDryRun: dryRun } }));
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [name]: { error: e instanceof Error ? e.message : 'Failed', isDryRun: dryRun } }));
    }
    setDeploying(null); setDryRunning(null);
  };

  const active = templates.find(t => t.Name === selected);
  const items = active?.SensitiveInfoTypes ?? active?.Labels ?? [];

  return (
    <div className="flex h-full">
      {/* Left: template cards */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Classification Templates</h2>
          <p className="text-[10px] text-gray-500 mt-1">Content-based classification policies for compliance. Select a template to preview and deploy.</p>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {loadingTemplates ? (
            [1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-800 rounded-lg animate-pulse" />)
          ) : (
            templates.map((t) => {
              const color = getColor(t);
              const c = colorMap[color] ?? colorMap.blue;
              const isSelected = selected === t.Name;
              const res = results[t.Name];
              return (
                <button
                  key={t.Name}
                  onClick={() => setSelected(t.Name)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${isSelected ? `${c.card} bg-gray-800/50` : 'border-gray-800 hover:border-gray-700 bg-gray-900'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${isSelected ? c.accent : 'text-gray-200'}`}>{t.Name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.badge}`}>{t.Type}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{t.Description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600">
                    <span>{items.length > 0 && isSelected ? `${items.length} items` : `${(t.SensitiveInfoTypes ?? t.Labels ?? []).length} items`}</span>
                    {res?.result && !res.isDryRun && (
                      <span className="text-green-400">Deployed</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="p-2 border-t border-gray-800">
          <button onClick={fetchTemplates} disabled={loadingTemplates} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors disabled:opacity-50">
            {loadingTemplates ? 'Loading...' : 'Refresh Templates'}
          </button>
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 overflow-auto">
        {!active ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-500 text-sm">Select a template to view details</p>
              <p className="text-gray-600 text-xs mt-1">{templates.length} compliance templates available</p>
            </div>
          </div>
        ) : (
          <TemplateDetail
            template={active}
            result={results[active.Name]}
            deploying={deploying === active.Name}
            dryRunning={dryRunning === active.Name}
            onDeploy={(dryRun) => handleDeploy(active.Name, dryRun)}
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
  template: TemplateData;
  result?: { result?: DeployResult; error?: string; isDryRun: boolean };
  deploying: boolean;
  dryRunning: boolean;
  onDeploy: (dryRun: boolean) => void;
}) {
  const color = getColor(template);
  const c = colorMap[color] ?? colorMap.blue;
  const isDlp = template.Type === 'DLP';
  const items = template.SensitiveInfoTypes ?? template.Labels ?? [];

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className={`text-xl font-bold ${c.accent}`}>{template.Name}</h2>
          <span className={`text-[10px] px-2 py-0.5 rounded ${c.badge}`}>{template.Type}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1.5">{template.Description}</p>
      </div>

      {/* What gets created */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What gets deployed</h4>

        {isDlp && (
          <div className="p-2.5 bg-gray-800 rounded">
            <div className="text-xs text-gray-400 mb-1">DLP Policy</div>
            <div className="text-sm text-gray-200">{template.Name}-Policy</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Exchange, SharePoint, OneDrive</div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-xs text-gray-400">{isDlp ? `DLP Rules (${items.length})` : `Labels (${items.length})`}</div>
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-gray-800 rounded">
              <div>
                <div className="text-sm text-gray-200">{isDlp ? `${template.Name}-${item.replace(/\s+/g, '-')}` : item}</div>
                {isDlp && <div className="text-[10px] text-gray-500">Detects: {item}</div>}
              </div>
              {isDlp && <span className="text-[10px] text-gray-600">minCount: 1</span>}
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
          className={`px-4 py-2 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 ${c.btn}`}
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

function esc(s: string) { return s.replace(/'/g, "''"); }
