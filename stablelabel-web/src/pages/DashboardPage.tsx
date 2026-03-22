import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>
      <p className="text-zinc-400">
        Welcome back, {user?.displayName}. Select a tenant to get started.
      </p>

      {/* TODO: tenant selector, job summary cards, recent activity */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <div className="text-sm text-zinc-400">Connected Tenants</div>
          <div className="text-2xl font-semibold mt-1">--</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <div className="text-sm text-zinc-400">Active Jobs</div>
          <div className="text-2xl font-semibold mt-1">--</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <div className="text-sm text-zinc-400">Files Labelled Today</div>
          <div className="text-2xl font-semibold mt-1">--</div>
        </div>
      </div>
    </div>
  );
}
