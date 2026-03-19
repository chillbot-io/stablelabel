import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ElevationPage from '../../renderer/components/Elevation/ElevationPage';
import { mockInvoke } from '../setup';

describe('ElevationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Elevation')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Just-in-time privilege management')).toBeInTheDocument();
  });

  it('renders all section options', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Elevated Jobs')).toBeInTheDocument();
    expect(screen.getByText('Super User')).toBeInTheDocument();
    expect(screen.getByText('Site Admin')).toBeInTheDocument();
    expect(screen.getByText('Mailbox')).toBeInTheDocument();
    expect(screen.getByText('PIM Roles')).toBeInTheDocument();
  });

  it('shows help text about audit logging', () => {
    render(<ElevationPage />);
    expect(screen.getByText(/audit-logged/)).toBeInTheDocument();
  });

  it('switches to Super User section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    expect(screen.getByText('Super User Feature')).toBeInTheDocument();
    expect(screen.getByText(/decrypt any RMS-protected content/)).toBeInTheDocument();
  });

  it('switches to Elevated Jobs section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Elevated Jobs'));
    expect(screen.queryByText('Elevation Status')).not.toBeInTheDocument();
  });

  it('switches to Site Admin section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Site Admin'));
    expect(screen.queryByText('Elevation Status')).not.toBeInTheDocument();
  });

  it('switches to Mailbox section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Mailbox'));
    expect(screen.queryByText('Elevation Status')).not.toBeInTheDocument();
  });

  it('switches to PIM Roles section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('PIM Roles'));
    expect(screen.queryByText('Elevation Status')).not.toBeInTheDocument();
  });

  it('shows description text for each nav item', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Current elevation state')).toBeInTheDocument();
    expect(screen.getByText('Start / stop orchestrated jobs')).toBeInTheDocument();
    expect(screen.getByText('AIP content decryption')).toBeInTheDocument();
    expect(screen.getByText('SharePoint site admin rights')).toBeInTheDocument();
    expect(screen.getByText('Exchange mailbox access')).toBeInTheDocument();
    expect(screen.getByText('Entra ID role activation')).toBeInTheDocument();
  });

  it('highlights the active section in nav', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    const statusBtn = screen.getByText('Status').closest('button')!;
    expect(statusBtn.className).toContain('border-yellow-400');

    await user.click(screen.getByText('Super User'));
    const superUserBtn = screen.getByText('Super User').closest('button')!;
    expect(superUserBtn.className).toContain('border-yellow-400');
    expect(statusBtn.className).not.toContain('border-yellow-400');
  });

  it('shows dry run tip', () => {
    render(<ElevationPage />);
    expect(screen.getByText(/Use Dry Run before applying/)).toBeInTheDocument();
  });

  it('Status section fetches elevation status on mount', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { State: { ActiveJob: null, CompletedJobs: [] } },
    });

    render(<ElevationPage />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Get-SLElevationStatus');
    });
  });

  it('Super User section shows enable/disable buttons', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    expect(screen.getByText('Enable Super User')).toBeInTheDocument();
    expect(screen.getByText('Disable Super User')).toBeInTheDocument();
  });

  it('Super User section has dry run toggle', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
  });

  it('Super User enable requires confirmation when not dry run', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    await user.click(screen.getByText('Enable Super User'));
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
  });

  it('Super User enable invokes cmdlet after confirmation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    await user.click(screen.getByText('Enable Super User'));
    const confirmBtn = screen.getByText('Enable');
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Enable-SLSuperUser', expect.anything());
    });
  });

  it('Super User shows success message after operation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    await user.click(screen.getByText('Enable Super User'));
    await user.click(screen.getByText('Enable'));
    await waitFor(() => {
      expect(screen.getByText(/Super user enabled/i)).toBeInTheDocument();
    });
  });

  it('Super User shows error message on failure', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Access denied' });
    await user.click(screen.getByText('Enable Super User'));
    await user.click(screen.getByText('Enable'));
    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });
});
