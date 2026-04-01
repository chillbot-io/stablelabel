import React from 'react';

export default function PropertyCard({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3">
      <dt className="text-xs text-zinc-500 mb-1">{label}</dt>
      <dd className={`text-sm text-zinc-200 flex items-center gap-2 ${mono ? 'font-mono text-xs' : ''}`}>
        {children}
        <span className="truncate" title={value}>{value}</span>
      </dd>
    </div>
  );
}
