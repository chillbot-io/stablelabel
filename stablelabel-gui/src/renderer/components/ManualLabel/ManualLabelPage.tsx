import React, { useState, useCallback } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { TextField, ToggleField } from '../common/FormFields';
import type { BulkLabelResult } from '../../lib/types';

interface CsvRow {
  Row: number;
  DriveId: string;
  ItemId: string;
  LabelName: string | null;
  LabelId: string | null;
  Valid: boolean;
  Errors: string | null;
}

interface CsvImportResult {
  Action: string;
  TotalRows: number;
  ValidCount: number;
  InvalidCount: number;
  ValidRows: CsvRow[];
  InvalidRows: CsvRow[];
}

type Phase = 'upload' | 'preview' | 'applying' | 'done';

export default function ManualLabelPage() {
  const { invoke } = usePowerShell();
  const [phase, setPhase] = useState<Phase>('upload');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Apply phase
  const [labelOverride, setLabelOverride] = useState('');
  const [justification, setJustification] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [applying, setApplying] = useState(false);
  const elapsed = useElapsedTime(applying);
  const [applyResult, setApplyResult] = useState<BulkLabelResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleParse = useCallback(async () => {
    if (!csvText.trim()) { setParseError('Paste CSV content or use the template.'); return; }
    setParseError(null);
    try {
      const r = await invoke<CsvImportResult>('Import-SLLabelCsv', { CsvText: csvText });
      if (r.success && r.data) {
        setPreview(r.data);
        setPhase('preview');
      } else {
        setParseError(r.error ?? 'Failed to parse CSV');
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse');
    }
  }, [csvText, invoke]);

  const handleApply = useCallback(async () => {
    if (!preview) return;
    const items = preview.ValidRows.map(r => ({ DriveId: r.DriveId, ItemId: r.ItemId }));
    if (items.length === 0) { setApplyError('No valid rows to apply.'); return; }

    // Determine label source: per-row LabelName/LabelId, or override
    const firstRow = preview.ValidRows[0];
    const labelName = labelOverride.trim() || firstRow.LabelName || undefined;
    const labelId = firstRow.LabelId || undefined;

    if (!labelName && !labelId) {
      setApplyError('No label specified. Add LabelName/LabelId to CSV or set a label override.');
      return;
    }

    setApplying(true); setApplyError(null); setApplyResult(null);
    try {
      const r = await invoke<BulkLabelResult>('Set-SLDocumentLabelBulk', {
        Items: items,
        LabelName: labelName,
        LabelId: labelId,
        Justification: justification.trim() || undefined,
        DryRun: dryRun || undefined,
      });
      if (r.success && r.data) {
        setApplyResult(r.data);
        setPhase('done');
      } else {
        setApplyError(r.error ?? 'Bulk apply failed');
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Failed');
    }
    setApplying(false);
  }, [preview, labelOverride, justification, dryRun, invoke]);

  const handleReset = () => {
    setPhase('upload');
    setCsvText('');
    setPreview(null);
    setParseError(null);
    setApplyResult(null);
    setApplyError(null);
    setLabelOverride('');
    setJustification('');
    setDryRun(true);
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Manual Label — CSV Upload</h2>
        <p className="text-sm text-zinc-500 mt-1">Upload a CSV to apply sensitivity labels to multiple documents.</p>
      </div>

      {/* Phase indicator */}
      <div className="flex gap-1">
        {(['upload', 'preview', 'done'] as const).map((p, i) => (
          <div key={p} className={`flex-1 h-1 rounded-full ${
            phase === p ? 'bg-blue-500' :
            (['upload', 'preview', 'done'].indexOf(phase) > i) ? 'bg-blue-500/40' : 'bg-white/[0.06]'
          }`} />
        ))}
      </div>

      {/* Upload phase */}
      {phase === 'upload' && (
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">CSV Content</label>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={'DriveId,ItemId,LabelName\nb!abc123,01ABC,Confidential\nb!abc123,02DEF,Internal'}
              rows={8}
              className="w-full px-3 py-2 text-xs font-mono bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-y"
            />
            <p className="text-[11px] text-zinc-600 mt-1">Columns: DriveId, ItemId, LabelName (or LabelId). Paste content directly.</p>
          </div>

          <div className="bg-white/[0.03] rounded-lg p-3">
            <p className="text-[11px] text-zinc-500 font-medium mb-1">Template</p>
            <code className="text-[11px] text-zinc-400 font-mono">DriveId,ItemId,LabelName{'\n'}b!driveId,itemId,Confidential</code>
          </div>

          {parseError && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{parseError}</div>}

          <button onClick={handleParse} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
            Validate CSV
          </button>
        </div>
      )}

      {/* Preview phase */}
      {phase === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.06] rounded-lg p-3">
              <dt className="text-xs text-zinc-500">Total Rows</dt>
              <dd className="text-lg font-bold text-zinc-200">{preview.TotalRows}</dd>
            </div>
            <div className="bg-white/[0.06] rounded-lg p-3">
              <dt className="text-xs text-zinc-500">Valid</dt>
              <dd className="text-lg font-bold text-emerald-400">{preview.ValidCount}</dd>
            </div>
            <div className="bg-white/[0.06] rounded-lg p-3">
              <dt className="text-xs text-zinc-500">Invalid</dt>
              <dd className={`text-lg font-bold ${preview.InvalidCount > 0 ? 'text-red-400' : 'text-zinc-400'}`}>{preview.InvalidCount}</dd>
            </div>
          </div>

          {preview.InvalidCount > 0 && (
            <div className="bg-red-900/10 border border-red-900/30 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-red-300">Invalid rows (will be skipped):</p>
              {preview.InvalidRows.map((row) => (
                <div key={row.Row} className="text-xs text-red-400/80">
                  Row {row.Row}: {row.Errors}
                </div>
              ))}
            </div>
          )}

          {preview.ValidCount > 0 && (
            <div className="bg-white/[0.03] rounded-lg p-3 max-h-48 overflow-auto">
              <p className="text-xs font-medium text-zinc-400 mb-2">Preview ({preview.ValidCount} items)</p>
              <div className="space-y-1">
                {preview.ValidRows.slice(0, 20).map((row) => (
                  <div key={row.Row} className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-600 w-8">#{row.Row}</span>
                    <span className="text-zinc-400 font-mono truncate flex-1">{row.DriveId}/{row.ItemId}</span>
                    <span className="text-blue-400">{row.LabelName || row.LabelId}</span>
                  </div>
                ))}
                {preview.ValidCount > 20 && (
                  <p className="text-xs text-zinc-600 mt-1">...and {preview.ValidCount - 20} more</p>
                )}
              </div>
            </div>
          )}

          <TextField
            label="Label Override (optional)"
            value={labelOverride}
            onChange={setLabelOverride}
            placeholder="Override the label for all rows..."
            helpText="If set, this label will be applied to all rows regardless of CSV content."
          />
          <TextField label="Justification" value={justification} onChange={setJustification} placeholder="Reason for labelling..." />
          <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Simulate without making changes." />

          {applyError && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{applyError}</div>}

          <div className="flex items-center gap-3">
            <button onClick={handleApply} disabled={applying || preview.ValidCount === 0} className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg transition-colors">
              {applying ? 'Applying...' : dryRun ? `Dry Run — Apply to ${preview.ValidCount} files` : `Apply to ${preview.ValidCount} files`}
            </button>
            <button onClick={handleReset} disabled={applying} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
              Start Over
            </button>
            {applying && (
              <span className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                {elapsed || 'Starting...'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Done phase */}
      {phase === 'done' && applyResult && (
        <div className="space-y-4">
          <ResultSummary result={applyResult} />
          <button onClick={handleReset} className="px-4 py-2 text-xs font-medium text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors">
            Upload Another CSV
          </button>
        </div>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: BulkLabelResult }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        {result.DryRun ? 'Dry Run Complete' : 'Apply Complete'}
      </h4>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.06] rounded-lg p-2.5">
          <dt className="text-xs text-zinc-500">Total</dt>
          <dd className="text-lg font-bold text-zinc-200">{result.TotalItems}</dd>
        </div>
        <div className="bg-white/[0.06] rounded-lg p-2.5">
          <dt className="text-xs text-zinc-500">Succeeded</dt>
          <dd className="text-lg font-bold text-emerald-400">{result.SuccessCount}</dd>
        </div>
        <div className="bg-white/[0.06] rounded-lg p-2.5">
          <dt className="text-xs text-zinc-500">Failed</dt>
          <dd className={`text-lg font-bold ${result.FailedCount > 0 ? 'text-red-400' : 'text-zinc-400'}`}>{result.FailedCount}</dd>
        </div>
      </div>

      {result.Results && result.Results.length > 0 && (
        <div>
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-zinc-500 hover:text-zinc-300">
            {showDetails ? '▾ Hide' : '▸ Show'} item details
          </button>
          {showDetails && (
            <div className="mt-2 space-y-1 max-h-48 overflow-auto">
              {result.Results.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.06] rounded-lg text-xs">
                  <span className="text-zinc-400 font-mono truncate">{item.DriveId}/{item.ItemId}</span>
                  <span className={`px-1.5 py-0.5 rounded-lg ${item.Status === 'Failed' ? 'bg-red-500/10 text-red-400' : item.Status === 'DryRun' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
                    {item.Status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
