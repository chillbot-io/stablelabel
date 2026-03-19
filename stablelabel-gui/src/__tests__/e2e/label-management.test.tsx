/**
 * E2E integration tests for label management flows.
 *
 * Tests verify the renderer → IPC invoke path and correct parameterized usage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import RetentionPage from '../../renderer/components/Retention/RetentionPage';
import RetentionLabelDetail from '../../renderer/components/Retention/RetentionLabelDetail';
import RetentionPolicyDetail from '../../renderer/components/Retention/RetentionPolicyDetail';

// ---------------------------------------------------------------------------
// Retention Label Detail — parameterized invoke (verifies injection fix)
// ---------------------------------------------------------------------------

describe('RetentionLabelDetail — parameterized invoke (injection fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses parameterized invoke, not string interpolation', async () => {
    const label = {
      Name: "Test'; Remove-SLRetentionLabel -Identity 'all",
      Guid: 'abc-123',
      RetentionDuration: 365,
      RetentionAction: 'KeepAndDelete',
      RetentionType: 'CreationAgeInDays',
      IsRecordLabel: false,
      IsRegulatoryLabel: false,
      WhenCreated: '2024-01-01T00:00:00Z',
      WhenChanged: '2024-06-01T00:00:00Z',
    };

    mockInvoke.mockResolvedValue({ success: true, data: label });

    render(
      <RetentionLabelDetail
        labelName="Test'; Remove-SLRetentionLabel -Identity 'all"
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      // Verify it used structured invoke (cmdlet, params) — NOT string interpolation
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLRetentionLabel', {
        Identity: "Test'; Remove-SLRetentionLabel -Identity 'all",
      });
    });

    // The first argument should be a clean cmdlet name with no embedded params
    const cmdletArg = mockInvoke.mock.calls[0][0];
    expect(cmdletArg).toBe('Get-SLRetentionLabel');
    expect(cmdletArg).not.toContain('-Identity');
    expect(cmdletArg).not.toContain("'");
  });

  it('displays label data after successful fetch', async () => {
    const label = {
      Name: 'Financial Records',
      Guid: 'g-1',
      RetentionDuration: 2555,
      RetentionAction: 'KeepAndDelete',
      RetentionType: 'CreationAgeInDays',
      IsRecordLabel: true,
      IsRegulatoryLabel: false,
      WhenCreated: '2024-01-01T00:00:00Z',
      WhenChanged: '2024-06-01T00:00:00Z',
    };

    mockInvoke.mockResolvedValue({ success: true, data: label });

    render(
      <RetentionLabelDetail labelName="Financial Records" onEdit={vi.fn()} onDeleted={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Records')).toBeInTheDocument();
    });
    expect(screen.getByText('7 years (2555 days)')).toBeInTheDocument();
    expect(screen.getByText('Retain then delete')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Label not found' });

    render(
      <RetentionLabelDetail labelName="Missing" onEdit={vi.fn()} onDeleted={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Label not found')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Retention Policy Detail — parameterized invoke (verifies injection fix)
// ---------------------------------------------------------------------------

describe('RetentionPolicyDetail — parameterized invoke (injection fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses parameterized invoke, not string interpolation', async () => {
    const policy = {
      Name: "Evil'; Drop-Everything",
      Guid: 'p-1',
      Enabled: true,
      Mode: 'Enforce',
      WhenCreated: '2024-01-01T00:00:00Z',
      WhenChanged: '2024-06-01T00:00:00Z',
      ExchangeLocation: ['All'],
      SharePointLocation: [],
      OneDriveLocation: [],
      ModernGroupLocation: [],
      SkypeLocation: [],
      PublicFolderLocation: [],
    };

    mockInvoke.mockResolvedValue({ success: true, data: policy });

    render(
      <RetentionPolicyDetail
        policyName="Evil'; Drop-Everything"
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLRetentionPolicy', {
        Identity: "Evil'; Drop-Everything",
      });
    });

    const cmdletArg = mockInvoke.mock.calls[0][0];
    expect(cmdletArg).toBe('Get-SLRetentionPolicy');
    expect(cmdletArg).not.toContain('-Identity');
  });

  it('displays policy data with locations', async () => {
    const policy = {
      Name: 'Exchange Retention',
      Guid: 'p-1',
      Enabled: true,
      Mode: 'Enforce',
      WhenCreated: '2024-01-01T00:00:00Z',
      WhenChanged: '2024-06-01T00:00:00Z',
      ExchangeLocation: ['All'],
      SharePointLocation: [],
      OneDriveLocation: [],
      ModernGroupLocation: [],
      SkypeLocation: [],
      PublicFolderLocation: [],
    };

    mockInvoke.mockResolvedValue({ success: true, data: policy });

    render(
      <RetentionPolicyDetail policyName="Exchange Retention" onEdit={vi.fn()} onDeleted={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Exchange Retention')).toBeInTheDocument();
    });
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('All locations')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Retention Page — tab navigation and data flow
// ---------------------------------------------------------------------------

describe('Retention page data flow (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads retention labels on mount', async () => {
    const labels = [
      { Name: 'Financial Records', Guid: 'g1', RetentionDuration: 2555, RetentionAction: 'KeepAndDelete', RetentionType: 'CreationAgeInDays', IsRecordLabel: true, IsRegulatoryLabel: false, WhenCreated: '2024-01-01T00:00:00Z', WhenChanged: '2024-06-01T00:00:00Z' },
    ];

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLRetentionLabel') return { success: true, data: labels };
      if (cmdlet === 'Get-SLRetentionPolicy') return { success: true, data: [] };
      return { success: true, data: null };
    });

    render(<RetentionPage />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records')).toBeInTheDocument();
    });
  });

  it('navigates to policies tab and loads policies', async () => {
    const user = userEvent.setup();
    const policies = [
      { Name: 'Exchange 7yr', Guid: 'p1', Enabled: true, Mode: 'Enforce', WhenCreated: '2024-01-01T00:00:00Z', WhenChanged: '2024-06-01T00:00:00Z', ExchangeLocation: ['All'], SharePointLocation: [], OneDriveLocation: [], ModernGroupLocation: [], SkypeLocation: [], PublicFolderLocation: [] },
    ];

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLRetentionLabel') return { success: true, data: [] };
      if (cmdlet === 'Get-SLRetentionPolicy') return { success: true, data: policies };
      return { success: true, data: null };
    });

    render(<RetentionPage />);

    const policiesTabs = screen.getAllByText('Policies');
    await user.click(policiesTabs[0]);

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr')).toBeInTheDocument();
    });
  });

  it('opens label detail with parameterized invoke', async () => {
    const user = userEvent.setup();
    const labels = [
      { Name: 'Financial Records', Guid: 'g1', RetentionDuration: 2555, RetentionAction: 'KeepAndDelete', RetentionType: 'CreationAgeInDays', IsRecordLabel: true, IsRegulatoryLabel: false, WhenCreated: '2024-01-01T00:00:00Z', WhenChanged: '2024-06-01T00:00:00Z' },
    ];

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLRetentionLabel' && !params?.Identity) return { success: true, data: labels };
      if (cmdlet === 'Get-SLRetentionLabel' && params?.Identity) return { success: true, data: labels[0] };
      if (cmdlet === 'Get-SLRetentionPolicy') return { success: true, data: [] };
      return { success: true, data: null };
    });

    render(<RetentionPage />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Financial Records'));

    await waitFor(() => {
      const detailCall = mockInvoke.mock.calls.find(
        (c: unknown[]) => c[0] === 'Get-SLRetentionLabel' && (c[1] as Record<string, unknown>)?.Identity,
      );
      expect(detailCall).toBeDefined();
      expect(detailCall![1]).toEqual({ Identity: 'Financial Records' });
    });
  });
});
