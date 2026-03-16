import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SnapshotDetail from '../../../renderer/components/Snapshots/SnapshotDetail';
import { mockInvoke } from '../../setup';

const mockSnapshot = {
  Name: 'pre-migration',
  SnapshotId: 'snap-id-123',
  Scope: 'All',
  CreatedAt: '2024-01-15 10:30',
  CreatedBy: 'admin@test.com',
  TenantId: 'tenant-abc',
  Path: '/snapshots/pre-migration.json',
  SizeMB: 2.456,
  Items: { Labels: 10, Policies: 5, DlpRules: 3 },
};

const mockDiff = {
  ReferenceSnapshot: 'pre-migration',
  ComparisonSource: 'Live',
  ComparedAt: '2024-01-20',
  HasChanges: true,
  Categories: {},
};

describe('SnapshotDetail', () => {
  const defaultProps = {
    snapshotName: 'pre-migration',
    onDeleted: vi.fn(),
    onCompare: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SnapshotDetail {...defaultProps} />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('renders snapshot details after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('pre-migration')).toBeInTheDocument();
    });
    expect(screen.getByText(/Captured 2024-01-15 10:30 by admin@test.com/)).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('snap-id-123')).toBeInTheDocument();
    expect(screen.getByText('tenant-abc')).toBeInTheDocument();
    expect(screen.getByText('2.46 MB')).toBeInTheDocument();
  });

  it('renders captured items section', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Captured Items')).toBeInTheDocument();
    });
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Policies')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not render items section when Items is empty', async () => {
    const snapNoItems = { ...mockSnapshot, Items: {} };
    mockInvoke.mockResolvedValue({ success: true, data: [snapNoItems] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('pre-migration')).toBeInTheDocument();
    });
    expect(screen.queryByText('Captured Items')).not.toBeInTheDocument();
  });

  it('shows error when snapshot not found', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [{ ...mockSnapshot, Name: 'other' }] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Snapshot not found')).toBeInTheDocument();
    });
  });

  it('shows error on failed invoke', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Access denied' });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failed invoke without message', async () => {
    mockInvoke.mockResolvedValue({ success: false });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows "Not found" when snap is null and no error', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Snapshot not found')).toBeInTheDocument();
    });
  });

  it('handles Compare to Live button click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Compare to Live')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockDiff });
    await user.click(screen.getByText('Compare to Live'));

    await waitFor(() => {
      expect(defaultProps.onCompare).toHaveBeenCalledWith(mockDiff);
    });
    expect(mockInvoke).toHaveBeenCalledWith("Compare-SLSnapshot -Name 'pre-migration' -Live");
  });

  it('shows comparing state on Compare button', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Compare to Live')).toBeInTheDocument();
    });

    mockInvoke.mockReturnValueOnce(new Promise(() => {})); // never resolves
    await user.click(screen.getByText('Compare to Live'));
    expect(screen.getByText('Comparing...')).toBeInTheDocument();
  });

  it('shows compare error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Compare to Live')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Compare failed' });
    await user.click(screen.getByText('Compare to Live'));

    await waitFor(() => {
      expect(screen.getByText('Compare failed')).toBeInTheDocument();
    });
  });

  it('shows compare error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Compare to Live')).toBeInTheDocument();
    });

    mockInvoke.mockRejectedValueOnce(new Error('Network fail'));
    await user.click(screen.getByText('Compare to Live'));

    await waitFor(() => {
      expect(screen.getByText('Network fail')).toBeInTheDocument();
    });
  });

  it('shows compare fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Compare to Live')).toBeInTheDocument();
    });

    mockInvoke.mockRejectedValueOnce('boom');
    await user.click(screen.getByText('Compare to Live'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows compare fallback when no error message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Compare to Live')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: false });
    await user.click(screen.getByText('Compare to Live'));

    await waitFor(() => {
      expect(screen.getByText('Compare failed')).toBeInTheDocument();
    });
  });

  it('opens delete confirm dialog', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));
    expect(screen.getAllByText('Delete Snapshot').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Permanently delete snapshot "pre-migration"/)).toBeInTheDocument();
  });

  it('cancels delete dialog', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));
    expect(screen.getAllByText('Delete Snapshot').length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('button', { name: 'Delete Snapshot' })).not.toBeInTheDocument();
  });

  it('executes delete and calls onDeleted', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));

    mockInvoke.mockResolvedValueOnce({ success: true });
    // Click the confirm button in the dialog
    const confirmBtn = screen.getByRole('button', { name: 'Delete Snapshot' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(defaultProps.onDeleted).toHaveBeenCalled();
    });
    expect(mockInvoke).toHaveBeenCalledWith("Remove-SLSnapshot -Name 'pre-migration' -Confirm:$false");
  });

  it('shows error when delete fails', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));

    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Delete failed' });
    const confirmBtn = screen.getByRole('button', { name: 'Delete Snapshot' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
  });

  it('shows error when delete throws exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));

    mockInvoke.mockRejectedValueOnce(new Error('Timeout'));
    const confirmBtn = screen.getByRole('button', { name: 'Delete Snapshot' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows fallback error when delete throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));

    mockInvoke.mockRejectedValueOnce('string error');
    const confirmBtn = screen.getByRole('button', { name: 'Delete Snapshot' });
    await user.click(confirmBtn);

    await waitFor(() => {
      // The error message will be 'Failed' from the catch block
      expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    });
  });

  it('shows fallback error when delete fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete'));

    mockInvoke.mockResolvedValueOnce({ success: false });
    const confirmBtn = screen.getByRole('button', { name: 'Delete Snapshot' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
  });

  it('escapes single quotes in snapshot name for commands', async () => {
    const user = userEvent.setup();
    const propsWithQuote = { ...defaultProps, snapshotName: "it's-a-test" };
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: [{ ...mockSnapshot, Name: "it's-a-test" }],
    });
    render(<SnapshotDetail {...propsWithQuote} />);

    await waitFor(() => {
      expect(screen.getByText("it's-a-test")).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockDiff });
    await user.click(screen.getByText('Compare to Live'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Compare-SLSnapshot -Name 'it''s-a-test' -Live");
    });
  });

  it('renders File Path card', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshot] });
    render(<SnapshotDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('File Path')).toBeInTheDocument();
    });
    expect(screen.getByText('/snapshots/pre-migration.json')).toBeInTheDocument();
  });

  it('refetches when snapshotName prop changes', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockSnapshot] });
    const { rerender } = render(<SnapshotDetail {...defaultProps} snapshotName="pre-migration" />);

    await waitFor(() => {
      expect(screen.getByText('pre-migration')).toBeInTheDocument();
    });

    const snap2 = { ...mockSnapshot, Name: 'post-migration' };
    mockInvoke.mockResolvedValue({ success: true, data: [snap2] });
    rerender(<SnapshotDetail {...defaultProps} snapshotName="post-migration" />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });
});
