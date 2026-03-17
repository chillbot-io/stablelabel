import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

export default function TopBar() {
  const { status, loading } = useConnectionStatus();

  return (
    <header className="h-11 flex items-center justify-end px-5 border-b border-white/[0.04]">
      <div className="flex items-center gap-4">
        <ServiceDot label="Graph" connected={status?.GraphConnected ?? false} loading={loading} />
        <ServiceDot label="Compliance" connected={status?.ComplianceConnected ?? false} loading={loading} />
        <ServiceDot label="Protection" connected={status?.ProtectionConnected ?? false} loading={loading} />

        {status?.UserPrincipalName && (
          <span className="text-[11px] text-zinc-500 ml-1 font-medium">
            {status.UserPrincipalName}
          </span>
        )}
      </div>
    </header>
  );
}

function ServiceDot({
  label,
  connected,
  loading,
}: {
  label: string;
  connected: boolean;
  loading: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      title={`${label}: ${connected ? 'Connected' : 'Disconnected'}`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          loading ? 'bg-zinc-600' : connected ? 'bg-emerald-400' : 'bg-zinc-700'
        }`}
      />
      <span className="text-[11px] text-zinc-500">{label}</span>
    </div>
  );
}
