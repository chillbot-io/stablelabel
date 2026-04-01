import React, { useEffect, useState } from 'react';

interface Settings {
  modulePath: string;
  timeout: number;
  logLevel: string;
}

const SETTINGS_DEFAULTS: Settings = { modulePath: '', timeout: 300, logLevel: 'Info' };
const LOG_LEVELS = ['Error', 'Warning', 'Info', 'Debug'];

/** Validate settings shape — rejects malformed localStorage/preferences data (#18). */
function validateSettings(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const obj = raw as Record<string, unknown>;
  const result: Partial<Settings> = {};
  if (typeof obj.modulePath === 'string') result.modulePath = obj.modulePath;
  if (typeof obj.timeout === 'number' && obj.timeout >= 10 && obj.timeout <= 3600) result.timeout = obj.timeout;
  if (typeof obj.logLevel === 'string' && LOG_LEVELS.includes(obj.logLevel)) result.logLevel = obj.logLevel;
  return result;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS);
  const [bridgeStatus, setBridgeStatus] = useState<{ initialized: boolean; modulePath?: string } | null>(null);
  const [pwshStatus, setPwshStatus] = useState<{ available: boolean; path?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  // Track whether user has explicitly set modulePath (#17)
  const [userSetModulePath, setUserSetModulePath] = useState(false);

  useEffect(() => {
    window.stablelabel.getStatus().then(setBridgeStatus);
    window.stablelabel.checkPwsh().then(setPwshStatus);

    // Load settings from encrypted preferences (with validation)
    window.stablelabel.getPreferences().then((prefs) => {
      const validated = validateSettings(prefs.settings);
      if (Object.keys(validated).length > 0) {
        setSettings((prev) => ({ ...prev, ...validated }));
        if (validated.modulePath) setUserSetModulePath(true);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // Only auto-fill modulePath from bridge if user hasn't set it (#17)
    if (bridgeStatus?.modulePath && !settings.modulePath && !userSetModulePath) {
      setSettings((prev) => ({ ...prev, modulePath: bridgeStatus.modulePath! }));
    }
  }, [bridgeStatus, settings.modulePath, userSetModulePath]);

  const handleSave = () => {
    // Save to encrypted main-process preferences instead of localStorage (#9)
    window.stablelabel.setPreferences({ settings }).catch(() => {});
    // Push to main process so bridge/logger pick up changes immediately
    window.stablelabel.updateSettings({
      timeout: settings.timeout,
      logLevel: settings.logLevel,
    });
    setUserSetModulePath(!!settings.modulePath);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const platform = window.stablelabel?.platform ?? 'unknown';

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Settings</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Application preferences and diagnostics</p>
      </div>

      <Section title="Environment">
        <InfoRow label="Platform" value={platform} />
        <InfoRow label="PowerShell Available" value={pwshStatus?.available ? 'Yes' : 'No'} />
        {pwshStatus?.path && <InfoRow label="PowerShell Path" value={pwshStatus.path} mono />}
        <InfoRow label="Bridge Initialized" value={bridgeStatus?.initialized ? 'Yes' : 'No'} />
      </Section>

      <Section title="PowerShell Module">
        <label className="block text-[12px] text-zinc-400 mb-1.5">Module Path</label>
        <input
          type="text"
          value={settings.modulePath}
          onChange={(e) => setSettings({ ...settings, modulePath: e.target.value })}
          className="w-full px-3 py-2 text-[12px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 font-mono focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="Auto-detected from app resources"
        />
        <p className="text-[10px] text-zinc-600 mt-1">Path to the StableLabel PowerShell module directory. Leave empty for auto-detection.</p>
      </Section>

      <Section title="Command Timeout">
        <label className="block text-[12px] text-zinc-400 mb-1.5">Timeout (seconds)</label>
        <input
          type="number"
          value={settings.timeout}
          onChange={(e) => setSettings({ ...settings, timeout: Math.max(10, parseInt(e.target.value) || 300) })}
          min={10}
          max={3600}
          className="w-32 px-3 py-2 text-[12px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <p className="text-[10px] text-zinc-600 mt-1">Maximum time to wait for a PowerShell command to complete. Default: 300s.</p>
      </Section>

      <Section title="Logging">
        <label className="block text-[12px] text-zinc-400 mb-1.5">Log Level</label>
        <div className="flex gap-2">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setSettings({ ...settings, logLevel: level })}
              className={`px-3 py-1.5 text-[12px] rounded-lg transition-colors ${
                settings.logLevel === level
                  ? 'bg-blue-500/[0.15] text-blue-400'
                  : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          Save Settings
        </button>
        {saved && <span className="text-[12px] text-emerald-400">Settings saved</span>}
      </div>

      <Section title="About">
        <InfoRow label="Application" value="StableLabel" />
        <InfoRow label="Version" value="0.1.0" />
        <InfoRow label="Description" value="Unified Microsoft Purview Compliance Management" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-5">
      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className={`text-[12px] text-zinc-300 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
