import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectionDialog from '../../renderer/components/Connection/ConnectionDialog';
import { mockInvoke } from '../setup';

describe('ConnectionDialog', () => {
  const onClose = vi.fn();
  const onConnected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title and sign-in button', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByText('Connect to StableLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByText(/Sign in with your Microsoft account/)).toBeInTheDocument();
  });

  it('displays role and prerequisite requirements', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByText('Before you connect')).toBeInTheDocument();
    expect(screen.getByText(/PowerShell 7\+/)).toBeInTheDocument();
    expect(screen.getByText(/Global Administrator/)).toBeInTheDocument();
    expect(screen.getByText(/Compliance Administrator/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes Connect-SLAll when sign-in button is clicked', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        Status: 'Connected',
        UserPrincipalName: 'admin@contoso.com',
        TenantId: 'abc123',
        Steps: [],
      },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} onConnected={onConnected} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    expect(mockInvoke).toHaveBeenCalledWith('Connect-SLAll', { UseDeviceCode: true });
  });

  it('shows connected state on success', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        Status: 'Connected',
        UserPrincipalName: 'admin@contoso.com',
        TenantId: 'abc123',
        Steps: [
          { Step: 'Prereq', Module: 'Microsoft.Graph.Authentication', Status: 'AlreadyInstalled', Version: '2.10.0' },
          { Step: 'Graph', Status: 'Connected', UPN: 'admin@contoso.com' },
          { Step: 'Compliance', Status: 'Connected' },
        ],
      },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} onConnected={onConnected} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    await waitFor(() => {
      expect(screen.getByText('Connected successfully')).toBeInTheDocument();
    });
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
    expect(onConnected).toHaveBeenCalled();
  });

  it('saves connection info to encrypted preferences on success', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        Status: 'Connected',
        UserPrincipalName: 'admin@contoso.com',
        TenantId: 'tenant-abc',
        Steps: [],
      },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} onConnected={onConnected} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    await waitFor(() => {
      expect(screen.getByText('Connected successfully')).toBeInTheDocument();
    });

    // Connection info saved via encrypted preferences, not localStorage
    expect(window.stablelabel.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        lastConnection: expect.objectContaining({
          upn: 'admin@contoso.com',
          tenantId: 'tenant-abc',
        }),
      }),
    );
  });

  it('displays last session info when available in preferences', async () => {
    (window.stablelabel.getPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      lastConnection: {
        upn: 'user@contoso.com',
        tenantId: 'abc-123-def',
        connectedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    render(<ConnectionDialog onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Last session')).toBeInTheDocument();
    });
    expect(screen.getByText('user@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('abc-123-def')).toBeInTheDocument();
  });

  it('displays error when connection fails', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        Status: 'Failed',
        Stage: 'Graph',
        Error: 'Auth failed',
        Steps: [{ Step: 'Graph', Status: 'Failed', Error: 'Auth failed' }],
      },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    await waitFor(() => {
      expect(screen.getByText('Auth failed')).toBeInTheDocument();
    });
  });

  it('shows Try Again button after failure and returns to idle', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { Status: 'Failed', Stage: 'Graph', Error: 'Timeout', Steps: [] },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Try Again'));
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeInTheDocument();
  });

  it('shows connecting text while in progress', async () => {
    let resolveInvoke: (v: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => { resolveInvoke = resolve; })
    );
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    expect(screen.getByText('Preparing authentication...')).toBeInTheDocument();

    resolveInvoke!({
      success: true,
      data: { Status: 'Connected', Steps: [] },
    });
  });

  it('shows step details for prerequisites', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        Status: 'Connected',
        UserPrincipalName: 'user@test.com',
        Steps: [
          { Step: 'Prereq', Module: 'Microsoft.Graph.Authentication', Status: 'AlreadyInstalled', Version: '2.15.0' },
          { Step: 'Prereq', Module: 'ExchangeOnlineManagement', Status: 'Installed', Version: '3.2.0' },
          { Step: 'Graph', Status: 'Connected', UPN: 'user@test.com' },
          { Step: 'Compliance', Status: 'Connected' },
        ],
      },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));

    await waitFor(() => {
      expect(screen.getByText(/Microsoft.Graph.Authentication v2.15.0/)).toBeInTheDocument();
    });
    expect(screen.getByText(/ExchangeOnlineManagement \(installed\)/)).toBeInTheDocument();
    expect(screen.getByText(/Microsoft Graph — user@test.com/)).toBeInTheDocument();
    expect(screen.getByText('Security & Compliance')).toBeInTheDocument();
  });
});
