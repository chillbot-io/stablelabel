import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ElevationStatusPanel from '../../../renderer/components/Elevation/ElevationStatusPanel';
import { mockInvoke } from '../../setup';

describe('ElevationStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton on initial render', () => {
    // Never resolving promise to keep loading state
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<ElevationStatusPanel />);
    const pulsingElements = document.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBe(3);
  });

  it('shows error message when fetch fails', async () => {
    mockInvoke.mockRejectedValue(new Error('Network down'));
    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });

  it('shows generic error when non-Error is thrown', async () => {
    mockInvoke.mockRejectedValue('something');
    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('renders baseline state when no active job', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: { ActiveJob: null, CompletedJobs: [] },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('No active elevated job. All privileges are at baseline.')).toBeInTheDocument();
    });
    expect(screen.getByText('Elevation Status')).toBeInTheDocument();
  });

  it('renders active job card when active job exists', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: {
            ActiveJob: {
              JobId: 'job-123',
              UserPrincipalName: 'admin@contoso.com',
              StartedAt: '2024-01-01T00:00:00',
              CompletedAt: null,
              Status: 'Active',
              Elevations: [
                { Type: 'SuperUser', Target: 'tenant', Status: 'Active', Timestamp: '2024-01-01' },
              ],
            },
            CompletedJobs: [],
          },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Active Elevated Job')).toBeInTheDocument();
    });
    expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('job-123')).toBeInTheDocument();
    // There are multiple "Active" texts (badge + status), just check at least one exists
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
  });

  it('renders super user status when enabled with users', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: { ActiveJob: null, CompletedJobs: [] },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { FeatureEnabled: true, SuperUsers: ['admin@contoso.com', 'ga@contoso.com'] },
      });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
    expect(screen.getByText('AIP Super User')).toBeInTheDocument();
    expect(screen.getByText('(2 super users)')).toBeInTheDocument();
    expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('ga@contoso.com')).toBeInTheDocument();
  });

  it('renders super user status when disabled', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: { ActiveJob: null, CompletedJobs: [] },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { FeatureEnabled: false, SuperUsers: [] },
      });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('renders super user status with feature enabled but empty super users list', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: { ActiveJob: null, CompletedJobs: [] },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { FeatureEnabled: true, SuperUsers: [] },
      });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
    // No "(0 super users)" text since length > 0 check
    expect(screen.queryByText(/super users\)/)).not.toBeInTheDocument();
  });

  it('renders completed jobs section', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: {
            ActiveJob: null,
            CompletedJobs: [
              {
                JobId: 'job-001',
                UserPrincipalName: 'user1@contoso.com',
                StartedAt: '2024-01-01T00:00:00',
                CompletedAt: '2024-01-01T01:00:00',
                Status: 'Completed',
                Elevations: [],
              },
              {
                JobId: 'job-002',
                UserPrincipalName: 'user2@contoso.com',
                StartedAt: '2024-01-02T00:00:00',
                CompletedAt: '2024-01-02T01:00:00',
                Status: 'Completed',
                Elevations: [],
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Recent Jobs (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('user1@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('user2@contoso.com')).toBeInTheDocument();
  });

  it('shows CompletedAt for completed jobs', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: {
            ActiveJob: null,
            CompletedJobs: [
              {
                JobId: 'job-001',
                UserPrincipalName: 'user@contoso.com',
                StartedAt: '2024-01-01',
                CompletedAt: '2024-01-02',
                Status: 'Completed',
                Elevations: [],
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Started: 2024-01-01')).toBeInTheDocument();
    });
    expect(screen.getByText('Ended: 2024-01-02')).toBeInTheDocument();
  });

  it('expand/collapse elevations in job card', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: {
            ActiveJob: {
              JobId: 'job-123',
              UserPrincipalName: 'admin@contoso.com',
              StartedAt: '2024-01-01',
              CompletedAt: null,
              Status: 'Active',
              Elevations: [
                { Type: 'SuperUser', Target: 'tenant', Status: 'Active', Timestamp: '2024-01-01' },
                { Type: 'SiteAdmin', Target: 'https://site.com', Status: 'Active', Timestamp: '2024-01-01' },
              ],
            },
            CompletedJobs: [],
          },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    });

    // Expand button should be visible
    const expandBtn = screen.getByText('▸');
    expect(expandBtn).toBeInTheDocument();

    // Elevations not visible yet
    expect(screen.queryByText('SuperUser')).not.toBeInTheDocument();

    // Click to expand
    await user.click(expandBtn);
    expect(screen.getByText('SuperUser')).toBeInTheDocument();
    expect(screen.getByText('SiteAdmin')).toBeInTheDocument();
    expect(screen.getByText('tenant')).toBeInTheDocument();

    // Click to collapse
    const collapseBtn = screen.getByText('▾');
    await user.click(collapseBtn);
    expect(screen.queryByText('SuperUser')).not.toBeInTheDocument();
  });

  it('does not show expand button when no elevations', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp/state.json',
          Exists: true,
          State: {
            ActiveJob: {
              JobId: 'job-123',
              UserPrincipalName: 'admin@contoso.com',
              StartedAt: '2024-01-01',
              CompletedAt: null,
              Status: 'Active',
              Elevations: [],
            },
            CompletedJobs: [],
          },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    });
    expect(screen.queryByText('▸')).not.toBeInTheDocument();
  });

  it('refresh button reloads data', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: { StatePath: '/tmp', Exists: true, State: { ActiveJob: null, CompletedJobs: [] } },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    // Setup next load
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: { StatePath: '/tmp', Exists: true, State: { ActiveJob: null, CompletedJobs: [] } },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    await user.click(screen.getByText('Refresh'));
    // Should have called invoke again (2 initial + 2 refresh)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(4);
    });
  });

  it('handles super user fetch failure gracefully (caught)', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: { StatePath: '/tmp', Exists: true, State: { ActiveJob: null, CompletedJobs: [] } },
      })
      .mockRejectedValueOnce(new Error('AIP not configured'));

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('No active elevated job. All privileges are at baseline.')).toBeInTheDocument();
    });
    // Super user section should not be shown
    expect(screen.queryByText('AIP Super User')).not.toBeInTheDocument();
  });

  it('handles status response with success: false', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: false, data: null })
      .mockResolvedValueOnce({ success: true, data: { FeatureEnabled: false, SuperUsers: [] } });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      // Status not set, so no active job section rendered, but no error either
      // The super user section should still render
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('renders different job statuses with correct styling', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          StatePath: '/tmp',
          Exists: true,
          State: {
            ActiveJob: null,
            CompletedJobs: [
              {
                JobId: 'job-done',
                UserPrincipalName: 'user@contoso.com',
                StartedAt: '2024-01-01',
                CompletedAt: '2024-01-01',
                Status: 'Completed',
                Elevations: [],
              },
              {
                JobId: 'job-other',
                UserPrincipalName: 'user2@contoso.com',
                StartedAt: '2024-01-02',
                CompletedAt: '2024-01-02',
                Status: 'Failed',
                Elevations: [],
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ success: true, data: null });

    render(<ElevationStatusPanel />);
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });
});
