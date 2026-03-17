import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { ToggleField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';

export default function SuperUserPanel() {
  const { invoke } = usePowerShell();
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState<'enable' | 'disable' | null>(null);

  const handleToggle = async (action: 'enable' | 'disable') => {
    setShowConfirm(null);
    setLoading(true); setMsg(null);
    try {
      const cmd = action === 'enable'
        ? `Enable-SLSuperUser${dryRun ? ' -DryRun' : ''} -Confirm:$false`
        : `Disable-SLSuperUser${dryRun ? ' -DryRun' : ''} -Confirm:$false`;
      const r = await invoke(cmd);
      if (r.success) setMsg({ type: 'success', text: dryRun ? `Dry run: would ${action} super user.` : `Super user ${action}d.` });
      else setMsg({ type: 'error', text: r.error ?? 'Failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Super User Feature</h3>
        <p className="text-xs text-zinc-500">Enable or disable the AIP super user feature. Super users can decrypt any RMS-protected content in the tenant.</p>
      </div>

      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
        <p className="text-xs text-yellow-400">Warning: Enabling super user grants the ability to decrypt all protected content. Use only when necessary and disable immediately after.</p>
      </div>

      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation." />

      {msg && <div className={`p-2 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}

      <div className="flex gap-3">
        <button onClick={() => dryRun ? handleToggle('enable') : setShowConfirm('enable')} disabled={loading} className="px-4 py-2 text-xs font-medium text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg transition-colors disabled:opacity-40">
          {loading ? 'Processing...' : 'Enable Super User'}
        </button>
        <button onClick={() => dryRun ? handleToggle('disable') : setShowConfirm('disable')} disabled={loading} className="px-4 py-2 text-xs font-medium text-zinc-300 bg-white/[0.08] hover:bg-zinc-600 rounded-lg transition-colors disabled:opacity-40">
          Disable Super User
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title={`${showConfirm === 'enable' ? 'Enable' : 'Disable'} Super User`}
          message={showConfirm === 'enable' ? 'Enabling super user allows decryption of all protected content. Are you sure?' : 'Disable the super user feature? Protected content will return to normal access controls.'}
          confirmLabel={showConfirm === 'enable' ? 'Enable' : 'Disable'}
          variant={showConfirm === 'enable' ? 'danger' : 'default'}
          loading={loading}
          onConfirm={() => handleToggle(showConfirm)}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}
