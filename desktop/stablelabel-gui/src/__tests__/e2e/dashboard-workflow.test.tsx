/**
 * E2E tests for the Dashboard page workflow.
 *
 * Verifies: disconnected welcome → connect → stats fetch → quick actions → refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke, mockCheckPwsh, mockGetStatus } from '../setup';

import App from '../../renderer/App';

const connectedStatus = {
  GraphConnected: true,
  ComplianceConnected: true,
  ProtectionConnected: true,
  UserPrincipalName: 'admin@contoso.com',
  TenantId: 'aabbccdd-1122-3344-5566-778899aabbcc',
  GraphConnectedAt: '2024-01-15T10:00:00Z',
  ComplianceConnectedAt: '2024-01-15T10:01:00Z',
  ProtectionConnectedAt: '2024-01-15T10:02:00Z',
  ComplianceSessionAge: '00:05:00',
  ProtectionAvailable: true,
};

const mockLabels = [
  { id: 'l1', name: 'Confidential', displayName: 'Confidential', isActive: true },
  { id: 'l2', name: 'Internal', displayName: 'Internal', isActive: true },
  { id: 'l3', name: 'Public', displayName: 'Public', isActive: true },
];

const mockPolicies = [
  { Name: 'Default Policy', Guid: 'p1', Labels: ['l1', 'l2'] },
];

const mockAutoLabels = [
  { Name: 'Auto-Confidential', Guid: 'a1' },
  { Name: 'Auto-Internal', Guid: 'a2' },
];

const mockSnapshots = [
  { Name: 'baseline-2024-01', CreatedAt: '2024-01-15T10:30:00Z', Scope: 'All', Size: 2048 },
];

const mockAuditEntries = [
  { Timestamp: new Date().toISOString(), Action: 'Set-SLDocumentLabel', Target: 'doc-01', Result: 'success' },
  { Timestamp: new Date().toISOString(), Action: 'New-SLSnapshot', Target: 'baseline', Result: 'success' },
  { Timestamp: new Date().toISOString(), Action: 'Remove-SLDocumentLabel', Target: 'doc-02', Result: 'failed' },
];

describe('Dashboard workflow (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPwsh.mockResolvedValue({ available: true, path: '/usr/bin/pwsh' });
    mockGetStatus.mockResolvedValue({ initialized: true, modulePath: '/path/to/StableLabel' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows welcome card when disconnected', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') {
        return {
          success: true,
          data: { GraphConnected: false, ComplianceConnected: false, ProtectionConnected: false, UserPrincipalName: null, TenantId: null },
        };
      }
      return { success: true, data: null };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Not Connected')).toBeInTheDocument();
    });

    expect(screen.getByText('Connect to StableLabel')).toBeInTheDocument();
    expect(screen.getByText(/Requires PowerShell 7\+/)).toBeInTheDocument();
  });

  it('opens connection dialog from welcome card', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') {
        return {
          success: true,
          data: { GraphConnected: false, ComplianceConnected: false, ProtectionConnected: false, UserPrincipalName: null, TenantId: null },
        };
      }
      return { success: true, data: null };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Connect to StableLabel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Connect to StableLabel'));

    await waitFor(() => {
      expect(screen.getByText(/Connect to Microsoft 365/i)).toBeInTheDocument();
    });
  });

  it('fetches and displays stats when connected', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      if (cmdlet === 'Get-SLLabelPolicy') return { success: true, data: mockPolicies };
      if (cmdlet === 'Get-SLAutoLabelPolicy') return { success: true, data: mockAutoLabels };
      if (cmdlet === 'Get-SLSnapshot') return { success: true, data: mockSnapshots };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: mockAuditEntries };
      return { success: true, data: null };
    });

    render(<App />);

    // Stats should populate — check that the expected cmdlets were called
    // invoke passes (cmdlet, params?) where params can be undefined
    await waitFor(() => {
      const cmdlets = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(cmdlets).toContain('Get-SLLabel');
      expect(cmdlets).toContain('Get-SLLabelPolicy');
      expect(cmdlets).toContain('Get-SLAutoLabelPolicy');
      expect(cmdlets).toContain('Get-SLSnapshot');
    });

    // Verify label count "3" renders (stat cards use text-3xl for values)
    await waitFor(() => {
      const statValues = document.querySelectorAll('.text-3xl');
      const values = Array.from(statValues).map(el => el.textContent);
      expect(values).toContain('3');  // 3 labels
      expect(values).toContain('2');  // 2 auto-label policies
    });
  });

  it('displays UPN and tenant ID in connection strip', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      return { success: true, data: [] };
    });

    render(<App />);

    await waitFor(() => {
      const upnElements = screen.getAllByText('admin@contoso.com');
      expect(upnElements.length).toBeGreaterThanOrEqual(1);
    });

    // Truncated tenant ID
    expect(screen.getByText('aabbccdd...')).toBeInTheDocument();
  });

  it('shows recent activity with result indicators', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: mockAuditEntries };
      return { success: true, data: [] };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Set-SLDocumentLabel')).toBeInTheDocument();
    });

    expect(screen.getByText('New-SLSnapshot')).toBeInTheDocument();
    expect(screen.getByText('Remove-SLDocumentLabel')).toBeInTheDocument();
  });

  it('quick action: Take Snapshot invokes New-SLSnapshot', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      if (cmdlet === 'New-SLSnapshot') {
        expect(params).toEqual({ Name: 'Dashboard-Quick', Scope: 'All' });
        return { success: true, data: { Name: 'Dashboard-Quick' } };
      }
      return { success: true, data: [] };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Take Snapshot')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Take Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Snapshot created')).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledWith('New-SLSnapshot', { Name: 'Dashboard-Quick', Scope: 'All' });
  });

  it('quick action: Label Report navigates to analysis page', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      return { success: true, data: [] };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Label Report')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Label Report'));

    // Should navigate to analysis page (sidebar button should be active)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analysis' })).toBeInTheDocument();
    });
  });

  it('refresh button re-fetches all stats', async () => {
    let fetchCount = 0;

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLLabel') {
        fetchCount++;
        return { success: true, data: mockLabels };
      }
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      return { success: true, data: [] };
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    const initialCount = fetchCount;

    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThan(initialCount);
    });
  });

  it('stat cards are clickable navigation links', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      return { success: true, data: [] };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Label Policies')).toBeInTheDocument();
    });

    // Click "Snapshots" stat card — there are two "Snapshots" (sidebar + stat card)
    // The stat card is a <button> with text "Snapshots" in a <p> child
    const snapshotStatCard = screen.getAllByText('Snapshots').find(el => el.closest('button')?.querySelector('.text-3xl'));
    expect(snapshotStatCard).toBeTruthy();
    await user.click(snapshotStatCard!.closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Capture, compare, and restore tenant config')).toBeInTheDocument();
    });
  });

  it('handles partial stats failures gracefully', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLLabel') return { success: false, data: null, error: 'Graph API timeout' };
      if (cmdlet === 'Get-SLLabelPolicy') return { success: true, data: mockPolicies };
      if (cmdlet === 'Get-SLAutoLabelPolicy') return { success: true, data: mockAutoLabels };
      if (cmdlet === 'Get-SLSnapshot') return { success: true, data: mockSnapshots };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      return { success: true, data: null };
    });

    render(<App />);

    // Stats that succeeded should show — use stat card values
    await waitFor(() => {
      const statValues = document.querySelectorAll('.text-3xl');
      const values = Array.from(statValues).map(el => el.textContent);
      expect(values).toContain('2'); // auto-label policies
    });

    // Failed stat shows placeholder "--"
    await waitFor(() => {
      const statValues = document.querySelectorAll('.text-3xl');
      const values = Array.from(statValues).map(el => el.textContent);
      expect(values).toContain('--');
    });
  });

  it('all cmdlet calls use valid Verb-SLNoun format', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLConnectionStatus') return { success: true, data: connectedStatus };
      if (cmdlet === 'Get-SLAuditLog') return { success: true, data: [] };
      return { success: true, data: [] };
    });

    render(<App />);

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(0);
    });

    for (const call of mockInvoke.mock.calls) {
      const cmdlet = call[0] as string;
      expect(cmdlet).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
    }
  });
});
