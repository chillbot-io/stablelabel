import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyList from '../../../renderer/components/Labels/PolicyList';
import { mockInvoke } from '../../setup';

const mockPolicies = [
  {
    Name: 'Global Policy',
    Guid: 'guid-1',
    Labels: ['Confidential', 'Public'],
    Comment: 'Default org policy',
    Enabled: true,
    CreatedBy: 'admin@contoso.com',
    WhenCreated: '2024-01-01T00:00:00Z',
    WhenChanged: null,
    Mode: null,
    Type: null,
    ExchangeLocation: ['All'],
    SharePointLocation: null,
    OneDriveLocation: null,
  },
  {
    Name: 'Finance Policy',
    Guid: 'guid-2',
    Labels: ['Finance-Confidential'],
    Comment: null,
    Enabled: false,
    CreatedBy: 'admin@contoso.com',
    WhenCreated: '2024-02-01T00:00:00Z',
    WhenChanged: null,
    Mode: null,
    Type: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
  },
];

describe('PolicyList', () => {
  const onOpenPolicy = vi.fn();
  const onNewPolicy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('renders policies after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    expect(screen.getByText('Finance Policy')).toBeInTheDocument();
    expect(screen.getByText('2 label policies')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabelPolicy');
  });

  it('shows singular "policy" for single item', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockPolicies[0]] });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('1 label policy')).toBeInTheDocument();
    });
  });

  it('shows Enabled/Disabled badges', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows label count for each policy', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('2 labels')).toBeInTheDocument();
    });

    expect(screen.getByText('1 labels')).toBeInTheDocument();
  });

  it('shows comment when present', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Default org policy')).toBeInTheDocument();
    });
  });

  it('calls onOpenPolicy when clicking a policy', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Global Policy'));
    expect(onOpenPolicy).toHaveBeenCalledWith('Global Policy');
  });

  it('calls onNewPolicy when clicking new policy button', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('+ New Label Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Label Policy'));
    expect(onNewPolicy).toHaveBeenCalledOnce();
  });

  it('shows error state and Retry button on failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Access denied' });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows default error when no error string', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load policies')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    mockInvoke.mockRejectedValue('some string');
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load policies')).toBeInTheDocument();
    });
  });

  it('retries on Retry click', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Fail' });
    const user = userEvent.setup();
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Fail')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockPolicies });
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });
  });

  it('refreshes on Refresh click', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockPolicies[0]] });
    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByText('1 label policy')).toBeInTheDocument();
    });
  });

  it('filters policies by search', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search policies...');
    await user.type(searchInput, 'Finance');

    expect(screen.getByText('Finance Policy')).toBeInTheDocument();
    expect(screen.queryByText('Global Policy')).not.toBeInTheDocument();
  });

  it('shows "No policies found" when filter matches nothing', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    const user = userEvent.setup();
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search policies...');
    await user.type(searchInput, 'zzzzz');

    expect(screen.getByText('No policies found.')).toBeInTheDocument();
  });

  it('shows empty list message when no policies exist', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('No policies found.')).toBeInTheDocument();
    });

    expect(screen.getByText('0 label policies')).toBeInTheDocument();
  });

  it('handles non-array data as error', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not an array' });
    render(<PolicyList onOpenPolicy={onOpenPolicy} onNewPolicy={onNewPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load policies')).toBeInTheDocument();
    });
  });
});
