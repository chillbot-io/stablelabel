import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

export default function TopBar() {
  const { status, loading } = useConnectionStatus();

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {/* Breadcrumb area - can be expanded later */}
      </div>

      <div className="flex items-center gap-3">
        {/* Connection indicators */}
        <ConnectionDot label="Graph" connected={status?.GraphConnected ?? false} loading={loading} />
        <ConnectionDot label="Compliance" connected={status?.ComplianceConnected ?? false} loading={loading} />
        <ConnectionDot label="Protection" connected={status?.ProtectionConnected ?? false} loading={loading} />

        {status?.UserPrincipalName && (
          <span className="text-xs text-gray-400 ml-2">{status.UserPrincipalName}</span>
        )}
      </div>
    </header>
  );
}

function ConnectionDot({
  label,
  connected,
  loading,
}: {
  label: string;
  connected: boolean;
  loading: boolean;
}) {
  const color = loading ? 'bg-gray-600' : connected ? 'bg-green-500' : 'bg-gray-600';

  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${connected ? 'Connected' : 'Disconnected'}`}>
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
