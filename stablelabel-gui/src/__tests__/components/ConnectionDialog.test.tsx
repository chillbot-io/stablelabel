import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectionDialog from '../../renderer/components/Connection/ConnectionDialog';
import { mockInvoke } from '../setup';

describe('ConnectionDialog', () => {
  const onClose = vi.fn();
  const onConnected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and connect button', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByText('Connect to StableLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByText(/Installs prerequisites/)).toBeInTheDocument();
  });

  it('renders the Tenant ID input field', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByLabelText(/Tenant ID/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/contoso.onmicrosoft.com/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes Connect-SLAll with -UseDeviceCode when connect button is clicked', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(mockInvoke).toHaveBeenCalledWith('Connect-SLAll -UseDeviceCode');
  });

  it('passes TenantId when provided', async () => {
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

    await user.type(screen.getByLabelText(/Tenant ID/), 'contoso.onmicrosoft.com');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(mockInvoke).toHaveBeenCalledWith(
      "Connect-SLAll -TenantId 'contoso.onmicrosoft.com' -UseDeviceCode"
    );
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

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText('Connected successfully')).toBeInTheDocument();
    });
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
    expect(onConnected).toHaveBeenCalled();
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

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText('Auth failed')).toBeInTheDocument();
    });
  });

  it('shows Try Again button after failure and returns to idle form', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { Status: 'Failed', Stage: 'Graph', Error: 'Timeout', Steps: [] },
    });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    // Clicking Try Again returns to the idle form with inputs
    await user.click(screen.getByText('Try Again'));
    expect(screen.getByLabelText(/Tenant ID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('shows connecting text while in progress', async () => {
    let resolveInvoke: (v: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => { resolveInvoke = resolve; })
    );
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(screen.getByText('Connecting...')).toBeInTheDocument();

    // Resolve the promise to clean up
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

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText(/Microsoft.Graph.Authentication v2.15.0/)).toBeInTheDocument();
    });
    expect(screen.getByText(/ExchangeOnlineManagement \(installed\)/)).toBeInTheDocument();
    expect(screen.getByText(/Microsoft Graph — user@test.com/)).toBeInTheDocument();
    expect(screen.getByText('Security & Compliance')).toBeInTheDocument();
  });
});
