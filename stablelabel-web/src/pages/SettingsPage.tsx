import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="p-6">
      <PageHeader title="Settings" description="Application configuration and preferences" />

      <div className="space-y-6 max-w-2xl">
        {/* Account info */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Account</h2>
          <div className="space-y-2 text-sm">
            <Row label="Email" value={user?.email ?? '--'} />
            <Row label="Display Name" value={user?.displayName ?? '--'} />
            <Row label="Role" value={user?.role ?? '--'} />
            <Row label="MSP Tenant" value={user?.mspTenantId ?? '--'} mono />
          </div>
        </section>

        {/* API info */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">API</h2>
          <div className="space-y-2 text-sm">
            <Row label="Backend URL" value={window.location.origin + '/api'} mono />
            <Row label="Auth Method" value="Entra ID (MSAL)" />
          </div>
        </section>

        {/* About */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">About</h2>
          <div className="space-y-2 text-sm">
            <Row label="Application" value="StableLabel" />
            <Row label="Version" value="0.1.0" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-zinc-300 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
