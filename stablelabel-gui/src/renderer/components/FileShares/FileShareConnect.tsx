import React, { useState, useEffect } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';
import type { FileShareConnection, FileShareDisconnectResult } from '../../lib/types';

export default function FileShareConnect() {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [driveLetter, setDriveLetter] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [connections, setConnections] = useState<FileShareConnection[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const fetchConnections = async () => {
    setLoadingList(true);
    try {
      const r = await invoke<FileShareConnection[]>('Get-SLFileShareLabel -Path "SL:ListConnections"');
      if (r.success && Array.isArray(r.data)) setConnections(r.data);
    } catch {
      // Connections list not available — that's okay
    }
    setLoadingList(false);
  };

  useEffect(() => { fetchConnections(); }, []);

  const handleConnect = async () => {
    if (!path.trim()) { setError('UNC path is required (e.g. \\\\server\\share).'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try {
      const parts = [`Connect-SLFileShare -Path '${esc(path)}'`];
      if (driveLetter.trim()) parts.push(`-DriveLetter '${esc(driveLetter)}'`);
      if (name.trim()) parts.push(`-Name '${esc(name)}'`);
      const r = await invoke<FileShareConnection>(parts.join(' '));
      if (r.success && r.data) {
        setSuccess(`Connected to ${r.data.Path} (${r.data.DriveLetter}:)`);
        fetchConnections();
        setPath(''); setDriveLetter(''); setName('');
      } else {
        setError(r.error ?? 'Failed to connect');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  const handleDisconnect = async (sharePath: string) => {
    setError(null); setSuccess(null);
    try {
      const r = await invoke<FileShareDisconnectResult>(`Disconnect-SLFileShare -Path '${esc(sharePath)}'`);
      if (r.success) {
        setSuccess(`Disconnected from ${sharePath}`);
        fetchConnections();
      } else {
        setError(r.error ?? 'Failed to disconnect');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  const handleDisconnectAll = async () => {
    setError(null); setSuccess(null);
    try {
      const r = await invoke<FileShareDisconnectResult>('Disconnect-SLFileShare -All');
      if (r.success && r.data) {
        setSuccess(`Disconnected ${r.data.Disconnected} share(s)`);
        fetchConnections();
      } else {
        setError(r.error ?? 'Failed to disconnect');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Connect to File Share</h3>
        <p className="text-xs text-gray-500">Mount a CIFS/SMB share for label operations.</p>
      </div>

      <div className="space-y-3">
        <TextField label="UNC Path" value={path} onChange={setPath} placeholder="\\\\server\\share" required />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Drive Letter" value={driveLetter} onChange={setDriveLetter} placeholder="Z" helpText="Optional. Auto-assigned if empty." />
          <TextField label="Friendly Name" value={name} onChange={setName} placeholder="e.g., Finance Share" helpText="Optional identifier." />
        </div>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}
      {success && <div className="p-3 bg-green-900/20 border border-green-800 rounded text-sm text-green-300">{success}</div>}

      <button onClick={handleConnect} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
        {loading ? 'Connecting...' : 'Connect'}
      </button>

      {/* Active connections */}
      <div className="pt-4 border-t border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Connections</h4>
          {connections.length > 0 && (
            <button onClick={handleDisconnectAll} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              Disconnect All
            </button>
          )}
        </div>

        {loadingList ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}
          </div>
        ) : connections.length === 0 ? (
          <p className="text-xs text-gray-500">No active connections.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-900 border border-gray-800 rounded">
                <div>
                  <div className="text-sm text-gray-200">{c.Name || c.Path}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.DriveLetter}: &middot; {c.Server}/{c.ShareName} &middot; {c.AuthType}
                  </div>
                </div>
                <button onClick={() => handleDisconnect(c.Path)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
