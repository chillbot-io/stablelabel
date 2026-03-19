import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionPolicyList from '../../../renderer/components/Retention/RetentionPolicyList';
import { mockInvoke } from '../../setup';

const mockPolicies = [
  {
    Name: 'Exchange 7yr Retention',
    Guid: 'pol-1',
    Comment: 'Exchange mailbox retention',
    Enabled: true,
    Mode: 'Enforce',
    WhenCreated: '2024-01-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: ['All'],
    SharePointLocation: null,
    OneDriveLocation: null,
    ModernGroupLocation: null,
    SkypeLocation: null,
    PublicFolderLocation: null,
  },
  {
    Name: 'SharePoint Cleanup',
    Guid: 'pol-2',
    Comment: null,
    Enabled: false,
    Mode: 'Simulate',
    WhenCreated: '2024-02-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: null,
    SharePointLocation: ['https://contoso.sharepoint.com'],
    OneDriveLocation: ['All'],
    ModernGroupLocation: ['All'],
    SkypeLocation: ['user@contoso.com'],
    PublicFolderLocation: ['All'],
  },
  {
    Name: 'Empty Policy',
    Guid: 'pol-3',
    Comment: null,
    Enabled: true,
    Mode: null,
    WhenCreated: '2024-03-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    ModernGroupLocation: null,
    SkypeLocation: null,
    PublicFolderLocation: null,
  },
];

describe('RetentionPolicyList', () => {
  const onOpenPolicy = vi.fn();
  const onNewPolicy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />,
    );
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('displays policies after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });
    expect(screen.getByText('SharePoint Cleanup')).toBeInTheDocument();
    expect(screen.getByText('Empty Policy')).toBeInTheDocument();
    expect(screen.getByText('3 retention policies')).toBeInTheDocument();
  });

  it('shows singular "policy" when there is exactly one', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockPolicies[0]] });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('1 retention policy')).toBeInTheDocument();
    });
  });

  it('shows Enabled/Disabled badges correctly', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      const enabledBadges = screen.getAllByText('Enabled');
      expect(enabledBadges.length).toBe(2); // Exchange 7yr + Empty Policy
    });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows correct location counts', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      // Exchange 7yr: 1 location (Exchange)
      expect(screen.getByText('1 location')).toBeInTheDocument();
      // SharePoint Cleanup: 5 locations
      expect(screen.getByText('5 locations')).toBeInTheDocument();
      // Empty Policy: 0 locations
      expect(screen.getByText('0 locations')).toBeInTheDocument();
    });
  });

  it('shows comment for policies that have one', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Exchange mailbox retention')).toBeInTheDocument();
    });
  });

  it('calls onOpenPolicy when a policy is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Exchange 7yr Retention'));
    expect(onOpenPolicy).toHaveBeenCalledWith('Exchange 7yr Retention');
  });

  it('calls onNewPolicy when New Retention Policy button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('+ New Retention Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Retention Policy'));
    expect(onNewPolicy).toHaveBeenCalledTimes(1);
  });

  it('refreshes when Refresh button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: [mockPolicies[0]] });
    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByText('1 retention policy')).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('filters policies by search input', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search retention policies...'), 'SharePoint');

    expect(screen.getByText('SharePoint Cleanup')).toBeInTheDocument();
    expect(screen.queryByText('Exchange 7yr Retention')).not.toBeInTheDocument();
    expect(screen.queryByText('Empty Policy')).not.toBeInTheDocument();
  });

  it('shows "No retention policies found" when search yields no results', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search retention policies...'), 'zzzzz');
    expect(screen.getByText('No retention policies found.')).toBeInTheDocument();
  });

  it('shows empty state when no policies exist', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('No retention policies found.')).toBeInTheDocument();
    });
    expect(screen.getByText('0 retention policies')).toBeInTheDocument();
  });

  it('displays error when fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Access denied' });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('displays fallback error when fetch fails without error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load retention policies')).toBeInTheDocument();
    });
  });

  it('displays error when fetch throws an Error', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays fallback error when fetch throws a non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('retries fetch when Retry button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Oops' });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Oops')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });
  });

  it('sends the correct PowerShell command', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLRetentionPolicy', undefined);
    });
  });

  it('is case-insensitive when searching', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search retention policies...'), 'exchange');
    expect(screen.getByText('Exchange 7yr Retention')).toBeInTheDocument();
  });

  it('handles non-array success data as error', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not an array' });
    render(<RetentionPolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load retention policies')).toBeInTheDocument();
    });
  });
});
