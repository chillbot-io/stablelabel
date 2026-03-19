import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuperUserPanel from '../../../renderer/components/Elevation/SuperUserPanel';
import { mockInvoke } from '../../setup';

describe('SuperUserPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with title, warning, and buttons', () => {
    render(<SuperUserPanel />);
    expect(screen.getByText('Super User Feature')).toBeInTheDocument();
    expect(screen.getByText(/Enable or disable the AIP super user feature/)).toBeInTheDocument();
    expect(screen.getByText(/Warning: Enabling super user grants/)).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByText('Enable Super User')).toBeInTheDocument();
    expect(screen.getByText('Disable Super User')).toBeInTheDocument();
  });

  it('dry run is off by default', () => {
    render(<SuperUserPanel />);
    const dryRunSwitch = screen.getByRole('switch');
    expect(dryRunSwitch).toHaveAttribute('aria-checked', 'false');
  });

  // --- Enable with dry run ---
  it('enable with dry run executes directly without confirmation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SuperUserPanel />);

    // Turn on dry run
    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Enable Super User'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Enable-SLSuperUser', expect.objectContaining({ DryRun: true }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would enable super user.')).toBeInTheDocument();
    });
  });

  // --- Disable with dry run ---
  it('disable with dry run executes directly without confirmation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SuperUserPanel />);

    // Turn on dry run
    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Disable Super User'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Disable-SLSuperUser', expect.objectContaining({ DryRun: true }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would disable super user.')).toBeInTheDocument();
    });
  });

  // --- Enable without dry run (live) ---
  it('enable without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SuperUserPanel />);

    await user.click(screen.getByText('Enable Super User'));

    await waitFor(() => {
      expect(screen.getByText('Enable Super User', { selector: 'h3' })).toBeInTheDocument();
      expect(screen.getByText(/Enabling super user allows decryption/)).toBeInTheDocument();
    });
    expect(screen.getByText('Enable')).toBeInTheDocument();
  });

  it('enable confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SuperUserPanel />);

    await user.click(screen.getByText('Enable Super User'));
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Enable'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Enable-SLSuperUser', expect.objectContaining({}));
    });
    await waitFor(() => {
      expect(screen.getByText('Super user enabled.')).toBeInTheDocument();
    });
  });

  // --- Disable without dry run (live) ---
  it('disable without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SuperUserPanel />);

    await user.click(screen.getByText('Disable Super User'));

    await waitFor(() => {
      expect(screen.getByText('Disable Super User', { selector: 'h3' })).toBeInTheDocument();
      expect(screen.getByText(/Disable the super user feature\?/)).toBeInTheDocument();
    });
    expect(screen.getByText('Disable')).toBeInTheDocument();
  });

  it('disable confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SuperUserPanel />);

    await user.click(screen.getByText('Disable Super User'));
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Disable'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Disable-SLSuperUser', expect.objectContaining({}));
    });
    await waitFor(() => {
      expect(screen.getByText('Super user disabled.')).toBeInTheDocument();
    });
  });

  // --- Cancel confirmation ---
  it('cancels enable confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SuperUserPanel />);

    await user.click(screen.getByText('Enable Super User'));
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByText(/Enabling super user allows decryption/)).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('cancels disable confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SuperUserPanel />);

    await user.click(screen.getByText('Disable Super User'));
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByText(/Disable the super user feature\?/)).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // --- Error handling ---
  it('shows error when invoke returns failure with message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Not authorized' });
    render(<SuperUserPanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Enable Super User'));

    await waitFor(() => {
      expect(screen.getByText('Not authorized')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<SuperUserPanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Enable Super User'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when invoke throws an Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<SuperUserPanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Enable Super User'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows generic error when invoke throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue('bad');
    render(<SuperUserPanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Disable Super User'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  // --- Loading state ---
  it('shows loading state while processing', async () => {
    const user = userEvent.setup();
    let resolveInvoke: (value: any) => void;
    mockInvoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));
    render(<SuperUserPanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Enable Super User'));

    expect(screen.getByText('Processing...')).toBeInTheDocument();

    resolveInvoke!({ success: true, data: null });
    await waitFor(() => {
      expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
    });
  });

  it('disables buttons during loading', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<SuperUserPanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Enable Super User'));

    // Both buttons should be disabled
    const buttons = screen.getAllByRole('button').filter(b => b.textContent === 'Processing...' || b.textContent === 'Disable Super User');
    buttons.forEach(btn => {
      expect(btn).toBeDisabled();
    });
  });
});
