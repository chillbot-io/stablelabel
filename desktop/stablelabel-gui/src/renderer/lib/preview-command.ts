/**
 * Build a PowerShell command preview string for display in the UI.
 * This is a renderer-side approximation — the actual command is built
 * and validated server-side by cmdlet-registry.ts before execution.
 */
export function previewCommand(cmdlet: string, params: Record<string, unknown>): string {
  const parts: string[] = [cmdlet];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;

    if (typeof value === 'boolean') {
      if (value) parts.push(`-${key}`);
    } else if (Array.isArray(value)) {
      if (value.length > 0) {
        // Items array (bulk ops) or string array
        if (typeof value[0] === 'object') {
          const entries = value.map((item: Record<string, unknown>) =>
            `@{${Object.entries(item).map(([k, v]) => `${k}='${v}'`).join(';')}}`,
          );
          parts.push(`-${key} @(${entries.join(',')})`);
        } else {
          const items = value.map((v: unknown) => `'${String(v).replace(/'/g, "''")}'`);
          parts.push(`-${key} ${items.join(',')}`);
        }
      }
    } else {
      const s = String(value).replace(/'/g, "''");
      parts.push(`-${key} '${s}'`);
    }
  }

  return parts.join(' ');
}
