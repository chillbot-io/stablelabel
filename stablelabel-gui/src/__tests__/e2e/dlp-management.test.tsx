/**
 * E2E integration tests for DLP policy management flows.
 *
 * Verifies: list → view detail → parameterized invoke throughout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import DlpPage from '../../renderer/components/DLP/DlpPage';

const mockPolicies = [
  { Name: 'Credit Card DLP', Guid: 'dlp-1', Mode: 'Enable', Comment: 'Detects credit card numbers', WhenCreated: '2024-01-01T00:00:00Z', WhenChanged: '2024-06-01T00:00:00Z', ExchangeLocation: ['All'], SharePointLocation: ['All'], OneDriveLocation: ['All'], TeamsLocation: [] },
  { Name: 'SSN Protection', Guid: 'dlp-2', Mode: 'TestWithNotifications', Comment: null, WhenCreated: '2024-03-01T00:00:00Z', WhenChanged: '2024-06-01T00:00:00Z', ExchangeLocation: [], SharePointLocation: ['All'], OneDriveLocation: [], TeamsLocation: [] },
];

describe('DLP policy lifecycle (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays DLP policies', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLDlpPolicy') return { success: true, data: mockPolicies };
      return { success: true, data: null };
    });

    render(<DlpPage />);

    await waitFor(() => {
      expect(screen.getByText('Credit Card DLP')).toBeInTheDocument();
    });

    expect(screen.getByText('SSN Protection')).toBeInTheDocument();
  });

  it('views policy detail with parameterized invoke', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLDlpPolicy' && !params?.Identity) return { success: true, data: mockPolicies };
      if (cmdlet === 'Get-SLDlpPolicy' && params?.Identity) return { success: true, data: mockPolicies[0] };
      if (cmdlet === 'Get-SLDlpRule') return { success: true, data: [] };
      return { success: true, data: null };
    });

    render(<DlpPage />);

    await waitFor(() => {
      expect(screen.getByText('Credit Card DLP')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Credit Card DLP'));

    await waitFor(() => {
      const detailCall = mockInvoke.mock.calls.find(
        (c: unknown[]) => c[0] === 'Get-SLDlpPolicy' && (c[1] as Record<string, unknown>)?.Identity,
      );
      expect(detailCall).toBeDefined();
      expect(detailCall![1]).toEqual({ Identity: 'Credit Card DLP' });
    });
  });

  it('handles network error during policy list load', async () => {
    mockInvoke.mockImplementation(async () => {
      return { success: false, data: null, error: 'Network timeout' };
    });

    render(<DlpPage />);

    // Should render without crashing
    await waitFor(() => {
      expect(document.body.children.length).toBeGreaterThan(0);
    });
  });

  it('never sends raw command strings (injection prevention)', async () => {
    mockInvoke.mockImplementation(async () => {
      return { success: true, data: mockPolicies };
    });

    render(<DlpPage />);

    await waitFor(() => {
      expect(screen.getByText('Credit Card DLP')).toBeInTheDocument();
    });

    // Every invoke call must use structured format
    for (const call of mockInvoke.mock.calls) {
      const cmdlet = call[0] as string;
      expect(cmdlet).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
    }
  });

  it('navigates between Policies, Rules, and Info Types tabs', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLDlpPolicy') return { success: true, data: mockPolicies };
      if (cmdlet === 'Get-SLDlpRule') return { success: true, data: [] };
      if (cmdlet === 'Get-SLSensitiveInfoType') return { success: true, data: [] };
      return { success: true, data: null };
    });

    render(<DlpPage />);

    await waitFor(() => {
      expect(screen.getByText('Credit Card DLP')).toBeInTheDocument();
    });

    // Click Rules tab (use getAllByText since "Rules" may appear multiple places)
    const rulesButtons = screen.getAllByText('Rules');
    await user.click(rulesButtons[0]);

    // Click Info Types tab
    const infoButtons = screen.getAllByText('Info Types');
    await user.click(infoButtons[0]);

    // Verify all three section tabs exist
    expect(screen.getAllByText('Policies').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rules').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Info Types').length).toBeGreaterThan(0);
  });
});
