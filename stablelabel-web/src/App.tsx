import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from '@azure/msal-react';
import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import { ErrorProvider } from '@/contexts/ErrorContext';
import { useAuth } from '@/hooks/useAuth';
import { setTokenProvider } from '@/lib/api';
import AuditPage from '@/pages/AuditPage';
import AutoLabelPage from '@/pages/AutoLabelPage';
import DashboardPage from '@/pages/DashboardPage';
import ExplorerPage from '@/pages/ExplorerPage';
import JobsPage from '@/pages/JobsPage';
import LabelsPage from '@/pages/LabelsPage';
import LoginPage from '@/pages/LoginPage';
import PoliciesPage from '@/pages/PoliciesPage';
import ReportsPage from '@/pages/ReportsPage';
import SecurityPage from '@/pages/SecurityPage';
import SettingsPage from '@/pages/SettingsPage';

function AuthInit() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>

      <AuthInit />
      <AuthenticatedTemplate>
        <ErrorBoundary>
        <ErrorProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="auto-label" element={<AutoLabelPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="explorer" element={<ExplorerPage />} />
              <Route path="labels" element={<LabelsPage />} />
              <Route path="policies" element={<PoliciesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </ErrorProvider>
        </ErrorBoundary>
      </AuthenticatedTemplate>
    </BrowserRouter>
  );
}
