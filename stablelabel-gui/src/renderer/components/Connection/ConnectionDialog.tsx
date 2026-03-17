import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

type ConnectStage = 'idle' | 'connecting' | 'done' | 'error';

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

interface ConnectionDialogProps {
  onClose: () => void;
  onConnected?: () => void;
}

export default function ConnectionDialog({ onClose, onConnected }: ConnectionDialogProps) {
  const { invoke } = usePowerShell();
  const [stage, setStage] = useState<ConnectStage>('idle');
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [upn, setUpn] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState('');

  const handleConnect = async () => {
    setStage('connecting');
    setError(null);
    setSteps([]);

    // Build command with parameters
    const parts = ['Connect-SLAll'];
    const trimmedTenant = tenantId.trim();
    if (trimmedTenant) {
      parts.push(`-TenantId '${trimmedTenant}'`);
    }
    parts.push('-UseDeviceCode');
    const command = parts.join(' ');

    const result = await invoke<ConnectAllResult>(command);

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
      onConnected?.();
    } else if (data.Status === 'PartiallyConnected') {
      setUpn(data.UserPrincipalName || null);
      setStage('done');
      setError(data.Error || null);
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
        <p className="text-sm text-gray-500 mb-5">
          Installs prerequisites, then connects to Microsoft Graph and Security &amp; Compliance.
          Sign in via the device-code flow when prompted.
        </p>

        {stage === 'idle' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="sl-tenant-id" className="block text-xs font-medium text-gray-400 mb-1.5">
                Tenant ID <span className="text-gray-600">(optional)</span>
              </label>
              <input
                id="sl-tenant-id"
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="e.g. contoso.onmicrosoft.com"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-600 mt-1">
                Leave blank to use your default tenant.
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            >
              Connect
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
              A device-code prompt may appear in the background. Complete authentication in your browser to continue.
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
