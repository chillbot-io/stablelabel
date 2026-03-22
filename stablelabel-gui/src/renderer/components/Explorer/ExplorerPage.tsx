import React, { useState, useCallback } from 'react';
import SiteTreePanel from './SiteTreePanel';
import FileListPanel from './FileListPanel';
import ContentViewerPanel from './ContentViewerPanel';

export interface DriveLocation {
  driveId: string;
  itemId?: string;
  path: string[];
}

export interface FileItem {
  Id: string;
  Name: string;
  IsFolder: boolean;
  Size: number | null;
  MimeType: string | null;
  ChildCount: number | null;
  LastModified: string;
  ModifiedBy: string | null;
  DriveId: string;
}

export default function ExplorerPage() {
  const [location, setLocation] = useState<DriveLocation | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ driveId: string; itemId: string; name: string } | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  const handleNavigate = useCallback((loc: DriveLocation) => {
    setLocation(loc);
    setSelectedFile(null);
    setShowViewer(false);
  }, []);

  const handleViewFile = useCallback((driveId: string, itemId: string, name: string) => {
    setSelectedFile({ driveId, itemId, name });
    setShowViewer(true);
  }, []);

  return (
    <div className="flex h-full">
      {/* Left: Site/Drive tree */}
      <SiteTreePanel onNavigate={handleNavigate} currentLocation={location} />

      {/* Center: File list */}
      <div className={`flex-1 flex flex-col overflow-hidden border-r border-white/[0.06] ${showViewer ? '' : ''}`}>
        {location ? (
          <FileListPanel
            location={location}
            onNavigate={handleNavigate}
            onViewFile={handleViewFile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-zinc-500 text-sm">Select a site or drive to browse files</p>
              <p className="text-zinc-600 text-xs mt-1">Use the tree panel on the left to navigate</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Content viewer (slide-out) */}
      {showViewer && selectedFile && (
        <ContentViewerPanel
          driveId={selectedFile.driveId}
          itemId={selectedFile.itemId}
          fileName={selectedFile.name}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  );
}
