import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

export default function DashboardPage() {
  const { status } = useConnectionStatus();
  const anyConnected = status?.GraphConnected || status?.ComplianceConnected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 mt-1">Tenant compliance overview</p>
      </div>

      {!anyConnected ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-300 mb-2">Not Connected</h2>
          <p className="text-gray-500 mb-4">
            Connect to Microsoft Graph and Security & Compliance PowerShell to get started.
          </p>
          <p className="text-sm text-gray-600">
            Use the PowerShell terminal to run: <code className="bg-gray-800 px-2 py-0.5 rounded">Connect-SLGraph</code> and{' '}
            <code className="bg-gray-800 px-2 py-0.5 rounded">Connect-SLCompliance</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatusCard title="Sensitivity Labels" value="--" subtitle="Connect to load" />
          <StatusCard title="DLP Policies" value="--" subtitle="Connect to load" />
          <StatusCard title="Snapshots" value="--" subtitle="Connect to load" />
          <StatusCard title="Retention Policies" value="--" subtitle="Connect to load" />
          <StatusCard title="Auto-Label Policies" value="--" subtitle="Connect to load" />
          <StatusCard title="Active Elevations" value="0" subtitle="No active elevations" />
        </div>
      )}
    </div>
  );
}

function StatusCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
    </div>
  );
}
