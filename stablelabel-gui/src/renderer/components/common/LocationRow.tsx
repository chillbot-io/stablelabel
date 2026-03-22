export default function LocationRow({ label, locations }: { label: string; locations: string[] | null }) {
  const items = locations?.filter(Boolean) ?? [];
  const isAll = items.length === 1 && items[0]?.toLowerCase() === 'all';

  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-zinc-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
      {items.length === 0 ? (
        <span className="text-xs text-zinc-600">Not configured</span>
      ) : isAll ? (
        <span className="text-xs text-emerald-400">All locations</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((loc) => (
            <span key={loc} className="text-xs px-1.5 py-0.5 bg-white/[0.06] text-zinc-300 rounded-lg">
              {loc}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
