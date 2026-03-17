import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';
import ConfirmDialog from '../common/ConfirmDialog';
import type { ProtectionTemplate } from '../../lib/types';

export default function ProtectionTemplates() {
  const { invoke } = usePowerShell();
  const [templates, setTemplates] = useState<ProtectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProtectionTemplate | null>(null);

  const fetch = async () => {
    setLoading(true); setError(null);
    try {
      const r = await invoke<ProtectionTemplate[]>('Get-SLProtectionTemplate');
      if (r.success && Array.isArray(r.data)) setTemplates(r.data);
      else setError(r.error ?? 'Failed to load templates');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Protection Templates</h3>
        <p className="text-xs text-zinc-500">AIP protection templates define encryption and rights for protected content.</p>
      </div>

      {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-white/[0.06] rounded-lg animate-pulse" />)}</div>
      ) : (
        <>
          {/* Template list */}
          <div className="bg-white/[0.03] rounded-xl overflow-hidden">
            {templates.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500">No protection templates found.</p>
            ) : templates.map(t => (
              <button
                key={t.TemplateId}
                onClick={() => setSelected(selected?.TemplateId === t.TemplateId ? null : t)}
                className={`w-full text-left px-4 py-3 border-b border-white/[0.04] last:border-b-0 transition-colors ${selected?.TemplateId === t.TemplateId ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-zinc-200">{getTemplateName(t)}</span>
                    <span className="text-xs text-zinc-500 font-mono ml-2">{t.TemplateId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.ReadOnly && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.08] text-zinc-400 rounded-lg">Read-only</span>}
                    {t.Status && <span className={`text-[10px] px-1.5 py-0.5 rounded-lg ${t.Status === 'Published' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/[0.08] text-zinc-400'}`}>{t.Status}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected template detail */}
          {selected && <TemplateDetail template={selected} onRefresh={fetch} />}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <ExportTemplate templates={templates} />
            <ImportTemplate onImported={fetch} />
          </div>

          <button onClick={fetch} className="text-xs text-zinc-400 hover:text-zinc-200">Refresh</button>
        </>
      )}
    </div>
  );
}

function TemplateDetail({ template, onRefresh }: { template: ProtectionTemplate; onRefresh: () => void }) {
  const { invoke } = usePowerShell();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const handleDelete = async () => {
    setDeleting(true); setError(null);
    try {
      const r = await invoke(`Remove-SLProtectionTemplate -TemplateId '${template.TemplateId}' -Confirm:$false`);
      if (r.success) { setShowDelete(false); onRefresh(); }
      else setError(r.error ?? 'Failed to delete');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setDeleting(false);
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Template Details</h4>

      <div className="grid grid-cols-2 gap-3">
        <div><dt className="text-xs text-zinc-500">Template ID</dt><dd className="text-xs text-zinc-300 font-mono mt-0.5">{template.TemplateId}</dd></div>
        <div><dt className="text-xs text-zinc-500">Status</dt><dd className="text-sm text-zinc-300 mt-0.5">{template.Status ?? 'Unknown'}</dd></div>
      </div>

      {template.Names && (
        <div>
          <dt className="text-xs text-zinc-500 mb-1">Names</dt>
          <div className="space-y-1">
            {Object.entries(template.Names).map(([lang, name]) => (
              <div key={lang} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 uppercase">{lang}</span>
                <span className="text-zinc-300">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {template.Descriptions && (
        <div>
          <dt className="text-xs text-zinc-500 mb-1">Descriptions</dt>
          <div className="space-y-1">
            {Object.entries(template.Descriptions).map(([lang, desc]) => (
              <div key={lang} className="text-xs text-zinc-400"><span className="text-zinc-500 uppercase mr-2">{lang}</span>{desc}</div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="p-2 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>}

      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
        {!template.ReadOnly && (
          <button onClick={() => setShowDelete(true)} className="px-3 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors">
            Delete Template
          </button>
        )}
        <button onClick={() => setShowJson(!showJson)} className="text-xs text-zinc-500 hover:text-zinc-300">{showJson ? '▾ Hide' : '▸ Show'} raw JSON</button>
      </div>

      {showJson && <pre className="p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-48">{JSON.stringify(template, null, 2)}</pre>}

      {showDelete && (
        <ConfirmDialog
          title="Delete Protection Template"
          message={`Permanently delete template "${getTemplateName(template)}"? Documents using this template may lose protection settings.`}
          confirmLabel="Delete Template"
          variant="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function ExportTemplate({ templates }: { templates: ProtectionTemplate[] }) {
  const { invoke } = usePowerShell();
  const [templateId, setTemplateId] = useState('');
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleExport = async () => {
    if (!templateId || !path.trim()) { setMsg({ type: 'error', text: 'Template and path are required.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const r = await invoke(`Export-SLProtectionTemplate -TemplateId '${templateId}' -Path '${esc(path)}' -Confirm:$false`);
      if (r.success) setMsg({ type: 'success', text: `Exported to ${path}` });
      else setMsg({ type: 'error', text: r.error ?? 'Export failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Export Template</h4>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Template</label>
        <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500">
          <option value="">Select template...</option>
          {templates.map(t => <option key={t.TemplateId} value={t.TemplateId}>{getTemplateName(t)}</option>)}
        </select>
      </div>
      <TextField label="Output Path" value={path} onChange={setPath} placeholder="C:\exports\template.xml" />
      {msg && <div className={`p-2 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}
      <button onClick={handleExport} disabled={loading} className="px-3 py-1.5 text-xs text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors disabled:opacity-40">
        {loading ? 'Exporting...' : 'Export'}
      </button>
    </div>
  );
}

function ImportTemplate({ onImported }: { onImported: () => void }) {
  const { invoke } = usePowerShell();
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleImport = async () => {
    if (!path.trim()) { setMsg({ type: 'error', text: 'Path is required.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const r = await invoke(`Import-SLProtectionTemplate -Path '${esc(path)}' -Confirm:$false`);
      if (r.success) { setMsg({ type: 'success', text: 'Template imported successfully.' }); onImported(); }
      else setMsg({ type: 'error', text: r.error ?? 'Import failed' });
    } catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }); }
    setLoading(false);
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Import Template</h4>
      <TextField label="XML File Path" value={path} onChange={setPath} placeholder="C:\templates\template.xml" />
      {msg && <div className={`p-2 rounded-lg text-xs ${msg.type === 'error' ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-green-900/20 border border-green-800 text-green-300'}`}>{msg.text}</div>}
      <button onClick={handleImport} disabled={loading} className="px-3 py-1.5 text-xs text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 border border-green-500/20 rounded-lg transition-colors disabled:opacity-40">
        {loading ? 'Importing...' : 'Import'}
      </button>
    </div>
  );
}

function getTemplateName(t: ProtectionTemplate): string {
  if (t.Names) {
    const first = Object.values(t.Names)[0];
    if (first) return first;
  }
  return t.TemplateId;
}

function esc(s: string) { return s.replace(/'/g, "''"); }
