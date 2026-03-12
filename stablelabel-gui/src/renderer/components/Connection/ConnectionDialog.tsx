import React, { useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';

interface ConnectionDialogProps {
  onClose: () => void;
}

export default function ConnectionDialog({ onClose }: ConnectionDialogProps) {
  const { invoke } = usePowerShell();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async (backend: 'Graph' | 'Compliance' | 'Protection') => {
    setConnecting(backend);
    setError(null);

    const command = `Connect-SL${backend}`;
    const result = await invoke(command);

    if (!result.success) {
      setError(result.error || `Failed to connect to ${backend}`);
    }

    setConnecting(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
        <h2 className="text-lg font-bold text-white mb-4">Connect to Microsoft 365</h2>

        <div className="space-y-3">
          <ConnectButton
            label="Microsoft Graph"
            description="Labels, documents, sites"
            onClick={() => connect('Graph')}
            loading={connecting === 'Graph'}
          />
          <ConnectButton
            label="Security & Compliance"
            description="Policies, DLP, retention"
            onClick={() => connect('Compliance')}
            loading={connecting === 'Compliance'}
          />
          <ConnectButton
            label="Protection Service"
            description="AIP templates, tracking (Windows only)"
            onClick={() => connect('Protection')}
            loading={connecting === 'Protection'}
          />
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ConnectButton({
  label,
  description,
  onClick,
  loading,
}: {
  label: string;
  description: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors disabled:opacity-50"
    >
      <div className="font-medium text-white text-sm">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">
        {loading ? 'Connecting...' : description}
      </div>
    </button>
  );
}
