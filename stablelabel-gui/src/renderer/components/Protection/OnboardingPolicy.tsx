import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField } from '../common/FormFields';

interface OnboardingConfig {
  UseRmsUserLicense: boolean;
  SecurityGroupObjectId: string | null;
  Scope: string | null;
}

export default function OnboardingPolicy() {
  const { invoke } = usePowerShell();
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [useRmsUserLicense, setUseRmsUserLicense] = useState(false);
  const [securityGroupId, setSecurityGroupId] = useState('');
  const [scope, setScope] = useState('All');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    invoke<OnboardingConfig>('Get-SLOnboardingPolicy').then(r => {
      if (r.success && r.data) {
        setConfig(r.data);
        setUseRmsUserLicense(r.data.UseRmsUserLicense ?? false);
        setSecurityGroupId(r.data.SecurityGroupObjectId ?? '');
        setScope(r.data.Scope ?? 'All');
      } else {
        setError(r.error ?? 'Failed to load onboarding policy');
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const parts = ['Set-SLOnboardingPolicy'];
      parts.push(`-UseRmsUserLicense $${useRmsUserLicense}`);
      parts.push(`-Scope '${scope}'`);
      if (scope === 'SecurityGroup' && securityGroupId.trim()) {
        parts.push(`-SecurityGroupObjectId '${esc(securityGroupId)}'`);
      }
      parts.push('-Confirm:$false');

      const r = await invoke(parts.join(' '));
      if (r.success) setSaveMsg({ type: 'success', text: 'Onboarding policy updated.' });
      else setSaveMsg({ type: 'error', text: r.error ?? 'Failed' });
    } catch (e) { setSaveMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setSaving(false);
  };

  if (loading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Onboarding Control Policy</h3>
        <p className="text-xs text-gray-500">Control which users can use Azure Information Protection in your tenant.</p>
      </div>

      <ToggleField label="Use RMS User License" checked={useRmsUserLicense} onChange={setUseRmsUserLicense} helpText="Require users to have an RMS license before they can protect content." />

      <div>
        <label className="block text-xs text-gray-400 mb-1">Scope</label>
        <select value={scope} onChange={e => setScope(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500">
          <option value="All">All Users</option>
          <option value="SecurityGroup">Security Group Only</option>
        </select>
      </div>

      {scope === 'SecurityGroup' && (
        <TextField label="Security Group Object ID" value={securityGroupId} onChange={setSecurityGroupId} placeholder="GUID of the security group..." required helpText="Only members of this group can use AIP." />
      )}

      {saveMsg && <div className={`p-2 rounded text-xs ${saveMsg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{saveMsg.text}</div>}

      <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      {config && (
        <div className="border-t border-gray-800 pt-3">
          <RawJson data={config} />
        </div>
      )}
    </div>
  );
}

function RawJson({ data }: { data: unknown }) {
  const [o, setO] = useState(false);
  return (
    <div>
      <button onClick={() => setO(!o)} className="text-xs text-gray-500 hover:text-gray-300">{o ? '▾ Hide' : '▸ Show'} raw JSON</button>
      {o && <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400 overflow-auto max-h-48">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
