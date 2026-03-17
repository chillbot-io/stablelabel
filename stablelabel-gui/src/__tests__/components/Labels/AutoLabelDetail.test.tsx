import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutoLabelDetail from '../../../renderer/components/Labels/AutoLabelDetail';
import { mockInvoke } from '../../setup';

const mockPolicy = {
  Name: 'PII Auto-Label',
  Guid: 'guid-auto-1',
  Comment: 'Detects PII and applies label',
  Enabled: true,
  Mode: 'Enable',
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: '2024-03-20T14:00:00Z',
  ApplySensitivityLabel: 'Confidential',
  ExchangeLocation: ['All'],
  SharePointLocation: ['https://contoso.sharepoint.com/sites/hr'],
  OneDriveLocation: null,
  Priority: 2,
};

describe('AutoLabelDetail', () => {
  const onOpenLabel = vi.fn();
  const onEdit = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('renders policy details after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    expect(screen.getByText('Detects PII and applies label')).toBeInTheDocument();
    expect(screen.getByText('guid-auto-1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    expect(mockInvoke).toHaveBeenCalledWith(
      'Get-SLAutoLabelPolicy',
      expect.objectContaining({ Identity: 'PII Auto-Label' }),
    );
  });

  it('shows Enforcing mode for Enable', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Enforcing')).toBeInTheDocument();
    });

    expect(screen.getByText(/actively labeling matching content/)).toBeInTheDocument();
  });

  it('shows Simulation + Notifications mode', async () => {
    const testPolicy = { ...mockPolicy, Mode: 'TestWithNotifications' };
    mockInvoke.mockResolvedValue({ success: true, data: testPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Simulation + Notifications')).toBeInTheDocument();
    });

    expect(screen.getByText(/simulation mode.*notified/i)).toBeInTheDocument();
  });

  it('shows Simulation mode for TestWithoutNotifications', async () => {
    const testPolicy = { ...mockPolicy, Mode: 'TestWithoutNotifications' };
    mockInvoke.mockResolvedValue({ success: true, data: testPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      // There might be other text with "Simulation" so be specific
      expect(screen.getByText('Simulation')).toBeInTheDocument();
    });

    expect(screen.getByText(/logged silently/)).toBeInTheDocument();
  });

  it('shows unknown mode for unrecognized mode', async () => {
    const testPolicy = { ...mockPolicy, Mode: 'CustomMode' };
    mockInvoke.mockResolvedValue({ success: true, data: testPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('CustomMode')).toBeInTheDocument();
    });

    expect(screen.getByText('Policy mode is not recognized.')).toBeInTheDocument();
  });

  it('shows Unknown for null mode', async () => {
    const testPolicy = { ...mockPolicy, Mode: null };
    mockInvoke.mockResolvedValue({ success: true, data: testPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('calls onEdit when Edit button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('PII Auto-Label');
  });

  it('shows ApplySensitivityLabel section and calls onOpenLabel on click', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Applies Sensitivity Label')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Confidential'));
    expect(onOpenLabel).toHaveBeenCalledWith('Confidential', 'Confidential');
  });

  it('hides ApplySensitivityLabel section when null', async () => {
    const noLabelPolicy = { ...mockPolicy, ApplySensitivityLabel: null };
    mockInvoke.mockResolvedValue({ success: true, data: noLabelPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    expect(screen.queryByText('Applies Sensitivity Label')).not.toBeInTheDocument();
  });

  it('renders scoped locations correctly', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Scoped Locations')).toBeInTheDocument();
    });

    expect(screen.getByText('All locations')).toBeInTheDocument();
    expect(screen.getByText('https://contoso.sharepoint.com/sites/hr')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('shows "Not configured" for all null locations', async () => {
    const noLocPolicy = {
      ...mockPolicy,
      ExchangeLocation: null,
      SharePointLocation: null,
      OneDriveLocation: null,
    };
    mockInvoke.mockResolvedValue({ success: true, data: noLocPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
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
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    expect(screen.queryByText('Detects PII and applies label')).not.toBeInTheDocument();
  });

  it('shows N/A for null priority', async () => {
    const noPriorityPolicy = { ...mockPolicy, Priority: null };
    mockInvoke.mockResolvedValue({ success: true, data: noPriorityPolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThanOrEqual(1);
  });

  it('formats dates and shows N/A for null dates', async () => {
    const nullDatePolicy = { ...mockPolicy, WhenChanged: null };
    mockInvoke.mockResolvedValue({ success: true, data: nullDatePolicy });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state on fetch failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Access denied' });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  it('shows default error when no error string', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Auto-label policy not found')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(
      <AutoLabelDetail policyName="test" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load policy')).toBeInTheDocument();
    });
  });

  it('toggles raw JSON section', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <AutoLabelDetail policyName="PII Auto-Label" onOpenLabel={onOpenLabel} onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    // Show raw JSON
    await user.click(screen.getByText(/▸ Show/));
    const preElement = document.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.textContent).toContain('guid-auto-1');

    // Hide raw JSON
    await user.click(screen.getByText(/▾ Hide/));
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });
});
