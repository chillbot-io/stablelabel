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
});
