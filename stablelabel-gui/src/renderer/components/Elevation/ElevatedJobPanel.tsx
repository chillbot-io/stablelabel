import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField, ToggleField, TagInput } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';

export default function ElevatedJobPanel() {
  return (
    <div className="space-y-6">
      <StartJob />
      <StopJob />
    </div>
  );
}

function StartJob() {
  const { invoke } = usePowerShell();
  const [upn, setUpn] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [siteUrls, setSiteUrls] = useState<string[]>([]);
  const [fileSharePaths, setFileSharePaths] = useState<string[]>([]);
  const [skipSuperUser, setSkipSuperUser] = useState(false);
  const [skipSiteAdmin, setSkipSiteAdmin] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleStart = async () => {
    setShowConfirm(false);
    setLoading(true); setMsg(null);
    try {
      const parts = [`Start-SLElevatedJob -UserPrincipalName '${esc(upn)}'`];
      if (tenantId.trim()) parts.push(`-TenantId '${esc(tenantId)}'`);
      if (siteUrls.length > 0) parts.push(`-SiteUrls ${siteUrls.map(u => `'${esc(u)}'`).join(',')}`);
      if (fileSharePaths.length > 0) parts.push(`-FileSharePaths ${fileSharePaths.map(p => `'${esc(p)}'`).join(',')}`);
      if (skipSuperUser) parts.push('-SkipSuperUser');
      if (skipSiteAdmin) parts.push('-SkipSiteAdmin');
      if (dryRun) parts.push('-DryRun');
      parts.push('-Confirm:$false');

      const r = await invoke(parts.join(' '));
      if (r.success) setMsg({ type: 'success', text: dryRun ? 'Dry run complete — no elevations applied.' : 'Elevated job started successfully.' });
      else setMsg({ type: 'error', text: r.error ?? 'Failed to start job' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  const handleClick = () => {
    if (!upn.trim()) { setMsg({ type: 'error', text: 'User Principal Name is required.' }); return; }
    if (dryRun) { handleStart(); return; }
    setShowConfirm(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Start Elevated Job</h3>
        <p className="text-xs text-gray-500">Orchestrate multi-step privilege elevation: GA auth, super user, site admin, and file share mounting.</p>
      </div>

      <div className="bg-red-500/5 border border-red-500/20 rounded p-3">
        <p className="text-xs text-red-400">This operation grants significant privileges. Dry run is enabled by default. All elevations are tracked and can be torn down with Stop Job.</p>
      </div>

      <TextField label="GA Account (UPN)" value={upn} onChange={setUpn} placeholder="globaladmin@contoso.com" required helpText="Must have Global Admin + Security/Compliance Admin roles." />
      <TextField label="Tenant ID" value={tenantId} onChange={setTenantId} placeholder="Optional tenant GUID..." helpText="Optional — for multi-tenant scenarios." />

      <TagInput label="Site URLs" values={siteUrls} onChange={setSiteUrls} placeholder="https://contoso.sharepoint.com/sites/..." helpText="SharePoint sites to grant temporary admin access." />
      <TagInput label="File Share Paths" values={fileSharePaths} onChange={setFileSharePaths} placeholder="\\\\server\\share" helpText="UNC paths to CIFS/SMB file shares to mount." />

      <div className="grid grid-cols-3 gap-3">
        <ToggleField label="Skip Super User" checked={skipSuperUser} onChange={setSkipSuperUser} />
        <ToggleField label="Skip Site Admin" checked={skipSiteAdmin} onChange={setSkipSiteAdmin} />
        <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} />
      </div>

      {msg && <div className={`p-2 rounded text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}

      <button onClick={handleClick} disabled={loading} className="px-4 py-2 text-xs font-medium text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded transition-colors disabled:opacity-50">
        {loading ? 'Starting...' : dryRun ? 'Dry Run — Start Job' : 'Start Elevated Job'}
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Start Elevated Job"
          message={`Start elevated job as "${upn}"? This will grant GA auth, super user, and site admin privileges. All elevations are tracked for cleanup.`}
          confirmLabel="Start Job"
          variant="danger"
          loading={loading}
          onConfirm={handleStart}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

function StopJob() {
  const { invoke } = usePowerShell();
  const [jobId, setJobId] = useState('');
  const [reconnect, setReconnect] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleStop = async () => {
    setShowConfirm(false);
    setLoading(true); setMsg(null);
    try {
      const parts = ['Stop-SLElevatedJob -Force'];
      if (jobId.trim()) parts.push(`-JobId '${esc(jobId)}'`);
      if (reconnect) parts.push('-ReconnectOriginal');

      const r = await invoke(parts.join(' '));
      if (r.success) setMsg({ type: 'success', text: 'Elevated job stopped. All privileges cleaned up.' });
      else setMsg({ type: 'error', text: r.error ?? 'Failed to stop job' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Stop Elevated Job</h3>
        <p className="text-xs text-gray-500">Tear down all elevations in reverse order and restore normal access.</p>
      </div>

      <TextField label="Job ID" value={jobId} onChange={setJobId} placeholder="Leave blank for most recent job" helpText="Optional — defaults to the active or most recent job." />
      <ToggleField label="Reconnect Original Session" checked={reconnect} onChange={setReconnect} helpText="Reconnect to Graph with original StableLabel scopes after cleanup." />

      {msg && <div className={`p-2 rounded text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}

      <button onClick={() => setShowConfirm(true)} disabled={loading} className="px-4 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors disabled:opacity-50">
        {loading ? 'Stopping...' : 'Stop Job & Clean Up'}
      </button>

      {showConfirm && (
        <ConfirmDialog
          title="Stop Elevated Job"
          message="This will revoke all temporary privileges (site admin, super user, GA session) and clean up. Continue?"
          confirmLabel="Stop & Clean Up"
          variant="danger"
          loading={loading}
          onConfirm={handleStop}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
