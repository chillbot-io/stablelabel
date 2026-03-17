import React, { useState, useEffect } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

type ConnectStage = 'idle' | 'connecting' | 'done' | 'error';

const LAST_CONNECTION_KEY = 'stablelabel-last-connection';

interface StepInfo {
  Step: string;
  Module?: string;
  Status: string;
  Version?: string;
  UPN?: string;
  Tenant?: string;
  Error?: string;
}

interface ConnectAllResult {
  Status: string;
  Stage?: string;
  Error?: string;
  UserPrincipalName?: string;
  TenantId?: string;
  Steps?: StepInfo[];
}

interface LastConnection {
  upn: string;
  tenantId: string;
  connectedAt: string;
}

interface ConnectionDialogProps {
  onClose: () => void;
  onConnected?: () => void;
}

function loadLastConnection(): LastConnection | null {
  try {
    const raw = localStorage.getItem(LAST_CONNECTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastConnection;
  } catch {
    return null;
  }
}

function saveLastConnection(upn: string, tenantId: string): void {
  const entry: LastConnection = { upn, tenantId, connectedAt: new Date().toISOString() };
  localStorage.setItem(LAST_CONNECTION_KEY, JSON.stringify(entry));
}

export default function ConnectionDialog({ onClose, onConnected }: ConnectionDialogProps) {
  const { invoke } = usePowerShell();
  const [stage, setStage] = useState<ConnectStage>('idle');
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [upn, setUpn] = useState<string | null>(null);
  const [lastConnection, setLastConnection] = useState<LastConnection | null>(null);

  useEffect(() => {
    setLastConnection(loadLastConnection());
  }, []);

  const handleConnect = async () => {
    setStage('connecting');
    setError(null);
    setSteps([]);

    const result = await invoke<ConnectAllResult>('Connect-SLAll');

    if (!result.success) {
      setStage('error');
      setError(result.error || 'Connection failed');
      return;
    }

    const data = result.data;
    if (!data || typeof data === 'string') {
      setStage('error');
      setError(typeof data === 'string' ? data : 'No response from Connect-SLAll. Check that PowerShell 7 and required modules are installed.');
      return;
    }

    if (data.Steps) {
      setSteps(data.Steps);
    }

    if (data.Status === 'Connected') {
      setUpn(data.UserPrincipalName || null);
      setStage('done');
      if (data.UserPrincipalName && data.TenantId) {
        saveLastConnection(data.UserPrincipalName, data.TenantId);
      }
      onConnected?.();
    } else if (data.Status === 'PartiallyConnected') {
      setUpn(data.UserPrincipalName || null);
      setStage('done');
      setError(data.Error || null);
      if (data.UserPrincipalName && data.TenantId) {
        saveLastConnection(data.UserPrincipalName, data.TenantId);
      }
      onConnected?.();
    } else {
      setStage('error');
      setError(data.Error || 'Connection failed');
    }
  };

  const isConnecting = stage === 'connecting';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[440px]">
        <h2 className="text-lg font-bold text-white mb-1">Connect to StableLabel</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sign in with your Microsoft account. PowerShell modules are installed
          automatically and all services connect in the background.
        </p>

        {/* Requirements banner — always visible in idle state */}
        {stage === 'idle' && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-800/60 border border-gray-700/50 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Before you connect</p>
              <ul className="text-xs text-gray-400 space-y-1.5 list-none">
                <li className="flex items-start gap-2">
                  <span className="text-gray-500 mt-px shrink-0">1.</span>
                  <span>
                    <span className="text-gray-300">PowerShell 7+</span> must be installed on this machine.{' '}
                    <a
                      href="https://learn.microsoft.com/powershell/scripting/install/installing-powershell"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Install guide
                    </a>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-500 mt-px shrink-0">2.</span>
                  <span>
                    The signing-in account needs{' '}
                    <span className="text-gray-300">Global Administrator</span> (or Global Reader){' '}
                    for Microsoft Graph access.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-500 mt-px shrink-0">3.</span>
                  <span>
                    The account also needs{' '}
                    <span className="text-gray-300">Compliance Administrator</span> for Security
                    &amp; Compliance Center access (labels, DLP, retention).
                  </span>
                </li>
              </ul>
              <p className="text-[11px] text-gray-600 pt-1 border-t border-gray-700/50">
                PowerShell modules (Microsoft.Graph, ExchangeOnlineManagement) are installed automatically if missing.
              </p>
            </div>

            {lastConnection && (
              <div className="p-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg">
                <p className="text-xs text-gray-500">Last session</p>
                <p className="text-sm text-gray-300">{lastConnection.upn}</p>
                <p className="text-xs text-gray-600 font-mono">{lastConnection.tenantId}</p>
              </div>
            )}

            <button
              onClick={handleConnect}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            >
              Sign in with Microsoft
            </button>
          </div>
        )}

        {isConnecting && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
              <Spinner />
              <span className="text-sm text-blue-300">Connecting...</span>
            </div>
            <p className="text-xs text-gray-500">
              A Microsoft sign-in window will appear. Complete authentication there to continue.
            </p>
          </div>
        )}

        {steps.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {steps.map((step, i) => (
              <StepRow key={i} step={step} />
            ))}
          </div>
        )}

        {stage === 'done' && (
          <div className="mt-4 p-3 bg-green-900/20 border border-green-800/30 rounded-lg">
            <div className="text-sm text-green-300 font-medium">
              {error ? 'Partially connected' : 'Connected successfully'}
            </div>
            {upn && (
              <div className="text-xs text-green-400/70 mt-1">Signed in as {upn}</div>
            )}
            {error && (
              <div className="text-xs text-amber-400 mt-1">{error}</div>
            )}
          </div>
        )}

        {stage === 'error' && (
          <div className="mt-4 space-y-3">
            <div className="p-3 bg-red-900/20 border border-red-800/30 rounded-lg">
              <div className="text-sm text-red-300">{error}</div>
            </div>
            <button
              onClick={() => setStage('idle')}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg border border-gray-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          disabled={isConnecting}
          className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {stage === 'done' ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: StepInfo }) {
  const isOk = step.Status === 'Connected' || step.Status === 'AlreadyInstalled' || step.Status === 'Installed';
  const isFail = step.Status === 'Failed';

  let icon: string;
  let color: string;
  if (isOk) {
    icon = '\u2713';
    color = 'text-green-400';
  } else if (isFail) {
    icon = '\u2717';
    color = 'text-red-400';
  } else {
    icon = '\u2022';
    color = 'text-gray-500';
  }

  let label: string;
  if (step.Step === 'Prereq') {
    label = step.Module || 'Prerequisite';
    if (step.Status === 'AlreadyInstalled') label += ` v${step.Version}`;
    else if (step.Status === 'Installed') label += ' (installed)';
  } else if (step.Step === 'Graph') {
    label = `Microsoft Graph`;
    if (step.UPN) label += ` — ${step.UPN}`;
  } else if (step.Step === 'Compliance') {
    label = 'Security & Compliance';
  } else {
    label = step.Step;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`font-mono ${color}`}>{icon}</span>
      <span className={isOk ? 'text-gray-300' : isFail ? 'text-red-300' : 'text-gray-500'}>
        {label}
      </span>
      {step.Error && (
        <span className="text-red-400 truncate ml-1" title={step.Error}>
          — {step.Error}
        </span>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
