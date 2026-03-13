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
      case 'protection':
        return <ProtectionPage />;
      case 'elevation':
        return <ElevationPage />;
      case 'snapshots':
        return <SnapshotsPage />;
      case 'analysis':
        return <AnalysisPage />;
      case 'templates':
        return <PlaceholderPage title="Templates" description="Pre-built compliance templates for guided setup" />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className={`flex-1 overflow-auto ${currentPage === 'labels' || currentPage === 'retention' || currentPage === 'dlp' || currentPage === 'documents' || currentPage === 'protection' || currentPage === 'elevation' || currentPage === 'snapshots' || currentPage === 'analysis' ? '' : 'p-6'}`}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-200 mb-2">{title}</h1>
        <p className="text-gray-500">{description}</p>
        <p className="text-gray-600 mt-4 text-sm">Coming in next phase</p>
      </div>
    </div>
  );
}
