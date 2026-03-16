import React, { useEffect, useState } from 'react';

interface Settings {
  modulePath: string;
  timeout: number;
  logLevel: string;
}

const LOG_LEVELS = ['Error', 'Warning', 'Info', 'Debug'];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    modulePath: '',
    timeout: 300,
    logLevel: 'Info',
  });
  const [bridgeStatus, setBridgeStatus] = useState<{ initialized: boolean; modulePath?: string } | null>(null);
  const [pwshStatus, setPwshStatus] = useState<{ available: boolean; path?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load bridge status
    window.stablelabel.getStatus().then(setBridgeStatus);
    window.stablelabel.checkPwsh().then(setPwshStatus);

    // Load saved settings from localStorage
    try {
      const stored = localStorage.getItem('stablelabel-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (bridgeStatus?.modulePath && !settings.modulePath) {
      setSettings((prev) => ({ ...prev, modulePath: bridgeStatus.modulePath! }));
    }
  }, [bridgeStatus]);

  const handleSave = () => {
    localStorage.setItem('stablelabel-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const platform = window.stablelabel?.platform ?? 'unknown';

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500 mt-1">Application preferences and diagnostics</p>
      </div>

      {/* Environment info */}
      <Section title="Environment">
        <InfoRow label="Platform" value={platform} />
        <InfoRow label="PowerShell Available" value={pwshStatus?.available ? 'Yes' : 'No'} />
        {pwshStatus?.path && <InfoRow label="PowerShell Path" value={pwshStatus.path} mono />}
        <InfoRow label="Bridge Initialized" value={bridgeStatus?.initialized ? 'Yes' : 'No'} />
      </Section>

      {/* Module path */}
      <Section title="PowerShell Module">
        <label className="block text-xs text-gray-400 mb-1">Module Path</label>
        <input
          type="text"
          value={settings.modulePath}
          onChange={(e) => setSettings({ ...settings, modulePath: e.target.value })}
          className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 font-mono focus:outline-none focus:border-blue-500"
          placeholder="Auto-detected from app resources"
        />
        <p className="text-[10px] text-gray-600 mt-1">Path to the StableLabel PowerShell module directory. Leave empty for auto-detection.</p>
      </Section>

      {/* Command timeout */}
      <Section title="Command Timeout">
        <label className="block text-xs text-gray-400 mb-1">Timeout (seconds)</label>
        <input
          type="number"
          value={settings.timeout}
          onChange={(e) => setSettings({ ...settings, timeout: Math.max(10, parseInt(e.target.value) || 300) })}
          min={10}
          max={3600}
          className="w-32 px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
        />
        <p className="text-[10px] text-gray-600 mt-1">Maximum time to wait for a PowerShell command to complete. Default: 300s.</p>
      </Section>

      {/* Log level */}
      <Section title="Logging">
        <label className="block text-xs text-gray-400 mb-1">Log Level</label>
        <div className="flex gap-2">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setSettings({ ...settings, logLevel: level })}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                settings.logLevel === level
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors"
        >
          Save Settings
        </button>
        {saved && <span className="text-xs text-green-400">Settings saved</span>}
      </div>

      {/* About */}
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs text-gray-300 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
