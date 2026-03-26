/** Reusable data table with dark theme styling. */

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T) => string;
  emptyMessage?: string;
}

export default function DataTable<T>({ columns, data, keyFn, emptyMessage }: Props<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 text-sm">
        {emptyMessage ?? 'No data'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left py-2 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={keyFn(row)} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              {columns.map((col) => (
                <td key={col.key} className={`py-2.5 px-3 text-zinc-300 ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { Column };
