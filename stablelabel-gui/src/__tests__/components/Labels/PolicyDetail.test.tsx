import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyDetail from '../../../renderer/components/Labels/PolicyDetail';
import { mockInvoke } from '../../setup';

const mockPolicy = {
  Name: 'Global Policy',
  Guid: 'guid-abc-123',
  Labels: ['Confidential', 'Public'],
  Comment: 'Default organization policy',
  Enabled: true,
  CreatedBy: 'admin@contoso.com',
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: '2024-03-20T14:00:00Z',
  Mode: 'Enforce',
  Type: 'Standard',
  ExchangeLocation: ['All'],
  SharePointLocation: ['https://contoso.sharepoint.com/sites/hr', 'https://contoso.sharepoint.com/sites/finance'],
  OneDriveLocation: null,
};

describe('PolicyDetail', () => {
  const onOpenLabel = vi.fn();
  const onEdit = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('renders policy details after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    expect(screen.getByText('Default organization policy')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('guid-abc-123')).toBeInTheDocument();
    expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('Enforce')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining("Get-SLLabelPolicy -Identity 'Global Policy'"),
    );
  });

  it('shows Disabled badge for disabled policy', async () => {
    const disabledPolicy = { ...mockPolicy, Enabled: false };
    mockInvoke.mockResolvedValue({ success: true, data: disabledPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('calls onEdit when Edit button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('Global Policy');
  });

  it('renders published labels and calls onOpenLabel on click', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Published Labels (2)')).toBeInTheDocument();

    await user.click(screen.getByText('Confidential'));
    expect(onOpenLabel).toHaveBeenCalledWith('Confidential', 'Confidential');
  });

  it('shows "No labels published" when Labels is empty', async () => {
    const noLabelsPolicy = { ...mockPolicy, Labels: [] };
    mockInvoke.mockResolvedValue({ success: true, data: noLabelsPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('No labels published in this policy.')).toBeInTheDocument();
    });
  });

  it('shows "No labels published" when Labels is null', async () => {
    const nullLabelsPolicy = { ...mockPolicy, Labels: null };
    mockInvoke.mockResolvedValue({ success: true, data: nullLabelsPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('No labels published in this policy.')).toBeInTheDocument();
    });
  });

  it('renders scoped locations correctly', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Scoped Locations')).toBeInTheDocument();
    });

    // Exchange = ['All'] should show "All locations"
    expect(screen.getByText('All locations')).toBeInTheDocument();

    // SharePoint has specific URLs
    expect(screen.getByText('https://contoso.sharepoint.com/sites/hr')).toBeInTheDocument();
    expect(screen.getByText('https://contoso.sharepoint.com/sites/finance')).toBeInTheDocument();

    // OneDrive is null - should show "Not configured"
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('shows "Not configured" for all null locations', async () => {
    const noLocPolicy = { ...mockPolicy, ExchangeLocation: null, SharePointLocation: null, OneDriveLocation: null };
    mockInvoke.mockResolvedValue({ success: true, data: noLocPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Scoped Locations')).toBeInTheDocument();
    });

    const notConfigured = screen.getAllByText('Not configured');
    expect(notConfigured.length).toBe(3);
  });

  it('hides Comment when null', async () => {
    const noCommentPolicy = { ...mockPolicy, Comment: null };
    mockInvoke.mockResolvedValue({ success: true, data: noCommentPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    expect(screen.queryByText('Default organization policy')).not.toBeInTheDocument();
  });

  it('hides Mode and Type fields when null', async () => {
    const noModePolicy = { ...mockPolicy, Mode: null, Type: null };
    mockInvoke.mockResolvedValue({ success: true, data: noModePolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    expect(screen.queryByText('Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Type')).not.toBeInTheDocument();
  });

  it('shows "N/A" for null CreatedBy', async () => {
    const noCreatedByPolicy = { ...mockPolicy, CreatedBy: null };
    mockInvoke.mockResolvedValue({ success: true, data: noCreatedByPolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    // CreatedBy shows N/A
    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThanOrEqual(1);
  });

  it('formats dates correctly and shows N/A for null dates', async () => {
    const nullDatePolicy = { ...mockPolicy, WhenChanged: null };
    mockInvoke.mockResolvedValue({ success: true, data: nullDatePolicy });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    // WhenChanged is null -> "N/A"
    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state on fetch failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Forbidden' });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });
  });

  it('shows default error when no error string', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Policy not found')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an exception', async () => {
    mockInvoke.mockRejectedValue(new Error('Timeout'));
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load policy')).toBeInTheDocument();
    });
  });

  it('toggles raw JSON section', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <PolicyDetail policyName="Global Policy" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    // Show raw JSON
    await user.click(screen.getByText(/▸ Show/));
    const preElement = document.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.textContent).toContain('guid-abc-123');

    // Hide raw JSON
    await user.click(screen.getByText(/▾ Hide/));
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });
});
