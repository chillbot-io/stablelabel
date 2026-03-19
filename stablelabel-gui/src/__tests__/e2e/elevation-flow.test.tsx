/**
 * E2E integration tests for elevation/privileged access flows.
 *
 * Verifies: status display, super user panel, site admin, PIM roles — all using structured invoke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import ElevationPage from '../../renderer/components/Elevation/ElevationPage';

function invokeCallFor(cmdlet: string) {
  return mockInvoke.mock.calls.find((c: unknown[]) => c[0] === cmdlet);
}

describe('Elevation page lifecycle (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLElevationStatus') return { success: true, data: { Active: false, ExpiresAt: null } };
      if (cmdlet === 'Get-SLSuperUserStatus') return { success: true, data: { Enabled: false, SuperUsers: [] } };
      return { success: true, data: null };
    });
  });

  it('renders elevation page with all section tabs', async () => {
    render(<ElevationPage />);

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Super User')).toBeInTheDocument();
    expect(screen.getByText('Site Admin')).toBeInTheDocument();
    expect(screen.getByText('Mailbox')).toBeInTheDocument();
    expect(screen.getByText('PIM Roles')).toBeInTheDocument();
    expect(screen.getByText('Elevated Jobs')).toBeInTheDocument();
  });

  it('loads elevation status on mount (Status panel is default)', async () => {
    render(<ElevationPage />);

    await waitFor(() => {
      expect(invokeCallFor('Get-SLElevationStatus')).toBeDefined();
    });
  });

  it('navigates to Super User section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));

    await waitFor(() => {
      expect(invokeCallFor('Get-SLSuperUserStatus')).toBeDefined();
    });
  });

  it('navigates to Site Admin section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Site Admin'));

    // Site Admin panel should render
    await waitFor(() => {
      expect(screen.getByText('SharePoint site admin rights')).toBeInTheDocument();
    });
  });

  it('navigates to PIM Roles section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('PIM Roles'));

    await waitFor(() => {
      expect(screen.getByText('Entra ID role activation')).toBeInTheDocument();
    });
  });

  it('all invoke calls use clean cmdlet names (no injection vectors)', async () => {
    render(<ElevationPage />);

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(0);
    });

    for (const call of mockInvoke.mock.calls) {
      const cmdlet = call[0] as string;
      // Cmdlet names must be clean Verb-SLNoun format
      expect(cmdlet).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
    }
  });

  it('handles elevation status error gracefully without crashing', async () => {
    mockInvoke.mockImplementation(async () => {
      return { success: false, data: null, error: 'Not connected to Protection service' };
    });

    render(<ElevationPage />);

    // All section tabs should still render
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Elevation')).toBeInTheDocument();
    expect(screen.getByText('Super User')).toBeInTheDocument();
    expect(screen.getByText('Site Admin')).toBeInTheDocument();
  });

  it('Status section is visually highlighted as active by default', () => {
    render(<ElevationPage />);

    const statusButton = screen.getByText('Status').closest('button');
    expect(statusButton?.className).toContain('border-yellow-400');
  });
});
