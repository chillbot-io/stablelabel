import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import type { ProtectionConfig, ProtectionAdmin } from '../../lib/types';

export default function ProtectionConfigPanel() {
  const { invoke } = usePowerShell();
  const [config, setConfig] = useState<ProtectionConfig | null>(null);
  const [admins, setAdmins] = useState<ProtectionAdmin[]>([]);
  const [keys, setKeys] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const [configR, adminsR, keysR] = await Promise.all([
          invoke<ProtectionConfig>('Get-SLProtectionConfig'),
          invoke<ProtectionAdmin[]>('Get-SLProtectionAdmin'),
          invoke<unknown[]>('Get-SLProtectionKey'),
        ]);
        if (configR.success && configR.data) setConfig(configR.data);
        else setError(configR.error ?? 'Failed to load config');
        if (adminsR.success && Array.isArray(adminsR.data)) setAdmins(adminsR.data);
        if (keysR.success && keysR.data) setKeys(Array.isArray(keysR.data) ? keysR.data : [keysR.data]);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-800 rounded animate-pulse" />)}</div>;
  if (error) return <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>;
  if (!config) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Service Configuration</h3>
        <p className="text-xs text-gray-500">Azure Information Protection service status and settings.</p>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard label="Functional State" value={config.FunctionalState ?? 'Unknown'} highlight={config.FunctionalState === 'Enabled'} />
        <StatusCard label="Super Users" value={config.SuperUsersEnabled ? 'Enabled' : 'Disabled'} highlight={config.SuperUsersEnabled} warn />
        <StatusCard label="Key Rollovers" value={String(config.KeyRolloverCount ?? 0)} />
      </div>

      {/* Service details */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Service Details</h4>
        <div className="grid grid-cols-2 gap-3">
          <InfoRow label="Tenant ID (BPOS)" value={config.BPOSId} mono />
          <InfoRow label="RMS Service ID" value={config.RightsManagementServiceId} mono />
          <InfoRow label="Provisioning Date" value={config.ProvisioningDate} />
          <InfoRow label="On-Premise Domain" value={config.OnPremiseDomainName} />
          <InfoRow label="Licensing (Intranet)" value={config.LicensingIntranetDistributionPointUrl} mono />
          <InfoRow label="Licensing (Extranet)" value={config.LicensingExtranetDistributionPointUrl} mono />
          <InfoRow label="Certification (Intranet)" value={config.CertificationIntranetDistributionPointUrl} mono />
          <InfoRow label="Certification (Extranet)" value={config.CertificationExtranetDistributionPointUrl} mono />
        </div>
      </div>

      {/* Super users */}
      {config.SuperUsers && config.SuperUsers.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3">Super Users ({config.SuperUsers.length})</h4>
          <div className="space-y-1">
            {config.SuperUsers.map((u, i) => (
              <div key={i} className="px-2.5 py-1.5 bg-gray-800 rounded text-xs text-gray-300 font-mono">{u}</div>
            ))}
          </div>
        </div>
      )}

      {/* Admins */}
      {admins.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Role-Based Administrators ({admins.length})</h4>
          <div className="space-y-1">
            {admins.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-gray-800 rounded">
                <span className="text-xs text-gray-300">{a.EmailAddress}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded">{a.Role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keys */}
      {keys && keys.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tenant Keys</h4>
          <RawJson data={keys} />
        </div>
      )}

      <RawJson data={config} label="Full config" />
    </div>
  );
}

function StatusCard({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  const color = highlight ? (warn ? 'text-yellow-400' : 'text-green-400') : 'text-gray-400';
  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-sm font-medium mt-0.5 ${color}`}>{value}</dd>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-sm text-gray-300 mt-0.5 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value ?? ''}>{value ?? 'N/A'}</dd>
    </div>
  );
}

function RawJson({ data, label }: { data: unknown; label?: string }) {
  const [o, setO] = useState(false);
  return (
    <div className="border-t border-gray-800 pt-3">
      <button onClick={() => setO(!o)} className="text-xs text-gray-500 hover:text-gray-300">{o ? '▾ Hide' : '▸ Show'} {label ?? 'raw JSON'}</button>
      {o && <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400 overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
