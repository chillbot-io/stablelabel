import React, { useState, useEffect, useRef } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { TextField, ToggleField } from '../common/FormFields';
import BulkResultSummary from '../common/BulkResultSummary';
import ConfirmDialog from '../common/ConfirmDialog';
import ScanProgressBar from '../common/ScanProgressBar';
import ShowPowerShell from '../common/ShowPowerShell';

interface SiteInfo {
  Id: string;
  DisplayName: string;
}

interface ScanResult {
  Action: string;
  TotalFiles: number;
  MatchedFiles: number;
  SkippedFiles: number;
  SuccessCount: number;
  FailedCount: number;
  DryRun: boolean;
  Results: Array<{ Name: string; ItemId: string; DriveId: string; Status: string; Error?: string }>;
  Skipped: Array<{ Name: string; ItemId: string; Reason: string }>;
}

export default function AutoLabelScanPage() {
  const { invoke } = usePowerShell();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Form state ──────────────────────────────────────────
  const [siteId, setSiteId] = useState('');
  const [driveId, setDriveId] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelId, setLabelId] = useState('');
  const [extensions, setExtensions] = useState('');
  const [filenamePatterns, setFilenamePatterns] = useState('');
  const [contentKeywords, setContentKeywords] = useState('');
  const [skipAlreadyLabeled, setSkipAlreadyLabeled] = useState(true);
  const [recursive, setRecursive] = useState(true);
  const [dryRun, setDryRun] = useState(true);

  // ── Execution state ─────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const elapsed = useElapsedTime(loading);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Site picker ─────────────────────────────────────────
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  const loadSites = async () => {
    setLoadingSites(true);
    const r = await invoke<SiteInfo[]>('Get-SLSiteList', {});
    if (r.success && Array.isArray(r.data)) setSites(r.data);
    setLoadingSites(false);
  };

  useEffect(() => { loadSites(); }, []);

  // ── Handlers ────────────────────────────────────────────
  const handleClick = () => {
    if (!siteId && !driveId) { setError('Select a site or enter a Drive ID.'); return; }
    if (!labelName && !labelId) { setError('Enter a label name or label ID.'); return; }
    if (!dryRun) { setShowConfirm(true); } else { handleScan(); }
  };

  const handleScan = async () => {
    setShowConfirm(false);
    setLoading(true);
    setError(null);
    setResult(null);

    const params: Record<string, unknown> = {};
    if (siteId) params.SiteId = siteId;
    if (driveId) params.DriveId = driveId;
    if (labelName.trim()) params.LabelName = labelName.trim();
    if (labelId.trim()) params.LabelId = labelId.trim();
    if (extensions.trim()) params.Extensions = extensions.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (filenamePatterns.trim()) params.FilenamePatterns = filenamePatterns.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (contentKeywords.trim()) params.ContentKeywords = contentKeywords.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (skipAlreadyLabeled) params.SkipAlreadyLabeled = true;
    if (recursive) params.Recursive = true;
    if (dryRun) params.DryRun = true;

    try {
      const r = await invoke<ScanResult>('Invoke-SLAutoLabelScan', params);
      if (!mountedRef.current) return;
      if (r.success && r.data) setResult(r.data);
      else setError(r.error ?? 'Scan failed');
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed');
    }
    if (mountedRef.current) setLoading(false);
  };

  const buildParams = () => {
    const p: Record<string, unknown> = {};
    if (siteId) p.SiteId = siteId;
    if (driveId) p.DriveId = driveId;
    if (labelName.trim()) p.LabelName = labelName.trim();
    if (labelId.trim()) p.LabelId = labelId.trim();
    if (extensions.trim()) p.Extensions = extensions.split(',').map(s => s.trim()).filter(Boolean);
    if (filenamePatterns.trim()) p.FilenamePatterns = filenamePatterns.split(',').map(s => s.trim()).filter(Boolean);
    if (contentKeywords.trim()) p.ContentKeywords = contentKeywords.split(',').map(s => s.trim()).filter(Boolean);
    if (skipAlreadyLabeled) p.SkipAlreadyLabeled = true;
    if (recursive) p.Recursive = true;
    if (dryRun) p.DryRun = true;
    return p;
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Auto-Label Scan</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Scan a SharePoint site and automatically apply a sensitivity label to matching files.
          Conditions are AND-logic — all specified filters must match.
        </p>
      </div>

      {/* Site picker */}
      <div>
        <label className="block text-[12px] font-medium text-zinc-400 mb-1">SharePoint Site</label>
        <div className="flex gap-2">
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
            disabled={loadingSites}
          >
            <option value="">{loadingSites ? 'Loading sites...' : 'Select a site (or enter Drive ID below)'}</option>
            {sites.map((s) => (
              <option key={s.Id} value={s.Id}>{s.DisplayName || s.Id}</option>
            ))}
          </select>
          <button
            onClick={loadSites}
            disabled={loadingSites}
            className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg"
          >
            {loadingSites ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <TextField label="Drive ID (optional — overrides site)" value={driveId} onChange={setDriveId} placeholder="b!abc123..." />

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Label Name" value={labelName} onChange={setLabelName} placeholder="e.g., Confidential" disabled={!!labelId.trim()} />
        <TextField label="Label ID (GUID)" value={labelId} onChange={setLabelId} placeholder="00000000-0000-..." disabled={!!labelName.trim()} />
      </div>

      {/* Conditions */}
      <div className="border border-zinc-700/50 rounded-lg p-4 space-y-3">
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Conditions (optional)</div>

        <TextField
          label="File Extensions"
          value={extensions}
          onChange={setExtensions}
          placeholder="docx, pdf, xlsx (comma-separated, no dots)"
        />
        <TextField
          label="Filename Patterns"
          value={filenamePatterns}
          onChange={setFilenamePatterns}
          placeholder="*confidential*, *report* (comma-separated wildcards)"
        />
        <TextField
          label="Content Keywords"
          value={contentKeywords}
          onChange={setContentKeywords}
          placeholder="social security, account number (comma-separated — downloads files, slow)"
        />
      </div>

      <div className="flex gap-4">
        <ToggleField label="Recursive" checked={recursive} onChange={setRecursive} helpText="Scan subfolders" />
        <ToggleField label="Skip Already Labeled" checked={skipAlreadyLabeled} onChange={setSkipAlreadyLabeled} helpText="Skip files that already have a label" />
        <ToggleField label="Dry Run" checked={dryRun} onChange={setDryRun} helpText="Preview without applying" />
      </div>

      <ShowPowerShell cmdlet="Invoke-SLAutoLabelScan" params={buildParams()} />

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleClick}
          disabled={loading}
          className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
            dryRun ? 'bg-blue-600 hover:bg-blue-500' : 'bg-amber-600 hover:bg-amber-500'
          }`}
        >
          {loading ? 'Scanning...' : dryRun ? 'Dry Run — Scan & Preview' : 'Scan & Apply Labels'}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {elapsed || 'Starting...'}
          </span>
        )}
      </div>

      <ScanProgressBar active={loading} />

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <div className="text-xs text-zinc-500">Total Files</div>
              <div className="text-xl font-semibold text-zinc-100 tabular-nums">{result.TotalFiles}</div>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <div className="text-xs text-zinc-500">Matched</div>
              <div className="text-xl font-semibold text-blue-400 tabular-nums">{result.MatchedFiles}</div>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <div className="text-xs text-zinc-500">{result.DryRun ? 'Would Label' : 'Labeled'}</div>
              <div className="text-xl font-semibold text-emerald-400 tabular-nums">{result.SuccessCount}</div>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <div className="text-xs text-zinc-500">Failed</div>
              <div className={`text-xl font-semibold tabular-nums ${result.FailedCount > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{result.FailedCount}</div>
            </div>
          </div>

          {result.SkippedFiles > 0 && (
            <details className="text-xs">
              <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300">{result.SkippedFiles} files skipped</summary>
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1 bg-zinc-900/50 rounded-lg p-3">
                {result.Skipped?.slice(0, 100).map((s, i) => (
                  <div key={i} className="flex justify-between text-zinc-500">
                    <span className="truncate mr-4">{s.Name}</span>
                    <span className="text-zinc-600 shrink-0">{s.Reason}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {result.Results?.length > 0 && (
            <details className="text-xs" open>
              <summary className="text-zinc-400 cursor-pointer hover:text-zinc-200">{result.Results.length} results</summary>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1 bg-zinc-900/50 rounded-lg p-3">
                {result.Results.map((r, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-zinc-300 truncate mr-4">{r.Name}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] ${
                      r.Status === 'Labeled' || r.Status === 'WouldLabel'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {r.Status}
                      {r.Error && ` — ${r.Error}`}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Auto-Label Scan"
          message={`This will scan ${siteId ? 'the selected site' : `drive ${driveId}`} and apply label "${labelName.trim() || labelId.trim()}" to all matching files. Run a dry run first if you haven't already.`}
          confirmLabel="Scan & Apply"
          variant="warning"
          onConfirm={handleScan}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
