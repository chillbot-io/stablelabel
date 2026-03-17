import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';
import type { DocumentTrackEntry } from '../../lib/types';

export default function DocumentTracking() {
  const { invoke } = usePowerShell();
  const [userEmail, setUserEmail] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DocumentTrackEntry[] | null>(null);

  const handleSearch = async () => {
    setLoading(true); setError(null); setEntries(null);
    try {
      const r = await invoke<DocumentTrackEntry[]>('Get-SLDocumentTrack', {
        UserEmail: userEmail.trim() || undefined,
        FromTime: fromTime.trim() || undefined,
        ToTime: toTime.trim() || undefined,
      });
      if (r.success) setEntries(Array.isArray(r.data) ? r.data : r.data ? [r.data as unknown as DocumentTrackEntry] : []);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Document Tracking</h3>
        <p className="text-xs text-zinc-500">Search AIP document tracking logs and manage document access.</p>
      </div>

      {/* Search form */}
      <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Search Tracking Logs</h4>
        <TextField label="User Email" value={userEmail} onChange={setUserEmail} placeholder="user@contoso.com" helpText="Optional — filter by document owner/issuer." />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="From Time" value={fromTime} onChange={setFromTime} placeholder="2024-01-01" helpText="Start date (yyyy-MM-dd)" />
          <TextField label="To Time" value={toTime} onChange={setToTime} placeholder="2024-12-31" helpText="End date (yyyy-MM-dd)" />
        </div>
        {error && <div className="p-2 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>}
        <button onClick={handleSearch} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
          {loading ? 'Searching...' : 'Search Logs'}
        </button>
      </div>

      {/* Results */}
      {entries && (
        <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{entries.length} {entries.length === 1 ? 'Entry' : 'Entries'} Found</h4>
          {entries.length === 0 ? (
            <p className="text-xs text-zinc-500">No tracking entries match your search criteria.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {entries.map((entry, i) => (
                <div key={i} className="p-3 bg-white/[0.06] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-200">{entry.ContentName ?? 'Unnamed document'}</span>
                    {entry.ContentId && <span className="text-[10px] text-zinc-500 font-mono">{entry.ContentId}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    {entry.Issuer && <span>Issuer: {entry.Issuer}</span>}
                    {entry.Owner && <span>Owner: {entry.Owner}</span>}
                    {entry.CreatedTime && <span>Created: {entry.CreatedTime}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <RawJson data={entries} />
        </div>
      )}

      {/* Revoke / Restore actions */}
      <div className="grid grid-cols-2 gap-3">
        <RevokeAccess />
        <RestoreAccess />
      </div>
    </div>
  );
}

function RevokeAccess() {
  const { invoke } = usePowerShell();
  const [contentId, setContentId] = useState('');
  const [issuerEmail, setIssuerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRevoke = async () => {
    setShowConfirm(false);
    setLoading(true); setMsg(null);
    try {
      const r = await invoke('Revoke-SLDocumentAccess', { ContentId: contentId, IssuerEmail: issuerEmail });
      if (r.success) setMsg({ type: 'success', text: 'Document access revoked.' });
      else setMsg({ type: 'error', text: r.error ?? 'Failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  const handleClick = () => {
    if (!contentId.trim() || !issuerEmail.trim()) { setMsg({ type: 'error', text: 'Content ID and Issuer Email are required.' }); return; }
    setShowConfirm(true);
  };

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-3">
      <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Revoke Access</h4>
      <TextField label="Content ID" value={contentId} onChange={setContentId} placeholder="Document content ID..." required />
      <TextField label="Issuer Email" value={issuerEmail} onChange={setIssuerEmail} placeholder="issuer@contoso.com" required />
      {msg && <div className={`p-2 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}
      <button onClick={handleClick} disabled={loading} className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors disabled:opacity-40">
        {loading ? 'Revoking...' : 'Revoke Access'}
      </button>
      {showConfirm && (
        <ConfirmDialog title="Revoke Document Access" message={`Revoke access to document "${contentId}"? Users will no longer be able to open this protected document.`} confirmLabel="Revoke" variant="danger" loading={loading} onConfirm={handleRevoke} onCancel={() => setShowConfirm(false)} />
      )}
    </div>
  );
}

function RestoreAccess() {
  const { invoke } = usePowerShell();
  const [contentId, setContentId] = useState('');
  const [issuerEmail, setIssuerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleRestore = async () => {
    if (!contentId.trim() || !issuerEmail.trim()) { setMsg({ type: 'error', text: 'Content ID and Issuer Email are required.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const r = await invoke('Restore-SLDocumentAccess', { ContentId: contentId, IssuerEmail: issuerEmail });
      if (r.success) setMsg({ type: 'success', text: 'Document access restored.' });
      else setMsg({ type: 'error', text: r.error ?? 'Failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  return (
    <div className="bg-emerald-400/5 border border-green-500/20 rounded-lg p-4 space-y-3">
      <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Restore Access</h4>
      <TextField label="Content ID" value={contentId} onChange={setContentId} placeholder="Document content ID..." required />
      <TextField label="Issuer Email" value={issuerEmail} onChange={setIssuerEmail} placeholder="issuer@contoso.com" required />
      {msg && <div className={`p-2 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}
      <button onClick={handleRestore} disabled={loading} className="px-3 py-1.5 text-xs text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 border border-green-500/20 rounded-lg transition-colors disabled:opacity-40">
        {loading ? 'Restoring...' : 'Restore Access'}
      </button>
    </div>
  );
}

function RawJson({ data }: { data: unknown }) {
  const [o, setO] = useState(false);
  return (
    <div className="border-t border-white/[0.06] pt-3">
      <button onClick={() => setO(!o)} className="text-xs text-zinc-500 hover:text-zinc-300">{o ? '▾ Hide' : '▸ Show'} raw JSON</button>
      {o && <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-48">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

