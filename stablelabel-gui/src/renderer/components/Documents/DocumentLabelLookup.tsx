import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';
import type { DocumentLabelResult } from '../../lib/types';

export default function DocumentLabelLookup() {
  const { invoke } = usePowerShell();
  const [driveId, setDriveId] = useState('');
  const [itemId, setItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentLabelResult | null>(null);

  const handleLookup = async () => {
    if (!driveId.trim() || !itemId.trim()) { setError('Drive ID and Item ID are required.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await invoke<DocumentLabelResult>(`Get-SLDocumentLabel -DriveId '${esc(driveId)}' -ItemId '${esc(itemId)}'`);
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'No label data returned');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Look Up Document Label</h3>
        <p className="text-xs text-gray-500">Extract the current sensitivity label from a document via Graph API.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Drive ID" value={driveId} onChange={setDriveId} placeholder="b!abc123..." required />
        <TextField label="Item ID" value={itemId} onChange={setItemId} placeholder="01ABC123DEF..." required />
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      <button onClick={handleLookup} disabled={loading} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded transition-colors">
        {loading ? 'Looking up...' : 'Look Up Label'}
      </button>

      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Current Labels</h4>
          {result.labels && result.labels.length > 0 ? (
            <div className="space-y-2">
              {result.labels.map((label, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-gray-800 rounded">
                  <div>
                    <span className="text-sm text-gray-200 font-medium">{label.name ?? 'Unnamed'}</span>
                    {label.description && <p className="text-xs text-gray-500 mt-0.5">{label.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {label.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: label.color }} />}
                    {label.assignmentMethod && <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">{label.assignmentMethod}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No sensitivity label applied to this document.</p>
          )}
          <RawJson data={result} />
        </div>
      )}
    </div>
  );
}

function RawJson({ data }: { data: unknown }) {
  const [o, setO] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-gray-800">
      <button onClick={() => setO(!o)} className="text-xs text-gray-500 hover:text-gray-300">{o ? '▾ Hide' : '▸ Show'} raw JSON</button>
      {o && <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-xs text-gray-400 overflow-auto max-h-48">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function esc(s: string) { return s.replace(/'/g, "''"); }
