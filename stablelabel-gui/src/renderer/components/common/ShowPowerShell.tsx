import React, { useState } from 'react';
import { previewCommand } from '../../lib/preview-command';

interface ShowPowerShellProps {
  cmdlet: string;
  params: Record<string, unknown>;
}

export default function ShowPowerShell({ cmdlet, params }: ShowPowerShellProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const command = previewCommand(cmdlet, params);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        type="button"
      >
        {open ? 'Hide' : 'Show'} PowerShell
      </button>
      {open && (
        <div className="mt-2 relative group">
          <pre className="p-3 bg-zinc-950 border border-white/[0.06] rounded-lg text-[11px] text-blue-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {command}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-200 bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            type="button"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
