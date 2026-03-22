import React, { useState } from 'react';
import ErrorBoundary from './components/common/ErrorBoundary';
import Sidebar from './components/Layout/Sidebar';
import TopBar from './components/Layout/TopBar';
import DashboardPage from './components/Dashboard/DashboardPage';
import LabelsPage from './components/Labels/LabelsPage';
import DocumentsPage from './components/Documents/DocumentsPage';
import SnapshotsPage from './components/Snapshots/SnapshotsPage';
import AnalysisPage from './components/Analysis/AnalysisPage';
import SettingsPage from './components/Settings/SettingsPage';
import type { Page } from './lib/types';

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
      case 'snapshots':
        return <SnapshotsPage />;
      case 'analysis':
        return <AnalysisPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className={`flex-1 overflow-auto ${currentPage === 'labels' || currentPage === 'documents' || currentPage === 'snapshots' || currentPage === 'analysis' ? '' : 'p-6'}`}>
            {renderPage()}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
