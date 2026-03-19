import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutoLabelList from '../../../renderer/components/Labels/AutoLabelList';
import { mockInvoke } from '../../setup';

const mockPolicies = [
  {
    Name: 'PII Auto-Label',
    Guid: 'guid-auto-1',
    Comment: null,
    Enabled: true,
    Mode: 'Enable',
    WhenCreated: '2024-01-01T00:00:00Z',
    WhenChanged: null,
    ApplySensitivityLabel: 'Confidential',
    ExchangeLocation: ['All'],
    SharePointLocation: null,
    OneDriveLocation: null,
    Priority: 0,
  },
  {
    Name: 'Credit Card Detection',
    Guid: 'guid-auto-2',
    Comment: null,
    Enabled: true,
    Mode: 'TestWithNotifications',
    WhenCreated: '2024-02-01T00:00:00Z',
    WhenChanged: null,
    ApplySensitivityLabel: 'Highly Confidential',
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    Priority: 1,
  },
  {
    Name: 'SSN Scanner',
    Guid: 'guid-auto-3',
    Comment: null,
    Enabled: false,
    Mode: 'TestWithoutNotifications',
    WhenCreated: '2024-03-01T00:00:00Z',
    WhenChanged: null,
    ApplySensitivityLabel: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    Priority: null,
  },
  {
    Name: 'Unknown Mode Policy',
    Guid: 'guid-auto-4',
    Comment: null,
    Enabled: true,
    Mode: 'CustomMode',
    WhenCreated: '2024-04-01T00:00:00Z',
    WhenChanged: null,
    ApplySensitivityLabel: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    Priority: null,
  },
  {
    Name: 'Null Mode Policy',
    Guid: 'guid-auto-5',
    Comment: null,
    Enabled: true,
    Mode: null,
    WhenCreated: '2024-05-01T00:00:00Z',
    WhenChanged: null,
    ApplySensitivityLabel: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    Priority: null,
  },
];

describe('AutoLabelList', () => {
  const onOpenAutoLabel = vi.fn();
  const onNewAutoLabel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('renders policies after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    expect(screen.getByText('Credit Card Detection')).toBeInTheDocument();
    expect(screen.getByText('SSN Scanner')).toBeInTheDocument();
    expect(screen.getByText('5 auto-label policies')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLAutoLabelPolicy', undefined);
  });

  it('shows singular "policy" for single item', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockPolicies[0]] });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('1 auto-label policy')).toBeInTheDocument();
    });
  });

  it('shows mode badges correctly', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Enforcing')).toBeInTheDocument();
    });

    expect(screen.getByText('Simulation + Notify')).toBeInTheDocument();
    expect(screen.getByText('Simulation')).toBeInTheDocument();
    expect(screen.getByText('CustomMode')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows "Applies:" label for policies with ApplySensitivityLabel', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Applies: Confidential')).toBeInTheDocument();
    });

    expect(screen.getByText('Applies: Highly Confidential')).toBeInTheDocument();
  });

  it('shows priority for policies that have one', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Priority 0')).toBeInTheDocument();
    });

    expect(screen.getByText('Priority 1')).toBeInTheDocument();
  });

  it('calls onOpenAutoLabel when clicking a policy', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    await user.click(screen.getByText('PII Auto-Label'));
    expect(onOpenAutoLabel).toHaveBeenCalledWith('PII Auto-Label');
  });

  it('calls onNewAutoLabel when clicking new button', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('+ New Auto-Label Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Auto-Label Policy'));
    expect(onNewAutoLabel).toHaveBeenCalledOnce();
  });

  it('shows error state and Retry button', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Not connected' });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows default error when no error string', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load auto-label policies')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing', async () => {
    mockInvoke.mockRejectedValue(new Error('Timeout'));
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load auto-label policies')).toBeInTheDocument();
    });
  });

  it('retries on Retry click', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Fail' });
    const user = userEvent.setup();
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Fail')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockPolicies });
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });
  });

  it('refreshes on Refresh click', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockPolicies[0]] });
    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByText('1 auto-label policy')).toBeInTheDocument();
    });
  });

  it('filters by search query', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search auto-label policies...');
    await user.type(searchInput, 'Credit');

    expect(screen.getByText('Credit Card Detection')).toBeInTheDocument();
    expect(screen.queryByText('PII Auto-Label')).not.toBeInTheDocument();
  });

  it('shows empty message when filter matches nothing', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('PII Auto-Label')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search auto-label policies...');
    await user.type(searchInput, 'zzzzz');

    expect(screen.getByText('No auto-label policies found.')).toBeInTheDocument();
  });

  it('shows empty message when no policies exist', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('No auto-label policies found.')).toBeInTheDocument();
    });

    expect(screen.getByText('0 auto-label policies')).toBeInTheDocument();
  });

  it('handles non-array data as error', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not array' });
    render(<AutoLabelList onOpenAutoLabel={onOpenAutoLabel} onNewAutoLabel={onNewAutoLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load auto-label policies')).toBeInTheDocument();
    });
  });
});
