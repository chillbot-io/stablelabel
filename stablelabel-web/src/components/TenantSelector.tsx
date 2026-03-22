/** Tenant dropdown selector — used on most pages. */

import type { CustomerTenant } from '@/lib/types';

interface Props {
  tenants: CustomerTenant[];
  selected: CustomerTenant | null;
  onSelect: (t: CustomerTenant) => void;
}

export default function TenantSelector({ tenants, selected, onSelect }: Props) {
  return (
    <select
      value={selected?.id ?? ''}
      onChange={(e) => {
        const t = tenants.find((t) => t.id === e.target.value);
        if (t) onSelect(t);
      }}
      className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {tenants.filter((t) => t.consent_status === 'active').map((t) => (
        <option key={t.id} value={t.id}>
          {t.display_name || t.entra_tenant_id}
        </option>
      ))}
    </select>
  );
}
