import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('has New Snapshot button', () => {
    render(<SnapshotsPage />);
    expect(screen.getAllByText('+ New Snapshot').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to create view when New Snapshot clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotsPage />);

    const newButtons = screen.getAllByText('+ New Snapshot');
    await user.click(newButtons[0]);
    // The empty workspace message should be gone
    expect(screen.queryAllByText(/Select a snapshot or create new/).length).toBe(0);
  });
});
