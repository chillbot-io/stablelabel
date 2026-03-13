import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';

export default function SiteAdminPanel() {
  const { invoke } = usePowerShell();
  const [siteUrl, setSiteUrl] = useState('');
  const [upn, setUpn] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState<'grant' | 'revoke' | null>(null);

  const validate = () => {
    if (!siteUrl.trim()) { setMsg({ type: 'error', text: 'Site URL is required.' }); return false; }
    if (!upn.trim()) { setMsg({ type: 'error', text: 'User Principal Name is required.' }); return false; }
    return true;
  };

  const handleAction = async (action: 'grant' | 'revoke') => {
    setShowConfirm(null);
    setLoading(true); setMsg(null);
    try {
      const cmd = action === 'grant'
        ? `Grant-SLSiteAdmin -SiteUrl '${esc(siteUrl)}' -UserPrincipalName '${esc(upn)}'${dryRun ? ' -DryRun' : ''} -Confirm:$false`
        : `Revoke-SLSiteAdmin -SiteUrl '${esc(siteUrl)}' -UserPrincipalName '${esc(upn)}'${dryRun ? ' -DryRun' : ''} -Confirm:$false`;
      const r = await invoke(cmd);
      if (r.success) setMsg({ type: 'success', text: dryRun ? `Dry run: would ${action} site admin.` : `Site admin ${action === 'grant' ? 'granted' : 'revoked'}.` });
      else setMsg({ type: 'error', text: r.error ?? 'Failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  const handleClick = (action: 'grant' | 'revoke') => {
    if (!validate()) return;
    if (dryRun) { handleAction(action); return; }
    setShowConfirm(action);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Site Collection Administrator</h3>
        <p className="text-xs text-gray-500">Grant or revoke temporary site collection admin rights via Graph API.</p>
      </div>

      <TextField label="Site URL" value={siteUrl} onChange={setSiteUrl} placeholder="https://contoso.sharepoint.com/sites/hr" required />
      <TextField label="User Principal Name" value={upn} onChange={setUpn} placeholder="admin@contoso.com" required />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation." />

      {msg && <div className={`p-2 rounded text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}

      <div className="flex gap-3">
        <button onClick={() => handleClick('grant')} disabled={loading} className="px-4 py-2 text-xs font-medium text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded transition-colors disabled:opacity-50">
          Grant Admin
        </button>
        <button onClick={() => handleClick('revoke')} disabled={loading} className="px-4 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors disabled:opacity-50">
          Revoke Admin
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title={`${showConfirm === 'grant' ? 'Grant' : 'Revoke'} Site Admin`}
          message={showConfirm === 'grant'
            ? `Grant site collection admin rights to "${upn}" on "${siteUrl}"?`
            : `Revoke site collection admin rights from "${upn}" on "${siteUrl}"?`}
          confirmLabel={showConfirm === 'grant' ? 'Grant' : 'Revoke'}
          variant={showConfirm === 'revoke' ? 'danger' : 'default'}
          loading={loading}
          onConfirm={() => handleAction(showConfirm)}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
