import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from '@azure/msal-react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import { ErrorProvider } from '@/contexts/ErrorContext';
import AuditPage from '@/pages/AuditPage';
import DashboardPage from '@/pages/DashboardPage';
import ExplorerPage from '@/pages/ExplorerPage';
import JobsPage from '@/pages/JobsPage';
import LabelsPage from '@/pages/LabelsPage';
import LoginPage from '@/pages/LoginPage';
import PoliciesPage from '@/pages/PoliciesPage';
import ReportsPage from '@/pages/ReportsPage';
import SecurityPage from '@/pages/SecurityPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>

      <AuthenticatedTemplate>
        <ErrorProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
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
      </AuthenticatedTemplate>
    </BrowserRouter>
  );
}
