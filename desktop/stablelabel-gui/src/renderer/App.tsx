import React, { useState, Suspense, lazy } from 'react';
import ErrorBoundary from './components/common/ErrorBoundary';
import Sidebar from './components/Layout/Sidebar';
import TopBar from './components/Layout/TopBar';
import type { Page } from './lib/types';

// Lazy-load page components — only the active page is loaded
const DashboardPage = lazy(() => import('./components/Dashboard/DashboardPage'));
const LabelsPage = lazy(() => import('./components/Labels/LabelsPage'));
const DocumentsPage = lazy(() => import('./components/Documents/DocumentsPage'));
const ManualLabelPage = lazy(() => import('./components/ManualLabel/ManualLabelPage'));
const BulkOpsPage = lazy(() => import('./components/BulkOps/BulkOpsPage'));
const AutoLabelScanPage = lazy(() => import('./components/AutoScan/AutoLabelScanPage'));
const ExplorerPage = lazy(() => import('./components/Explorer/ExplorerPage'));
const SnapshotsPage = lazy(() => import('./components/Snapshots/SnapshotsPage'));
const AnalysisPage = lazy(() => import('./components/Analysis/AnalysisPage'));
const ClassificationPage = lazy(() => import('./components/Classification/ClassificationPage'));
const AuditLogPage = lazy(() => import('./components/AuditLog/AuditLogPage'));
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage'));

function PageLoader() {
  return <div className="p-6"><div className="h-32 bg-white/[0.06] rounded-lg animate-pulse" /></div>;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'labels':
        return <LabelsPage />;
      case 'documents':
        return <DocumentsPage />;
      case 'manual-label':
        return <ManualLabelPage />;
      case 'bulk-ops':
        return <BulkOpsPage />;
      case 'auto-scan':
        return <AutoLabelScanPage />;
      case 'explorer':
        return <ExplorerPage />;
      case 'snapshots':
        return <SnapshotsPage />;
      case 'analysis':
        return <AnalysisPage />;
      case 'classification':
        return <ClassificationPage />;
      case 'audit-log':
        return <AuditLogPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setCurrentPage} />;
    }
  };

  const fullBleedPages: Page[] = ['labels', 'documents', 'explorer', 'snapshots', 'analysis'];

  return (
    <ErrorBoundary>
      <div className="flex h-screen">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className={`flex-1 overflow-auto ${fullBleedPages.includes(currentPage) ? '' : 'p-6'}`}>
            <Suspense fallback={<PageLoader />}>
              {renderPage()}
            </Suspense>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
