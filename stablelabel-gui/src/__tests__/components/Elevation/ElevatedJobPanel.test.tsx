import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ElevatedJobPanel from '../../../renderer/components/Elevation/ElevatedJobPanel';
import { mockInvoke } from '../../setup';

describe('ElevatedJobPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StartJob', () => {
    it('renders start job form with all fields', () => {
      render(<ElevatedJobPanel />);
      expect(screen.getByText('Start Elevated Job')).toBeInTheDocument();
      expect(screen.getByText(/Orchestrate multi-step privilege elevation/)).toBeInTheDocument();
      expect(screen.getByText(/This operation grants significant privileges/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('globaladmin@contoso.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Optional tenant GUID...')).toBeInTheDocument();
      expect(screen.getByText('Skip Super User')).toBeInTheDocument();
      expect(screen.getByText('Skip Site Admin')).toBeInTheDocument();
      expect(screen.getByText('Dry Run')).toBeInTheDocument();
    });

    it('shows button text as "Dry Run — Start Job" when dry run is enabled (default)', () => {
      render(<ElevatedJobPanel />);
      expect(screen.getByText('Dry Run — Start Job')).toBeInTheDocument();
    });

    it('validates UPN is required', async () => {
      const user = userEvent.setup();
      render(<ElevatedJobPanel />);
      await user.click(screen.getByText('Dry Run — Start Job'));
      expect(screen.getByText('User Principal Name is required.')).toBeInTheDocument();
    });

    it('executes dry run directly without confirmation', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Start-SLElevatedJob', expect.objectContaining({
          UserPrincipalName: 'admin@contoso.com',
          DryRun: true,
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Dry run complete — no elevations applied.')).toBeInTheDocument();
      });
    });

    it('shows confirmation dialog for live execution (dry run off)', async () => {
      const user = userEvent.setup();
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');

      // Turn off dry run - it's the 3rd switch (Skip Super User, Skip Site Admin, Dry Run)
      const switches = screen.getAllByRole('switch');
      const dryRunToggle = switches[2]; // Dry Run is the 3rd toggle
      await user.click(dryRunToggle);

      // After turning off dry run, button should say "Start Elevated Job"
      const startButtons = screen.getAllByText('Start Elevated Job');
      const startButton = startButtons.find(el => el.tagName === 'BUTTON')!;
      expect(startButton).toBeInTheDocument();
      await user.click(startButton);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText(/Start elevated job as "admin@contoso.com"\?/)).toBeInTheDocument();
      });
      expect(screen.getByText('Start Job')).toBeInTheDocument();
    });

    it('executes live start after confirmation', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');

      // Turn off dry run
      const switches = screen.getAllByRole('switch');
      await user.click(switches[2]); // Dry Run is the 3rd toggle

      const startButtons = screen.getAllByText('Start Elevated Job');
      const startButton = startButtons.find(el => el.tagName === 'BUTTON')!;
      await user.click(startButton);

      // Click confirm in dialog
      await waitFor(() => {
        expect(screen.getByText('Start Job')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Start Job'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Start-SLElevatedJob', expect.objectContaining({
          UserPrincipalName: 'admin@contoso.com',
        }));
      });
      // DryRun should not be truthy
      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].DryRun).toBeUndefined();
      await waitFor(() => {
        expect(screen.getByText('Elevated job started successfully.')).toBeInTheDocument();
      });
    });

    it('cancels confirmation dialog', async () => {
      const user = userEvent.setup();
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');

      // Turn off dry run
      const switches = screen.getAllByRole('switch');
      await user.click(switches[2]); // Dry Run is the 3rd toggle

      const startButtons = screen.getAllByText('Start Elevated Job');
      const startButton = startButtons.find(el => el.tagName === 'BUTTON')!;
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Cancel'));

      // Dialog should be gone
      expect(screen.queryByText(/Start elevated job as/)).not.toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('includes tenant ID when provided', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.type(screen.getByPlaceholderText('Optional tenant GUID...'), 'abc-123');
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Start-SLElevatedJob', expect.objectContaining({
          TenantId: 'abc-123',
        }));
      });
    });

    it('includes skip flags when toggled', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');

      // Toggle skip options - switches are: Skip Super User (0), Skip Site Admin (1), Dry Run (2)
      const switches = screen.getAllByRole('switch');
      await user.click(switches[0]); // Skip Super User
      await user.click(switches[1]); // Skip Site Admin

      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Start-SLElevatedJob', expect.objectContaining({
          SkipSuperUser: true,
          SkipSiteAdmin: true,
        }));
      });
    });

    it('shows error when invoke returns success: false', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, error: 'Auth failed' });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(screen.getByText('Auth failed')).toBeInTheDocument();
      });
    });

    it('shows generic error when invoke returns success: false with no error text', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(screen.getByText('Failed to start job')).toBeInTheDocument();
      });
    });

    it('shows error when invoke throws', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('Connection timeout'));
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(screen.getByText('Connection timeout')).toBeInTheDocument();
      });
    });

    it('shows generic error when invoke throws non-Error', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue('something bad');
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('shows loading text while processing', async () => {
      const user = userEvent.setup();
      let resolveInvoke: (value: any) => void;
      mockInvoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), 'admin@contoso.com');
      await user.click(screen.getByText('Dry Run — Start Job'));

      expect(screen.getByText('Starting...')).toBeInTheDocument();

      // Resolve to end loading
      resolveInvoke!({ success: true, data: null });
      await waitFor(() => {
        expect(screen.queryByText('Starting...')).not.toBeInTheDocument();
      });
    });

    it('passes UPN with special characters as raw value', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('globaladmin@contoso.com'), "o'brien@contoso.com");
      await user.click(screen.getByText('Dry Run — Start Job'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Start-SLElevatedJob', expect.objectContaining({
          UserPrincipalName: "o'brien@contoso.com",
        }));
      });
    });
  });

  describe('StopJob', () => {
    it('renders stop job form', () => {
      render(<ElevatedJobPanel />);
      expect(screen.getByText('Stop Elevated Job')).toBeInTheDocument();
      expect(screen.getByText(/Tear down all elevations/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Leave blank for most recent job')).toBeInTheDocument();
      expect(screen.getByText('Reconnect Original Session')).toBeInTheDocument();
      expect(screen.getByText('Stop Job & Clean Up')).toBeInTheDocument();
    });

    it('shows confirmation dialog when clicking stop', async () => {
      const user = userEvent.setup();
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));

      await waitFor(() => {
        expect(screen.getByText(/This will revoke all temporary privileges/)).toBeInTheDocument();
      });
      expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
    });

    it('stops job after confirmation with default params', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Stop-SLElevatedJob', expect.objectContaining({
          Force: true,
          ReconnectOriginal: true,
        }));
      });
      await waitFor(() => {
        expect(screen.getByText('Elevated job stopped. All privileges cleaned up.')).toBeInTheDocument();
      });
    });

    it('includes job ID when provided', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      await user.type(screen.getByPlaceholderText('Leave blank for most recent job'), 'job-456');
      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Stop-SLElevatedJob', expect.objectContaining({
          Force: true,
          JobId: 'job-456',
        }));
      });
    });

    it('excludes -ReconnectOriginal when toggle is off', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<ElevatedJobPanel />);

      // Reconnect is default on; turn it off
      // Switches in StopJob section: Reconnect Original Session is the 4th switch overall
      // (3 in StartJob: Skip Super User, Skip Site Admin, Dry Run + 1 in StopJob: Reconnect)
      const switches = screen.getAllByRole('switch');
      await user.click(switches[3]); // Reconnect Original Session

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Stop-SLElevatedJob', expect.objectContaining({
          Force: true,
        }));
        const callArgs = mockInvoke.mock.calls[0];
        expect(callArgs[1].ReconnectOriginal).toBeUndefined();
      });
    });

    it('cancels stop confirmation dialog', async () => {
      const user = userEvent.setup();
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Cancel'));

      expect(screen.queryByText(/This will revoke all temporary privileges/)).not.toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('shows error when stop fails with error message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, error: 'No active job' });
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(screen.getByText('No active job')).toBeInTheDocument();
      });
    });

    it('shows fallback error when stop fails without message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false });
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(screen.getByText('Failed to stop job')).toBeInTheDocument();
      });
    });

    it('shows error when stop throws', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('Network error'));
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows generic error when stop throws non-Error', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(42);
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('shows loading state while stopping', async () => {
      const user = userEvent.setup();
      let resolveInvoke: (value: any) => void;
      mockInvoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));
      render(<ElevatedJobPanel />);

      await user.click(screen.getByText('Stop Job & Clean Up'));
      await waitFor(() => {
        expect(screen.getByText('Stop & Clean Up')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Stop & Clean Up'));

      expect(screen.getByText('Stopping...')).toBeInTheDocument();

      resolveInvoke!({ success: true, data: null });
      await waitFor(() => {
        expect(screen.queryByText('Stopping...')).not.toBeInTheDocument();
      });
    });
  });
});
