import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionPolicyDetail from '../../../renderer/components/Retention/RetentionPolicyDetail';
import { mockInvoke } from '../../setup';

const mockPolicy = {
  Name: 'Exchange 7yr Retention',
  Guid: 'pol-guid-123',
  Comment: 'Retain Exchange content for 7 years',
  Enabled: true,
  Mode: 'Enforce',
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: '2024-06-20T14:00:00Z',
  ExchangeLocation: ['All'],
  SharePointLocation: ['https://contoso.sharepoint.com/sites/hr', 'https://contoso.sharepoint.com/sites/legal'],
  OneDriveLocation: null,
  ModernGroupLocation: null,
  SkypeLocation: null,
  PublicFolderLocation: null,
};

describe('RetentionPolicyDetail', () => {
  const onEdit = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('displays policy details after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Exchange 7yr Retention" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });
    expect(screen.getByText('Retain Exchange content for 7 years')).toBeInTheDocument();
    expect(screen.getByText('pol-guid-123')).toBeInTheDocument();
    expect(screen.getByText('Enforce')).toBeInTheDocument();
  });

  it('sends the correct PowerShell command with identity', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Exchange 7yr Retention" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLRetentionPolicy -Identity 'Exchange 7yr Retention'", undefined);
    });
  });

  it('shows Enabled badge for enabled policies', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
  });

  it('shows Disabled badge for disabled policies', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockPolicy, Enabled: false },
    });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('shows N/A for null Mode', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockPolicy, Mode: null },
    });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  it('hides comment when Comment is null', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockPolicy, Comment: null },
    });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });
    expect(screen.queryByText('Retain Exchange content for 7 years')).not.toBeInTheDocument();
  });

  it('shows "All locations" for Exchange with All', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('All locations')).toBeInTheDocument();
    });
  });

  it('shows individual SharePoint locations', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('https://contoso.sharepoint.com/sites/hr')).toBeInTheDocument();
    });
    expect(screen.getByText('https://contoso.sharepoint.com/sites/legal')).toBeInTheDocument();
  });

  it('shows "Not configured" for null/empty locations', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      const notConfigured = screen.getAllByText('Not configured');
      // OneDrive, M365 Groups, Skype, Public Folders = 4
      expect(notConfigured.length).toBe(4);
    });
  });

  it('shows all location type labels', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Exchange')).toBeInTheDocument();
    });
    expect(screen.getByText('SharePoint')).toBeInTheDocument();
    expect(screen.getByText('OneDrive')).toBeInTheDocument();
    expect(screen.getByText('M365 Groups')).toBeInTheDocument();
    expect(screen.getByText('Skype')).toBeInTheDocument();
    expect(screen.getByText('Public Folders')).toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <RetentionPolicyDetail policyName="Exchange 7yr Retention" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('Exchange 7yr Retention');
  });

  it('toggles raw JSON display', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    const user = userEvent.setup();
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Show raw JSON/));
    expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
    expect(screen.getByText(/"Exchange 7yr Retention"/)).toBeInTheDocument();

    await user.click(screen.getByText(/Hide raw JSON/));
    expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
  });

  it('displays error when fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Policy not found' });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Policy not found')).toBeInTheDocument();
    });
  });

  it('displays "Not found" when fetch fails without error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('displays "Not found" when data is null on success', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('shows N/A for null date fields', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockPolicy, WhenCreated: null, WhenChanged: null },
    });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles empty location arrays as "Not configured"', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        ...mockPolicy,
        ExchangeLocation: [],
        SharePointLocation: [],
      },
    });
    render(
      <RetentionPolicyDetail policyName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      const notConfigured = screen.getAllByText('Not configured');
      // All 6 locations should be "Not configured"
      expect(notConfigured.length).toBe(6);
    });
  });
});
