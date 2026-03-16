import React, { useState } from 'react';

type Format = 'json' | 'csv';

interface ExportButtonProps {
  data: unknown;
  filename: string;
  csvHeaders?: string[];
  csvRowMapper?: (item: unknown) => string[];
  label?: string;
}

export default function ExportButton({ data, filename, csvHeaders, csvRowMapper, label = 'Export' }: ExportButtonProps) {
  const [format, setFormat] = useState<Format>('json');

  const handleExport = () => {
    let content: string;
    let mime: string;
    let ext: string;

    if (format === 'csv' && csvHeaders && csvRowMapper && Array.isArray(data)) {
      const rows = data.map(csvRowMapper);
      content = [csvHeaders.join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n');
      mime = 'text/csv';
      ext = 'csv';
    } else {
      content = JSON.stringify(data, null, 2);
      mime = 'application/json';
      ext = 'json';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showFormatPicker = csvHeaders && csvRowMapper && Array.isArray(data);

  return (
    <span className="inline-flex items-center gap-1">
      {showFormatPicker && (
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
          className="px-1.5 py-1 text-[10px] bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none"
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      )}
      <button
        onClick={handleExport}
        className="px-2.5 py-1 text-[10px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors"
      >
        {label}
      </button>
    </span>
  );
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
