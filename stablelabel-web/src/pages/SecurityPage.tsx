import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import type { Column } from '@/components/DataTable';
import type { CustomerTenant, UserSummary, TenantAccess } from '@/lib/types';

type Tab = 'tenants' | 'users';

export default function SecurityPage() {
  const [tab, setTab] = useState<Tab>('tenants');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tenants', label: 'Connected Tenants' },
    { key: 'users', label: 'Users' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Security</h1>

      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tenants' && <TenantsTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

function TenantsTab() {
  const [tenants, setTenants] = useState<CustomerTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CustomerTenant[]>('/security/tenants');
      setTenants(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const connectTenant = async (entraId: string, displayName: string) => {
    const result = await api.post<{ consent_url: string }>('/security/tenants', {
      entra_tenant_id: entraId,
      display_name: displayName,
    });
    setShowConnect(false);
    window.open(result.consent_url, '_blank');
    loadTenants();
  };

  const disconnectTenant = async (id: string) => {
    await api.delete(`/security/tenants/${id}`);
    loadTenants();
  };

  const columns: Column<CustomerTenant>[] = [
    { key: 'name', header: 'Tenant', render: (t) => <span className="font-medium">{t.display_name || t.entra_tenant_id}</span> },
    { key: 'entra', header: 'Entra ID', render: (t) => <span className="text-xs text-zinc-500 font-mono">{t.entra_tenant_id}</span> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.consent_status} /> },
    { key: 'users', header: 'Users', render: (t) => <span className="text-zinc-400">{t.user_count}</span> },
    {
      key: 'created', header: 'Connected', render: (t) => (
        <span className="text-xs text-zinc-500">{new Date(t.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'actions', header: '', render: (t) => (
        <button onClick={() => disconnectTenant(t.id)} className="px-2 py-1 text-xs rounded bg-red-900/50 hover:bg-red-900 text-red-400">
          Disconnect
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowConnect(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm rounded-md transition-colors">
          Connect Tenant
        </button>
      </div>

      {showConnect && <ConnectTenantDialog onSubmit={connectTenant} onClose={() => setShowConnect(false)} />}

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <DataTable columns={columns} data={tenants} keyFn={(t) => t.id} emptyMessage="No tenants connected" />
        </div>
      )}
    </>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userTenants, setUserTenants] = useState<TenantAccess[]>([]);

  useEffect(() => {
    setLoading(true);
    api.get<UserSummary[]>('/security/users')
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    try {
      const access = await api.get<TenantAccess[]>(`/security/users/${userId}/tenants`);
      setUserTenants(access);
    } catch { setUserTenants([]); }
  };

  const columns: Column<UserSummary>[] = [
    { key: 'email', header: 'Email', render: (u) => <span className="font-medium">{u.email}</span> },
    { key: 'name', header: 'Name', render: (u) => <span className="text-zinc-400">{u.display_name}</span> },
    { key: 'role', header: 'Role', render: (u) => <StatusBadge status={u.role === 'Admin' ? 'active' : 'pending'} /> },
    { key: 'tenants', header: 'Tenants', render: (u) => <span className="text-zinc-400">{u.tenant_count}</span> },
    {
      key: 'seen', header: 'Last Seen', render: (u) => (
        <span className="text-xs text-zinc-500">{new Date(u.last_seen).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'expand', header: '', render: (u) => (
        <button onClick={() => toggleExpand(u.id)} className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
          {expandedUser === u.id ? 'Hide' : 'Access'}
        </button>
      ),
    },
  ];

  return loading ? (
    <div className="text-center py-12 text-zinc-500">Loading...</div>
  ) : (
    <div className="space-y-2">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <DataTable columns={columns} data={users} keyFn={(u) => u.id} emptyMessage="No users yet" />
      </div>

      {expandedUser && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Tenant Access</h3>
          {userTenants.length === 0 ? (
            <p className="text-xs text-zinc-500">No tenant access grants</p>
          ) : (
            <div className="space-y-1">
              {userTenants.map((ta) => (
                <div key={ta.customer_tenant_id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-zinc-300">{ta.display_name}</span>
                  <span className="text-xs text-zinc-500">granted by {ta.granted_by}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectTenantDialog({ onSubmit, onClose }: { onSubmit: (entraId: string, name: string) => void; onClose: () => void }) {
  const [entraId, setEntraId] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Connect Customer Tenant</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Entra Tenant ID</label>
            <input value={entraId} onChange={(e) => setEntraId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Display Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button onClick={() => entraId && onSubmit(entraId, name)} disabled={!entraId} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
