import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  mockInvoke
    .mockResolvedValueOnce({ success: true, data: connectedStatus })
    .mockResolvedValue({ success: true, data: [] });
}

function setupConnectedWithStats() {
  mockInvoke
    .mockResolvedValueOnce({ success: true, data: connectedStatus })
    // Get-SLLabel
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'Confidential' }, { Name: 'Public' }, { Name: 'Secret' }] })
    // Get-SLLabelPolicy
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'Policy-1' }] })
    // Get-SLAutoLabelPolicy
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'Auto-1' }] })
    // Get-SLSnapshot
    .mockResolvedValueOnce({ success: true, data: [{ Name: 'snap-1' }] })
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // === Disconnected state ===
  it('shows welcome card when not connected', () => {
    mockInvoke.mockResolvedValue({ success: true, data: disconnectedStatus });
    render(<DashboardPage />);
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText(/Connect to Microsoft 365/)).toBeInTheDocument();
  });

  it('renders page header when disconnected', () => {
    mockInvoke.mockResolvedValue({ success: true, data: disconnectedStatus });
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Sensitivity label overview')).toBeInTheDocument();
  });

  it('shows connect button in welcome card', () => {
    mockInvoke.mockResolvedValue({ success: true, data: disconnectedStatus });
    render(<DashboardPage />);
    expect(screen.getByRole('button', { name: 'Connect to StableLabel' })).toBeInTheDocument();
  });

  // === Connected state ===
  it('shows stat cards when connected', async () => {
    setupConnected();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
      expect(screen.getByText('Label Policies')).toBeInTheDocument();
      expect(screen.getByText('Auto-Label Policies')).toBeInTheDocument();
      expect(screen.getByText('Snapshots')).toBeInTheDocument();
    });
  });

  it('displays stat values after data loads', async () => {
    setupConnectedWithStats();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument(); // labels
    });
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
    expect(screen.getByText('Label Report')).toBeInTheDocument();
    expect(screen.getByText('Manage Documents')).toBeInTheDocument();
  });

  it('navigates to analysis on Label Report click', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Label Report')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Label Report'));
    expect(onNavigate).toHaveBeenCalledWith('analysis');
  });

  it('navigates to documents on Manage Documents click', async () => {
    const onNavigate = vi.fn();
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage onNavigate={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Manage Documents')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Manage Documents'));
    expect(onNavigate).toHaveBeenCalledWith('documents');
  });

  it('calls invoke on Take Snapshot click', async () => {
    setupConnected();
    const user = userEvent.setup();
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Take Snapshot')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: { Name: 'Dashboard-Quick' } });

    await user.click(screen.getByText('Take Snapshot'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'New-SLSnapshot', expect.objectContaining({ Name: 'Dashboard-Quick', Scope: 'All' })
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

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
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
    const calls = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('Get-SLLabel');
  });

  // === Error resilience ===
  it('handles failed data fetches gracefully', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: connectedStatus })
      .mockRejectedValue(new Error('Network error'));

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
    });
  });
});
