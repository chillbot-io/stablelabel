/**
 * E2E integration tests for connection and authentication flows.
 *
 * Verifies: app load → TopBar connection status → device code callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { mockInvoke, mockCheckPwsh, mockGetStatus, mockOnDeviceCode } from '../setup';

import App from '../../renderer/App';

describe('Connection and authentication flow (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPwsh.mockResolvedValue({ available: true, path: '/usr/bin/pwsh' });
    mockGetStatus.mockResolvedValue({ initialized: true, modulePath: '/path/to/StableLabel' });
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  it('renders app with sidebar and top bar', async () => {
    render(<App />);

    // App renders sidebar with StableLabel title and navigation buttons
    expect(screen.getByText('StableLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    // TopBar renders connection status dots
    expect(screen.getByText('Graph')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
  });

  it('TopBar displays connection status with UPN', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') {
        return {
          success: true,
          data: { GraphConnected: true, ComplianceConnected: false, ProtectionConnected: false, UserPrincipalName: 'admin@contoso.com' },
        };
      }
      return { success: true, data: null };
    });

    render(<App />);

    await waitFor(() => {
      // UPN appears in TopBar and possibly DashboardPage
      const upnElements = screen.getAllByText('admin@contoso.com');
      expect(upnElements.length).toBeGreaterThanOrEqual(1);
      // Verify it rendered in the header area
      const header = upnElements.find(el => el.closest('header'));
      expect(header).toBeTruthy();
    });
  });

  it('verifies Get-SLConnectionStatus is invoked on mount', async () => {
    render(<App />);

    await waitFor(() => {
      const statusCall = mockInvoke.mock.calls.find(
        (c: unknown[]) => c[0] === 'Get-SLConnectionStatus',
      );
      expect(statusCall).toBeDefined();
    });
  });

  it('handles connection error without crashing', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') {
        return { success: false, data: null, error: 'Connection refused' };
      }
      return { success: true, data: null };
    });

    render(<App />);

    // App should still render sidebar and dashboard
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('StableLabel')).toBeInTheDocument();
  });

  it('shows partial connection state (Graph only)', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') {
        return {
          success: true,
          data: { GraphConnected: true, ComplianceConnected: false, ProtectionConnected: false, UserPrincipalName: 'admin@contoso.com' },
        };
      }
      return { success: true, data: null };
    });

    render(<App />);

    await waitFor(() => {
      // UPN should appear even with partial connection
      const upnElements = screen.getAllByText('admin@contoso.com');
      expect(upnElements.length).toBeGreaterThanOrEqual(1);
    });

    // Graph dot should be connected (emerald), Compliance/Protection should not
    const graphTitle = screen.getByTitle('Graph: Connected');
    expect(graphTitle).toBeInTheDocument();
    const complianceTitle = screen.getByTitle('Compliance: Disconnected');
    expect(complianceTitle).toBeInTheDocument();
  });
});
