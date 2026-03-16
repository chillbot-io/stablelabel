import React, { useState } from 'react';
import Sidebar from './components/Layout/Sidebar';
import TopBar from './components/Layout/TopBar';
import DashboardPage from './components/Dashboard/DashboardPage';
import LabelsPage from './components/Labels/LabelsPage';
import RetentionPage from './components/Retention/RetentionPage';
import DlpPage from './components/DLP/DlpPage';
import DocumentsPage from './components/Documents/DocumentsPage';
import ProtectionPage from './components/Protection/ProtectionPage';
import ElevationPage from './components/Elevation/ElevationPage';
import SnapshotsPage from './components/Snapshots/SnapshotsPage';
import AnalysisPage from './components/Analysis/AnalysisPage';
import TemplatesPage from './components/Templates/TemplatesPage';
import FileSharesPage from './components/FileShares/FileSharesPage';
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
      case 'retention':
        return <RetentionPage />;
      case 'dlp':
        return <DlpPage />;
      case 'documents':
        return <DocumentsPage />;
      case 'fileshares':
        return <FileSharesPage />;
      case 'protection':
        return <ProtectionPage />;
      case 'elevation':
        return <ElevationPage />;
      case 'snapshots':
        return <SnapshotsPage />;
      case 'analysis':
        return <AnalysisPage />;
      case 'templates':
        return <TemplatesPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className={`flex-1 overflow-auto ${currentPage === 'labels' || currentPage === 'retention' || currentPage === 'dlp' || currentPage === 'documents' || currentPage === 'protection' || currentPage === 'elevation' || currentPage === 'snapshots' || currentPage === 'analysis' || currentPage === 'fileshares' || currentPage === 'templates' ? '' : 'p-6'}`}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}