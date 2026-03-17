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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-[440px] border border-white/[0.06]">
        <h2 className="text-lg font-semibold text-white mb-1">Connect to StableLabel</h2>
        <p className="text-[13px] text-zinc-500 mb-5 leading-relaxed">
          Sign in with your Microsoft account. PowerShell modules are installed
          automatically and all services connect in the background.
        </p>

        {/* Requirements — idle state only */}
        {stage === 'idle' && (
          <div className="space-y-4">
            <div className="p-4 bg-white/[0.03] rounded-lg space-y-2.5">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Before you connect</p>
              <ul className="text-[12px] text-zinc-400 space-y-2 list-none">
                <li className="flex items-start gap-2.5">
                  <span className="text-zinc-600 mt-px shrink-0">1.</span>
                  <span>
                    <span className="text-zinc-200">PowerShell 7+</span> must be installed on this machine.{' '}
                    <a
                      href="https://learn.microsoft.com/powershell/scripting/install/installing-powershell"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Install guide
                    </a>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-zinc-600 mt-px shrink-0">2.</span>
                  <span>
                    The signing-in account needs{' '}
                    <span className="text-zinc-200">Global Administrator</span> (or Global Reader){' '}
                    for Microsoft Graph access.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-zinc-600 mt-px shrink-0">3.</span>
                  <span>
                    The account also needs{' '}
                    <span className="text-zinc-200">Compliance Administrator</span> for Security
                    &amp; Compliance Center access (labels, DLP, retention).
                  </span>
                </li>
              </ul>
              <p className="text-[11px] text-zinc-600 pt-2 border-t border-white/[0.04]">
                PowerShell modules (Microsoft.Graph, ExchangeOnlineManagement) are installed automatically if missing.
              </p>
            </div>

            {lastConnection && (
              <div className="p-3 bg-white/[0.03] rounded-lg">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Last session</p>
                <p className="text-[13px] text-zinc-200">{lastConnection.upn}</p>
                <p className="text-[11px] text-zinc-600 font-mono">{lastConnection.tenantId}</p>
              </div>
            )}

            <button
              onClick={handleConnect}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium rounded-lg transition-colors"
            >
              Sign in with Microsoft
            </button>
          </div>
        )}

        {isConnecting && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-blue-500/[0.06] rounded-lg">
              <Spinner />
              <span className="text-[13px] text-blue-300">Connecting...</span>
            </div>
            <p className="text-[11px] text-zinc-500">
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
          <div className="mt-4 p-3 bg-emerald-500/[0.06] rounded-lg">
            <div className="text-[13px] text-emerald-300 font-medium">
              {error ? 'Partially connected' : 'Connected successfully'}
            </div>
            {upn && (
              <div className="text-[11px] text-emerald-400/60 mt-1">Signed in as {upn}</div>
            )}
            {error && (
              <div className="text-[11px] text-amber-400 mt-1">{error}</div>
            )}
          </div>
        )}

        {stage === 'error' && (
          <div className="mt-4 space-y-3">
            <div className="p-3 bg-red-500/[0.06] rounded-lg">
              <div className="text-[13px] text-red-300">{error}</div>
            </div>
            <button
              onClick={() => setStage('idle')}
              className="w-full py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-[13px] font-medium rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          disabled={isConnecting}
          className="mt-4 w-full py-2 text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
    color = 'text-emerald-400';
  } else if (isFail) {
    icon = '\u2717';
    color = 'text-red-400';
  } else {
    icon = '\u2022';
    color = 'text-zinc-600';
  }

  let label: string;
  if (step.Step === 'Prereq') {
    label = step.Module || 'Prerequisite';
    if (step.Status === 'AlreadyInstalled') label += ` v${step.Version}`;
    else if (step.Status === 'Installed') label += ' (installed)';
  } else if (step.Step === 'Graph') {
    label = `Microsoft Graph`;
    if (step.UPN) label += ` \u2014 ${step.UPN}`;
  } else if (step.Step === 'Compliance') {
    label = 'Security & Compliance';
  } else {
    label = step.Step;
  }

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`font-mono ${color}`}>{icon}</span>
      <span className={isOk ? 'text-zinc-300' : isFail ? 'text-red-300' : 'text-zinc-600'}>
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
