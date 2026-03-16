import React, { useState } from 'react';
import FileShareConnect from './FileShareConnect';
import FileShareInventory from './FileShareInventory';
import FileShareScan from './FileShareScan';
import FileShareLabelApply from './FileShareLabelApply';
import FileShareLabelRemove from './FileShareLabelRemove';
import FileShareLabelBulk from './FileShareLabelBulk';

type Section = 'connect' | 'inventory' | 'scan' | 'apply' | 'remove' | 'bulk';

const sections: Array<{ id: Section; label: string; description: string; color: string }> = [
  { id: 'connect', label: 'Connect', description: 'Mount or disconnect CIFS/SMB shares', color: 'blue' },
  { id: 'inventory', label: 'Inventory', description: 'Browse files and label status', color: 'cyan' },
  { id: 'scan', label: 'Scan', description: 'Scan for sensitive content', color: 'yellow' },
  { id: 'apply', label: 'Apply Label', description: 'Apply a sensitivity label to a file', color: 'green' },
  { id: 'remove', label: 'Remove Label', description: 'Remove the label from a file', color: 'red' },
  { id: 'bulk', label: 'Bulk Apply', description: 'Apply labels to multiple files at once', color: 'purple' },
];

export default function FileSharesPage() {
  const [active, setActive] = useState<Section>('connect');

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">File Shares</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">AIPService operations on CIFS/SMB shares</p>
        </div>
        <div className="flex-1 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${active === s.id ? 'bg-gray-800 border-l-2 border-blue-400' : 'hover:bg-gray-800/50 border-l-2 border-transparent'}`}
            >
              <div className="text-sm text-gray-200">{s.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-800">
          <div className="text-[10px] text-gray-600 space-y-1">
            <p>Requires AIPService (Windows only).</p>
            <p>Connect to a share before scanning or labeling.</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        {active === 'connect' && <FileShareConnect />}
        {active === 'inventory' && <FileShareInventory />}
        {active === 'scan' && <FileShareScan />}
        {active === 'apply' && <FileShareLabelApply />}
        {active === 'remove' && <FileShareLabelRemove />}
        {active === 'bulk' && <FileShareLabelBulk />}
      </div>
    </div>
  );
}
