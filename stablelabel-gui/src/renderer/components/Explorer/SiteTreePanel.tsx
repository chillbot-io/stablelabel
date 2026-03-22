import React, { useState, useEffect, useCallback } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { TextField } from '../common/FormFields';
import type { DriveLocation } from './ExplorerPage';

interface Site {
  Id: string;
  DisplayName: string;
  Name: string;
  WebUrl: string;
}

interface SiteTreePanelProps {
  onNavigate: (loc: DriveLocation) => void;
  currentLocation: DriveLocation | null;
}

export default function SiteTreePanel({ onNavigate, currentLocation }: SiteTreePanelProps) {
  const { invoke } = usePowerShell();
  const [search, setSearch] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<{ Sites: Site[] }>('Get-SLSiteList', {
        Search: query || '*',
      });
      if (r.success && r.data) {
        setSites(r.data.Sites || []);
      } else {
        setError(r.error ?? 'Failed to load sites');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setLoading(false);
  }, [invoke]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleSearch = () => {
    fetchSites(search.trim() || undefined);
  };

  const handleSiteClick = (site: Site) => {
    onNavigate({
      driveId: '', // Will be resolved by Get-SLDriveChildren using SiteId
      itemId: undefined,
      path: [site.DisplayName],
    });
    // We pass siteId through a custom attribute on the location
    // The FileListPanel will handle the site → drive resolution
    onNavigate({
      driveId: `site:${site.Id}`,
      itemId: undefined,
      path: [site.DisplayName],
    });
  };

  return (
    <div className="w-60 flex-shrink-0 border-r border-white/[0.06] bg-zinc-950 flex flex-col">
      <div className="p-3 border-b border-white/[0.06]">
        <h2 className="text-sm font-semibold text-zinc-300">Explorer</h2>
        <p className="text-[10px] text-zinc-500 mt-0.5">Browse SharePoint & OneDrive</p>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-white/[0.06]">
        <div className="flex gap-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search sites..."
            className="flex-1 px-2 py-1.5 text-xs bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg transition-colors"
          >
            {loading ? '...' : 'Go'}
          </button>
        </div>
      </div>

      {/* Site list */}
      <div className="flex-1 overflow-y-auto py-1">
        {error && (
          <div className="px-3 py-2 text-xs text-red-400">{error}</div>
        )}

        {loading && sites.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-600">Loading sites...</div>
        )}

        {!loading && sites.length === 0 && !error && (
          <div className="px-3 py-4 text-xs text-zinc-600">No sites found</div>
        )}

        {sites.map((site) => {
          const isActive = currentLocation?.path[0] === site.DisplayName;
          return (
            <button
              key={site.Id}
              onClick={() => handleSiteClick(site)}
              className={`w-full text-left px-3 py-2 transition-colors ${
                isActive
                  ? 'bg-blue-500/[0.08] border-l-2 border-blue-400'
                  : 'hover:bg-white/[0.04] border-l-2 border-transparent'
              }`}
            >
              <div className="text-xs text-zinc-200 truncate">{site.DisplayName}</div>
              <div className="text-[10px] text-zinc-600 truncate mt-0.5">{site.WebUrl}</div>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-white/[0.06]">
        <div className="text-[10px] text-zinc-600">
          <p>{sites.length} sites loaded</p>
        </div>
      </div>
    </div>
  );
}
