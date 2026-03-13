import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';

interface LogEntry {
  [key: string]: unknown;
}

export default function ProtectionLogs() {
  const { invoke } = usePowerShell();
  const [userEmail, setUserEmail] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  const handleSearch = async () => {
    setLoading(true); setError(null); setEntries(null);
    try {
      const parts = ['Get-SLProtectionLog'];
      if (userEmail.trim()) parts.push(`-UserEmail '${esc(userEmail)}'`);
      if (fromTime.trim()) parts.push(`-FromTime '${esc(fromTime)}'`);
      if (toTime.trim()) parts.push(`-ToTime '${esc(toTime)}'`);

      const r = await invoke<LogEntry[]>(parts.join(' '));
      if (r.success) setEntries(Array.isArray(r.data) ? r.data : r.data ? [r.data as unknown as LogEntry] : []);
      else setError(r.error ?? 'Failed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Protection Logs</h3>
        <p className="text-xs text-gray-500">AIP protection tracking logs — view who accessed protected content.</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <TextField label="User Email" value={userEmail} onChange={setUserEmail} placeholder="user@contoso.com" helpText="Optional — filter by user." />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="From Time" value={fromTime} onChange={setFromTime} placeholder="2024-01-01" helpText="Start date (yyyy-MM-dd)" />
          <TextField label="To Time" value={toTime} onChange={setToTime} placeholder="2024-12-31" helpText="End date (yyyy-MM-dd)" />
        </div>
        {error && <div className="p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">{error}</div>}
        <button onClick={handleSearch} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
          {loading ? 'Searching...' : 'Search Logs'}
        </button>
      </div>

      {entries && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{entries.length} Log {entries.length === 1 ? 'Entry' : 'Entries'}</h4>
          {entries.length === 0 ? (
            <p className="text-xs text-gray-500">No log entries match your search criteria.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {entries.map((entry, i) => (
                <LogEntryCard key={i} entry={entry} />
              ))}
            </div>
          )}
          <RawJson data={entries} />
        </div>
      )}
    </div>
  );
}

function LogEntryCard({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const email = entry.RequesterEmail ?? entry.UserEmail ?? entry.Email;
  const action = entry.Operation ?? entry.Action ?? entry.ActivityType;
  const time = entry.DateTime ?? entry.CreatedTime ?? entry.Timestamp;
  const contentName = entry.ContentName ?? entry.FileName ?? entry.ObjectId;

  return (
    <div className="p-3 bg-gray-800 rounded">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {action && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">{String(action)}</span>}
          <span className="text-sm text-gray-200">{contentName ? String(contentName) : 'Unknown'}</span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-500 hover:text-gray-300">{expanded ? '▾' : '▸'}</button>
      </div>
      <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
        {email && <span>{String(email)}</span>}
        {time && <span>{String(time)}</span>}
      </div>
      {expanded && <pre className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-400 overflow-auto max-h-32">{JSON.stringify(entry, null, 2)}</pre>}
    </div>
  );
}

function RawJson({ data }: { data: unknown }) {
  const [o, setO] = useState(false);
  return (
    <div className="border-t border-gray-800 pt-3">
      <button onClick={() => setO(!o)} className="text-xs text-gray-500 hover:text-gray-300">{o ? '▾ Hide' : '▸ Show'} all raw JSON</button>
      {o && <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400 overflow-auto max-h-64">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
