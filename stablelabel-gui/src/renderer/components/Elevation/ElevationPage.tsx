import React, { useState } from 'react';
import ElevationStatusPanel from './ElevationStatusPanel';
import SuperUserPanel from './SuperUserPanel';
import SiteAdminPanel from './SiteAdminPanel';
import MailboxAccessPanel from './MailboxAccessPanel';
import PimRolePanel from './PimRolePanel';
import ElevatedJobPanel from './ElevatedJobPanel';

type Section = 'status' | 'superuser' | 'siteadmin' | 'mailbox' | 'pim' | 'jobs';

const sections: Array<{ id: Section; label: string; description: string }> = [
  { id: 'status', label: 'Status', description: 'Current elevation state' },
  { id: 'jobs', label: 'Elevated Jobs', description: 'Start / stop orchestrated jobs' },
  { id: 'superuser', label: 'Super User', description: 'AIP content decryption' },
  { id: 'siteadmin', label: 'Site Admin', description: 'SharePoint site admin rights' },
  { id: 'mailbox', label: 'Mailbox', description: 'Exchange mailbox access' },
  { id: 'pim', label: 'PIM Roles', description: 'Entra ID role activation' },
];

export default function ElevationPage() {
  const [active, setActive] = useState<Section>('status');

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Elevation</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">Just-in-time privilege management</p>
        </div>
        <div className="flex-1 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${active === s.id ? 'bg-gray-800 border-l-2 border-yellow-400' : 'hover:bg-gray-800/50 border-l-2 border-transparent'}`}
            >
              <div className="text-sm text-gray-200">{s.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-800">
          <div className="text-[10px] text-gray-600 space-y-1">
            <p>All operations are audit-logged.</p>
            <p>Use Dry Run before applying.</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        {active === 'status' && <ElevationStatusPanel />}
        {active === 'jobs' && <ElevatedJobPanel />}
        {active === 'superuser' && <SuperUserPanel />}
        {active === 'siteadmin' && <SiteAdminPanel />}
        {active === 'mailbox' && <MailboxAccessPanel />}
        {active === 'pim' && <PimRolePanel />}
      </div>
    </div>
  );
}
