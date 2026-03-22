/**
 * App shell — sidebar + topbar + routed content area.
 * Matches the dark zinc theme from the Electron app.
 */

import {
  BarChart3,
  FileSearch,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Shield,
  Tags,
  Workflow,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  minRole?: 'Admin' | 'Operator' | 'Viewer';
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} /> },
  { label: 'Jobs', path: '/jobs', icon: <Workflow size={18} /> },
  { label: 'Explorer', path: '/explorer', icon: <FolderOpen size={18} /> },
  { label: 'Labels', path: '/labels', icon: <Tags size={18} /> },
  { label: 'Policies', path: '/policies', icon: <FileSearch size={18} /> },
  { label: 'Reports', path: '/reports', icon: <BarChart3 size={18} /> },
  { label: 'Audit Log', path: '/audit', icon: <ScrollText size={18} /> },
  {
    label: 'Security',
    path: '/security',
    icon: <Shield size={18} />,
    minRole: 'Admin',
  },
  { label: 'Settings', path: '/settings', icon: <Settings size={18} /> },
];

const ROLE_LEVEL: Record<string, number> = { Admin: 3, Operator: 2, Viewer: 1 };

export default function Layout() {
  const { user, logout } = useAuth();
  const userLevel = ROLE_LEVEL[user?.role ?? 'Viewer'] ?? 1;

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-zinc-800">
          <span className="text-sm font-semibold tracking-tight">StableLabel</span>
        </div>

        <nav className="flex-1 py-2 space-y-0.5 px-2">
          {navItems
            .filter((item) => !item.minRole || userLevel >= (ROLE_LEVEL[item.minRole] ?? 0))
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-zinc-800 p-3">
          <div className="text-xs text-zinc-400 truncate">{user?.email}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-zinc-500">{user?.role}</span>
            <button
              onClick={() => logout()}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
