/** Colored status badge for job states, consent status, etc. */

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-900/50 text-green-400 border-green-800',
  active: 'bg-green-900/50 text-green-400 border-green-800',
  running: 'bg-blue-900/50 text-blue-400 border-blue-800',
  enumerating: 'bg-blue-900/50 text-blue-400 border-blue-800',
  pending: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  paused: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
  failed: 'bg-red-900/50 text-red-400 border-red-800',
  rolled_back: 'bg-orange-900/50 text-orange-400 border-orange-800',
  revoked: 'bg-red-900/50 text-red-400 border-red-800',
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${style}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
