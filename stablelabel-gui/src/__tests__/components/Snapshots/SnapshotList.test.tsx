import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SnapshotList from '../../../renderer/components/Snapshots/SnapshotList';
import { mockInvoke } from '../../setup';

const mockSnapshots = [
  {
    Name: 'snap-1',
    SnapshotId: 'id-1',
    Scope: 'All',
    CreatedAt: '2024-01-15',
    CreatedBy: 'admin@test.com',
    TenantId: 'tenant-1',
    Path: '/snapshots/snap-1.json',
    SizeMB: 1.5,
    Items: { Labels: 10, Policies: 5 },
  },
  {
    Name: 'snap-2',
    SnapshotId: 'id-2',
    Scope: 'Labels',
    CreatedAt: '2024-01-16',
    CreatedBy: 'admin@test.com',
    TenantId: 'tenant-1',
    Path: '/snapshots/snap-2.json',
    SizeMB: 0.8,
    Items: { Labels: 8 },
  },
];

describe('SnapshotList', () => {
  const defaultProps = {
    onSelect: vi.fn(),
    selectedName: null as string | null,
    refreshKey: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<SnapshotList {...defaultProps} />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('renders snapshot items after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSnapshots });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('snap-1')).toBeInTheDocument();
    });
    expect(screen.getByText('snap-2')).toBeInTheDocument();
    expect(screen.getByText('2 snapshots')).toBeInTheDocument();
  });

  it('displays singular "snapshot" for single item', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshots[0]] });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('1 snapshot')).toBeInTheDocument();
    });
  });

  it('shows empty state when no snapshots', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/No snapshots found/)).toBeInTheDocument();
    });
    expect(screen.getByText('0 snapshots')).toBeInTheDocument();
  });

  it('shows error message on failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Connection lost' });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows fallback error when no error message provided', async () => {
    mockInvoke.mockResolvedValue({ success: false });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('calls onSelect when a snapshot is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockSnapshots });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('snap-1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('snap-1'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith('snap-1');
  });

  it('highlights the selected snapshot', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSnapshots });
    render(<SnapshotList {...defaultProps} selectedName="snap-1" />);

    await waitFor(() => {
      expect(screen.getByText('snap-1')).toBeInTheDocument();
    });

    const button = screen.getByText('snap-1').closest('button');
    expect(button?.className).toContain('bg-white/[0.06]');
    expect(button?.className).toContain('border-blue-400');
  });

  it('shows scope and size for each snapshot', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSnapshots });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('1.5MB')).toBeInTheDocument();
    expect(screen.getByText('0.8MB')).toBeInTheDocument();
  });

  it('retries fetch on Retry button click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Error' });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockSnapshots });
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('snap-1')).toBeInTheDocument();
    });
  });

  it('refreshes on Refresh button click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockSnapshots });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('snap-1')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshots[0]] });
    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByText('1 snapshot')).toBeInTheDocument();
    });
  });

  it('refetches when refreshKey changes', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSnapshots });
    const { rerender } = render(<SnapshotList {...defaultProps} refreshKey={0} />);

    await waitFor(() => {
      expect(screen.getByText('snap-1')).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    rerender(<SnapshotList {...defaultProps} refreshKey={1} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });

  it('calls invoke with Get-SLSnapshot command', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLSnapshot', undefined);
    });
  });

  it('handles non-array data gracefully', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not an array' });
    render(<SnapshotList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });
});
