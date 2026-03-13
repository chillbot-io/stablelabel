import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';

interface Props { onCreated: (name: string) => void; }

export default function SnapshotCreate({ onCreated }: Props) {
  const { invoke } = usePowerShell();
  const [name, setName] = useState('');
  const [scope, setScope] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Snapshot name is required.'); return; }
    setLoading(true); setError(null);
    try {
      const r = await invoke(`New-SLSnapshot -Name '${esc(name)}' -Scope '${scope}' -Confirm:$false`);
      if (r.success) onCreated(name);
      else setError(r.error ?? 'Failed to create snapshot');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">New Snapshot</h2>
        <p className="text-sm text-gray-500 mt-1">Capture current tenant configuration for comparison or restore.</p>
      </div>

      <TextField label="Snapshot Name" value={name} onChange={setName} placeholder="e.g., pre-migration-2024" required />

      <div>
        <label className="block text-xs text-gray-400 mb-1">Scope</label>
        <select value={scope} onChange={e => setScope(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500">
          <option value="All">All (Labels + DLP + Retention)</option>
          <option value="Labels">Labels Only</option>
          <option value="Dlp">DLP Only</option>
          <option value="Retention">Retention Only</option>
        </select>
        <p className="text-[10px] text-gray-500 mt-1">What to capture. &quot;All&quot; requires both Graph and Compliance connections.</p>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      <button onClick={handleCreate} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
        {loading ? 'Capturing...' : 'Create Snapshot'}
      </button>
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
