/**
 * E2E tests for full-app navigation and page routing.
 *
 * Verifies: sidebar navigation → all 11 pages render → full-bleed layout → Suspense loading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke, mockCheckPwsh, mockGetStatus } from '../setup';

import App from '../../renderer/App';

describe('Navigation and routing (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPwsh.mockResolvedValue({ available: true, path: '/usr/bin/pwsh' });
    mockGetStatus.mockResolvedValue({ initialized: true, modulePath: '/path' });

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') {
        return {
          success: true,
          data: {
            GraphConnected: true, ComplianceConnected: true, ProtectionConnected: true,
            UserPrincipalName: 'user@contoso.com', TenantId: 'tenant-id',
          },
        };
      }
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      if (cmdlet === 'Get-SLSiteList') return { success: true, data: { Sites: [] } };
      return { success: true, data: [] };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders app shell with sidebar and top bar', async () => {
    render(<App />);

    expect(screen.getByText('StableLabel')).toBeInTheDocument();
    // TopBar shows connection indicators
    expect(screen.getByText('Graph')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('Protection')).toBeInTheDocument();
  });

  it('starts on Dashboard page by default', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    });

    // Dashboard title renders inside the page
    await waitFor(() => {
      expect(screen.getByText('Sensitivity label overview')).toBeInTheDocument();
    });
  });

  // Sidebar labels match actual navItems in Sidebar.tsx
  const sidebarPages = [
    { buttonName: 'Dashboard', expectedText: 'Sensitivity label overview' },
    { buttonName: 'Labels', expectedText: 'Select an item or create new' },
    { buttonName: 'Documents', expectedText: 'Document Labels' },
    { buttonName: 'CSV Upload', expectedText: 'Manual Label' },
    { buttonName: 'Bulk Removal', expectedText: 'Bulk Operations' },
    { buttonName: 'Explorer', expectedText: 'Browse SharePoint & OneDrive' },
    { buttonName: 'Snapshots', expectedText: 'Capture, compare, and restore tenant config' },
    { buttonName: 'Analysis', expectedText: 'Label reports and diagnostics' },
    { buttonName: 'Classification', expectedText: 'Data Classification' },
    { buttonName: 'Audit Log', expectedText: 'Full history of operations' },
    { buttonName: 'Settings', expectedText: 'Application preferences and diagnostics' },
  ];

  for (const { buttonName, expectedText } of sidebarPages) {
    it(`navigates to ${buttonName} page`, async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: buttonName })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: buttonName }));

      await waitFor(() => {
        expect(screen.getByText(new RegExp(expectedText))).toBeInTheDocument();
      });
    });
  }

  it('navigates between pages without losing sidebar state', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Settings
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByText('Application preferences and diagnostics')).toBeInTheDocument();
    });

    // Navigate back to Dashboard
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));

    await waitFor(() => {
      expect(screen.getByText('Sensitivity label overview')).toBeInTheDocument();
    });

    // Sidebar should still have all buttons
    expect(screen.getByRole('button', { name: 'Labels' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('full-bleed pages do not have padding', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Labels is a full-bleed page
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Labels' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Labels' }));

    await waitFor(() => {
      expect(screen.getByText('Select an item or create new')).toBeInTheDocument();
    });

    // The main element should NOT have p-6 class for full-bleed pages
    const main = document.querySelector('main');
    expect(main?.className).not.toContain('p-6');
  });

  it('non-full-bleed pages have padding', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Settings is not a full-bleed page
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByText('Application preferences and diagnostics')).toBeInTheDocument();
    });

    const main = document.querySelector('main');
    expect(main?.className).toContain('p-6');
  });

  it('rapid navigation does not crash', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Labels' })).toBeInTheDocument();
    });

    // Rapid fire navigation
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.click(screen.getByRole('button', { name: 'Documents' }));
    await user.click(screen.getByRole('button', { name: 'CSV Upload' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));

    // Should end up on Dashboard
    await waitFor(() => {
      expect(screen.getByText('Sensitivity label overview')).toBeInTheDocument();
    });
  });
});
