import { useState } from 'react';

type Tab = 'tenants' | 'users' | 'audit';

export default function SecurityPage() {
  const [tab, setTab] = useState<Tab>('tenants');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tenants', label: 'Connected Tenants' },
    { key: 'users', label: 'Users' },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Security</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? 'border-zinc-100 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'tenants' && <TenantsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function TenantsTab() {
  return (
    <div className="text-zinc-400 text-sm">
      {/* TODO: list connected tenants, "Connect Tenant" button */}
      <p>Connected customer tenants will appear here.</p>
      <button className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-200 text-sm transition-colors">
        + Connect Tenant
      </button>
    </div>
  );
}

function UsersTab() {
  return (
    <div className="text-zinc-400 text-sm">
      {/* TODO: list users with tenant access counts */}
      <p>Users appear here after signing in for the first time.</p>
      <p className="mt-2 text-zinc-500">Manage roles in Entra ID &rarr; Enterprise Apps &rarr; StableLabel</p>
    </div>
  );
}

function AuditTab() {
  return (
    <div className="text-zinc-400 text-sm">
      {/* TODO: paginated audit log */}
      <p>Audit events will appear here.</p>
    </div>
  );
}
