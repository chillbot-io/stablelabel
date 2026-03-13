import React, { useState } from 'react';
import DocumentLabelLookup from './DocumentLabelLookup';
import DocumentLabelApply from './DocumentLabelApply';
import DocumentLabelRemove from './DocumentLabelRemove';
import DocumentLabelBulk from './DocumentLabelBulk';

type Section = 'lookup' | 'apply' | 'remove' | 'bulk';

const sections: Array<{ id: Section; label: string; description: string; color: string }> = [
  { id: 'lookup', label: 'Look Up', description: 'Extract the current sensitivity label from a document', color: 'blue' },
  { id: 'apply', label: 'Apply', description: 'Assign a sensitivity label to a document', color: 'green' },
  { id: 'remove', label: 'Remove', description: 'Remove the sensitivity label from a document', color: 'red' },
  { id: 'bulk', label: 'Bulk Apply', description: 'Assign a label to multiple documents at once', color: 'purple' },
];

export default function DocumentsPage() {
  const [active, setActive] = useState<Section>('lookup');

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Document Labels</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">Graph API operations on individual files</p>
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
            <p>Requires Graph API connection.</p>
            <p>Use Drive ID + Item ID from SharePoint/OneDrive.</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        {active === 'lookup' && <DocumentLabelLookup />}
        {active === 'apply' && <DocumentLabelApply />}
        {active === 'remove' && <DocumentLabelRemove />}
        {active === 'bulk' && <DocumentLabelBulk />}
      </div>
    </div>
  );
}
