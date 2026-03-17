import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, TextArea, NumberField, ToggleField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';

export default function PimRolePanel() {
  const { invoke } = usePowerShell();
  const [roleId, setRoleId] = useState('');
  const [justification, setJustification] = useState('');
  const [duration, setDuration] = useState(8);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleActivate = async () => {
    setShowConfirm(false);
    setLoading(true); setMsg(null);
    try {
      const r = await invoke('Request-SLPimRole', {
        RoleDefinitionId: roleId,
        Justification: justification,
        DurationHours: duration,
        DryRun: dryRun || undefined,
      });
      if (r.success) setMsg({ type: 'success', text: dryRun ? `Dry run: would activate role for ${duration}h.` : `PIM role activated for ${duration} hours.` });
      else setMsg({ type: 'error', text: r.error ?? 'Failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  const handleClick = () => {
    if (!roleId.trim()) { setMsg({ type: 'error', text: 'Role Definition ID is required.' }); return; }
    if (!justification.trim()) { setMsg({ type: 'error', text: 'Justification is required.' }); return; }
    if (dryRun) { handleActivate(); return; }
    setShowConfirm(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">PIM Role Activation</h3>
        <p className="text-xs text-zinc-500">Activate an eligible Entra ID role via Privileged Identity Management.</p>
      </div>

      <TextField label="Role Definition ID" value={roleId} onChange={setRoleId} placeholder="GUID of the role to activate..." required helpText="The Entra ID role definition GUID." />
      <TextArea label="Justification" value={justification} onChange={setJustification} placeholder="Reason for activating this role..." />
      <NumberField label="Duration (hours)" value={duration} onChange={setDuration} min={1} max={24} helpText="1–24 hours. Default is 8." />
      <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate the activation." />

      <div className="bg-white/[0.03] rounded-lg p-3">
        <h4 className="text-xs text-zinc-500 mb-2">Common Role IDs</h4>
        <div className="space-y-1 text-xs">
          <RoleHint label="Global Administrator" id="62e90394-69f5-4237-9190-012177145e10" onSelect={setRoleId} />
          <RoleHint label="Security Administrator" id="194ae4cb-b126-40b2-bd5b-6091b380977d" onSelect={setRoleId} />
          <RoleHint label="Compliance Administrator" id="17315797-102d-40b4-93e0-432062caca18" onSelect={setRoleId} />
          <RoleHint label="Exchange Administrator" id="29232cdf-9323-42fd-ade2-1d097af3e4de" onSelect={setRoleId} />
          <RoleHint label="SharePoint Administrator" id="f28a1f50-f6e7-4571-818b-6a12f2af6b6c" onSelect={setRoleId} />
        </div>
      </div>

      {msg && <div className={`p-2 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}

      <button onClick={handleClick} disabled={loading} className="px-4 py-2 text-xs font-medium text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-colors disabled:opacity-40">
        {loading ? 'Activating...' : dryRun ? 'Dry Run — Activate Role' : 'Activate Role'}
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Activate PIM Role"
          message={`Activate role "${roleId}" for ${duration} hours? This grants elevated privileges.`}
          confirmLabel="Activate"
          variant="danger"
          loading={loading}
          onConfirm={handleActivate}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

function RoleHint({ label, id, onSelect }: { label: string; id: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 bg-white/[0.06] rounded-lg">
      <span className="text-zinc-300">{label}</span>
      <button onClick={() => onSelect(id)} className="text-blue-400 hover:text-blue-300 font-mono text-[10px]">{id}</button>
    </div>
  );
}

