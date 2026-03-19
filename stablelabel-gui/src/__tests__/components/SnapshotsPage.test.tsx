import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SnapshotsPage from '../../renderer/components/Snapshots/SnapshotsPage';
import { mockInvoke } from '../setup';

describe('SnapshotsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('renders the page title', () => {
    render(<SnapshotsPage />);
    expect(screen.getByText('Snapshots')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<SnapshotsPage />);
    expect(screen.getByText('Capture, compare, and restore tenant config')).toBeInTheDocument();
  });

  it('shows empty workspace message', () => {
    render(<SnapshotsPage />);
    expect(screen.getAllByText(/Select a snapshot or create new/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows descriptive text in empty workspace', () => {
    render(<SnapshotsPage />);
    expect(screen.getByText(/Snapshots capture your tenant/)).toBeInTheDocument();
  });

  it('has New Snapshot buttons in sidebar and workspace', () => {
    render(<SnapshotsPage />);
    const buttons = screen.getAllByText('+ New Snapshot');
    expect(buttons.length).toBe(2); // one in sidebar, one in workspace
  });

  it('switches to create view when sidebar New Snapshot clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotsPage />);

    const newButtons = screen.getAllByText('+ New Snapshot');
    // The sidebar button is the one in the bottom panel
    await user.click(newButtons[0]);
    expect(screen.queryAllByText(/Select a snapshot or create new/).length).toBe(0);
  });

  it('switches to create view when workspace New Snapshot clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotsPage />);

    const newButtons = screen.getAllByText('+ New Snapshot');
    await user.click(newButtons[1]);
    expect(screen.queryAllByText(/Select a snapshot or create new/).length).toBe(0);
  });

  it('opens detail view when a snapshot is selected from list', async () => {
    const snapshots = [
      { Name: 'snap-2026-01', SnapshotId: 'id1', CreatedAt: '2026-01-01', Scope: 'Full', SizeMB: 1.2 },
    ];
    mockInvoke.mockResolvedValue({ success: true, data: snapshots });

    const user = userEvent.setup();
    render(<SnapshotsPage />);

    await waitFor(() => {
      expect(screen.getByText('snap-2026-01')).toBeInTheDocument();
    });

    await user.click(screen.getByText('snap-2026-01'));

    // The empty workspace should be gone - detail view takes its place
    expect(screen.queryByText(/Select a snapshot or create new/)).not.toBeInTheDocument();
  });

  it('shows SnapshotList with search input', async () => {
    render(<SnapshotsPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search snapshots...')).toBeInTheDocument();
    });
  });

  it('shows snapshot count in list', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<SnapshotsPage />);
    await waitFor(() => {
      expect(screen.getByText('0 snapshots')).toBeInTheDocument();
    });
  });

  it('displays multiple snapshots in list', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: [
        { Name: 'snap-A', SnapshotId: 'id1', CreatedAt: '2026-01-01', Scope: 'Full', SizeMB: 1.0 },
        { Name: 'snap-B', SnapshotId: 'id2', CreatedAt: '2026-02-01', Scope: 'Labels', SizeMB: 0.5 },
      ],
    });

    render(<SnapshotsPage />);
    await waitFor(() => {
      expect(screen.getByText('snap-A')).toBeInTheDocument();
      expect(screen.getByText('snap-B')).toBeInTheDocument();
      expect(screen.getByText('2 snapshots')).toBeInTheDocument();
    });
  });

  it('shows error state when snapshot fetch fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Not connected' });

    render(<SnapshotsPage />);
    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });
  });

  it('has Retry button on error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Fetch failed' });

    render(<SnapshotsPage />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('selects a snapshot and removes empty workspace', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      success: true,
      data: [
        { Name: 'snap-selected', SnapshotId: 'id1', CreatedAt: '2026-01-01', Scope: 'Full', SizeMB: 1.0 },
      ],
    });

    render(<SnapshotsPage />);
    await waitFor(() => {
      expect(screen.getByText('snap-selected')).toBeInTheDocument();
    });

    await user.click(screen.getByText('snap-selected'));
    // Empty workspace message should be gone
    expect(screen.queryByText(/Select a snapshot or create new/)).not.toBeInTheDocument();
  });

  it('fetches snapshots on mount', async () => {
    render(<SnapshotsPage />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Get-SLSnapshot');
    });
  });
});
