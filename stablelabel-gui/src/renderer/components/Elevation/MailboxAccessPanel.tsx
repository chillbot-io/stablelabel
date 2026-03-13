import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';

export default function MailboxAccessPanel() {
  const { invoke } = usePowerShell();
  const [identity, setIdentity] = useState('');
  const [user, setUser] = useState('');
  const [accessRights, setAccessRights] = useState('FullAccess');
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState<'grant' | 'revoke' | null>(null);

  const validate = () => {
    if (!identity.trim()) { setMsg({ type: 'error', text: 'Mailbox identity is required.' }); return false; }
    if (!user.trim()) { setMsg({ type: 'error', text: 'User is required.' }); return false; }
    return true;
  };

  const handleAction = async (action: 'grant' | 'revoke') => {
    setShowConfirm(null);
    setLoading(true); setMsg(null);
    try {
      const cmdName = action === 'grant' ? 'Grant-SLMailboxAccess' : 'Revoke-SLMailboxAccess';
      const cmd = `${cmdName} -Identity '${esc(identity)}' -User '${esc(user)}' -AccessRights '${accessRights}'${dryRun ? ' -DryRun' : ''} -Confirm:$false`;
      const r = await invoke(cmd);
      if (r.success) setMsg({ type: 'success', text: dryRun ? `Dry run: would ${action} mailbox access.` : `Mailbox access ${action === 'grant' ? 'granted' : 'revoked'}.` });
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
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Mailbox Access</h3>
        <p className="text-xs text-gray-500">Grant or revoke Exchange mailbox permissions for compliance operations.</p>
      </div>

      <TextField label="Mailbox Identity" value={identity} onChange={setIdentity} placeholder="user@contoso.com or alias" required helpText="UPN or alias of the mailbox." />
      <TextField label="User" value={user} onChange={setUser} placeholder="admin@contoso.com" required helpText="UPN of the user to grant/revoke access." />

      <div>
        <label className="block text-xs text-gray-400 mb-1">Access Rights</label>
        <select value={accessRights} onChange={e => setAccessRights(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500">
          <option value="FullAccess">Full Access</option>
          <option value="ReadPermission">Read Permission</option>
        </select>
      </div>

      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the operation." />

      {msg && <div className={`p-2 rounded text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}

      <div className="flex gap-3">
        <button onClick={() => handleClick('grant')} disabled={loading} className="px-4 py-2 text-xs font-medium text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded transition-colors disabled:opacity-50">
          Grant Access
        </button>
        <button onClick={() => handleClick('revoke')} disabled={loading} className="px-4 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors disabled:opacity-50">
          Revoke Access
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title={`${showConfirm === 'grant' ? 'Grant' : 'Revoke'} Mailbox Access`}
          message={showConfirm === 'grant'
            ? `Grant ${accessRights} to "${user}" on mailbox "${identity}"?`
            : `Revoke ${accessRights} from "${user}" on mailbox "${identity}"?`}
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
