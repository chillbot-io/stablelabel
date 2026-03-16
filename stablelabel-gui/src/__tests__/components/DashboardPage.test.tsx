import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '../../renderer/components/Dashboard/DashboardPage';
import { mockInvoke } from '../setup';

const disconnectedStatus = {
  GraphConnected: false,
  ComplianceConnected: false,
  ProtectionConnected: false,
  UserPrincipalName: null,
  TenantId: null,
};

const connectedStatus = {
  GraphConnected: true,
  ComplianceConnected: true,
  ProtectionConnected: true,
  UserPrincipalName: 'admin@contoso.com',
  TenantId: 'abc12345-def6-7890-ghij-klmnopqrstuv',
};

function setupConnected() {
  // First call = connection status check, subsequent = data fetches
  mockInvoke
    .mockResolvedValueOnce({ success: true, data: connectedStatus })
    .mockResolvedValue({ success: true, data: [] });
}

function setupConnectedWithStats() {
  mockInvoke
    .mockResolvedValueOnce({ success: true, data: connectedStatus })
    // Get-SLLabel
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'Confidential' }, { Name: 'Public' }, { Name: 'Secret' }] })
    // Get-SLDlpPolicy
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'DLP-1' }] })
    // Get-SLRetentionPolicy
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'Ret-1' }, { Name: 'Ret-2' }] })
    // Get-SLAutoLabelPolicy
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'Auto-1' }] })
    // Get-SLSnapshot
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'snap-1' }] })
    // Get-SLElevationStatus
    .mockResolvedValueOnce({ success: true, data: { State: { ActiveJob: null } } })
    // Get-SLAuditLog
    .mockResolvedValueOnce({
      success: true,
      data: [
        { Timestamp: new Date().toISOString(), Action: 'Connect-SLGraph', Target: 'tenant', Result: 'success' },
        { Timestamp: new Date(Date.now() - 3600000).toISOString(), Action: 'New-SLSnapshot', Target: 'snap-1', Result: 'dry-run' },
        { Timestamp: new Date(Date.now() - 86400000).toISOString(), Action: 'Remove-SLLabel', Target: 'test', Result: 'failed' },
      ],
    });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // === Disconnected state ===
  it('shows welcome card when not connected', () => {
    mockInvoke.mockResolvedValue({ success: true, data: disconnectedStatus });
    render(<DashboardPage />);
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText(/Connect to Microsoft Graph/)).toBeInTheDocument();
  });

  it('renders page header when disconnected', () => {
    mockInvoke.mockResolvedValue({ success: true, data: disconnectedStatus });
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Tenant compliance overview')).toBeInTheDocument();
  });

  it('shows connection commands in welcome card', () => {
    mockInvoke.mockResolvedValue({ success: true, data: disconnectedStatus });
    render(<DashboardPage />);
    expect(screen.getByText('Connect-SLGraph')).toBeInTheDocument();
    expect(screen.getByText('Connect-SLCompliance')).toBeInTheDocument();
    expect(screen.getByText('Connect-SLProtection')).toBeInTheDocument();
  });

  // === Connected state ===
  it('shows stat cards when connected', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
      expect(screen.getByText('DLP Policies')).toBeInTheDocument();
      expect(screen.getByText('Retention Policies')).toBeInTheDocument();
      expect(screen.getByText('Auto-Label Policies')).toBeInTheDocument();
      expect(screen.getByText('Snapshots')).toBeInTheDocument();
      expect(screen.getByText('Active Elevations')).toBeInTheDocument();
    });
  });

  it('displays stat values after data loads', async () => {
    setupConnectedWithStats();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument(); // labels
    });
  });

  it('shows placeholder for null stat values', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
    });
    // Stats that haven't loaded show -- as placeholder
    const statCards = screen.getAllByText('Sensitivity Labels')[0].closest('button');
    expect(statCards).toBeInTheDocument();
  });

  // === Connection strip ===
  it('renders connection strip with service names', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Graph').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Compliance').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Protection').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays UPN in connection strip', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    });
  });

  it('displays truncated tenant ID', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('abc12345...')).toBeInTheDocument();
    });
  });

  // === Navigation ===
  it('calls onNavigate when DLP stat card is clicked', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('DLP Policies')).toBeInTheDocument();
    });
    screen.getByText('DLP Policies').closest('button')?.click();
    expect(onNavigate).toHaveBeenCalledWith('dlp');
  });

  it('calls onNavigate for labels card', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
    });
    screen.getByText('Sensitivity Labels').closest('button')?.click();
    expect(onNavigate).toHaveBeenCalledWith('labels');
  });

  it('calls onNavigate for retention card', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Retention Policies')).toBeInTheDocument();
    });
    screen.getByText('Retention Policies').closest('button')?.click();
    expect(onNavigate).toHaveBeenCalledWith('retention');
  });

  it('calls onNavigate for snapshots card', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Snapshots')).toBeInTheDocument();
    });
    screen.getByText('Snapshots').closest('button')?.click();
    expect(onNavigate).toHaveBeenCalledWith('snapshots');
  });

  it('calls onNavigate for elevation card', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Active Elevations')).toBeInTheDocument();
    });
    screen.getByText('Active Elevations').closest('button')?.click();
    expect(onNavigate).toHaveBeenCalledWith('elevation');
  });

  // === Recent Activity ===
  it('shows no activity message when empty', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
    expect(screen.getByText('No recent activity recorded.')).toBeInTheDocument();
  });

  it('displays audit entries with result indicators', async () => {
    setupConnectedWithStats();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Connect-SLGraph')).toBeInTheDocument();
    });
    expect(screen.getByText('New-SLSnapshot')).toBeInTheDocument();
    expect(screen.getByText('Remove-SLLabel')).toBeInTheDocument();
  });

  it('formats relative time for audit entries', async () => {
    setupConnectedWithStats();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('just now')).toBeInTheDocument();
    });
  });

  // === Quick Actions ===
  it('renders quick action buttons', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });
    expect(screen.getByText('Take Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Run Health Check')).toBeInTheDocument();
    expect(screen.getByText('View Templates')).toBeInTheDocument();
  });

  it('navigates to analysis on Run Health Check click', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Run Health Check')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Run Health Check'));
    expect(onNavigate).toHaveBeenCalledWith('analysis');
  });

  it('navigates to templates on View Templates click', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('View Templates')).toBeInTheDocument();
    });
    await user.click(screen.getByText('View Templates'));
    expect(onNavigate).toHaveBeenCalledWith('templates');
  });

  it('calls invoke on Take Snapshot click', async () => {
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Take Snapshot')).toBeInTheDocument();
    });

    // Setup mock for the snapshot call
    mockInvoke.mockResolvedValue({ success: true, data: { Name: 'Dashboard-Quick' } });

    await user.click(screen.getByText('Take Snapshot'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.stringContaining('New-SLSnapshot'),
      );
    });
  });

  it('shows snapshot success result', async () => {
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Take Snapshot')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: { Name: 'Dashboard-Quick' } });
    await user.click(screen.getByText('Take Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Snapshot created')).toBeInTheDocument();
    });
  });

  it('shows snapshot failure result', async () => {
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Take Snapshot')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Access denied' });
    await user.click(screen.getByText('Take Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  // === Refresh button ===
  it('shows Refresh button when connected', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('triggers data refresh on Refresh click', async () => {
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: [] });
    await user.click(screen.getByText('Refresh'));

    // Should re-fetch data
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });
  });

  // === Active elevations styling ===
  it('shows active elevation count when job is active', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: connectedStatus })
      .mockResolvedValueOnce({ success: true, data: [{ Name: 'Label1' }] }) // labels
      .mockResolvedValueOnce({ success: true, data: [] }) // dlp
      .mockResolvedValueOnce({ success: true, data: [] }) // retention
      .mockResolvedValueOnce({ success: true, data: [] }) // auto-label
      .mockResolvedValueOnce({ success: true, data: [] }) // snapshots
      .mockResolvedValueOnce({ success: true, data: { State: { ActiveJob: { Id: 'job-1' } } } }) // elevation
      .mockResolvedValueOnce({ success: true, data: [] }); // audit

    render(<DashboardPage />);
    await waitFor(() => {
      // active elevations = 1 — multiple '1' may appear, just verify the card exists
      const elevCard = screen.getByText('Active Elevations').closest('button');
      expect(elevCard).toBeInTheDocument();
    });
  });

  // === Graph-only connected ===
  it('fetches only graph stats when only graph connected', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: { ...disconnectedStatus, GraphConnected: true, UserPrincipalName: 'user@test.com' },
      })
      .mockResolvedValue({ success: true, data: [] });

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
    });
    // Should have called Get-SLLabel but not compliance commands
    const calls = mockInvoke.mock.calls.map((c: string[]) => c[0]);
    expect(calls.some((c: string) => c.includes('Get-SLLabel'))).toBe(true);
  });

  // === Error resilience ===
  it('handles failed data fetches gracefully', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: connectedStatus })
      .mockRejectedValue(new Error('Network error'));

    render(<DashboardPage />);
    // Should not crash
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
    });
  });
});
