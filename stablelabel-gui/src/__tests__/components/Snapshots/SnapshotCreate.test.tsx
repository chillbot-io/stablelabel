import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SnapshotCreate from '../../../renderer/components/Snapshots/SnapshotCreate';
import { mockInvoke } from '../../setup';

describe('SnapshotCreate', () => {
  const defaultProps = {
    onCreated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form title and description', () => {
    render(<SnapshotCreate {...defaultProps} />);
    expect(screen.getByText('New Snapshot')).toBeInTheDocument();
    expect(screen.getByText(/Capture current label configuration/)).toBeInTheDocument();
  });

  it('renders name input field', () => {
    render(<SnapshotCreate {...defaultProps} />);
    expect(screen.getByText('Snapshot Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., pre-migration-2024')).toBeInTheDocument();
  });

  it('renders scope selector with all options', () => {
    render(<SnapshotCreate {...defaultProps} />);
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('All (Labels + Auto-Label Policies)')).toBeInTheDocument();
    expect(screen.getByText('Labels Only')).toBeInTheDocument();
    expect(screen.getByText('Auto-Label Policies Only')).toBeInTheDocument();
  });

  it('renders the Create Snapshot button', () => {
    render(<SnapshotCreate {...defaultProps} />);
    expect(screen.getByText('Create Snapshot')).toBeInTheDocument();
  });

  it('shows error when name is empty on submit', async () => {
    const user = userEvent.setup();
    render(<SnapshotCreate {...defaultProps} />);

    await user.click(screen.getByText('Create Snapshot'));

    expect(screen.getByText('Snapshot name is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when name is only whitespace on submit', async () => {
    const user = userEvent.setup();
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, '   ');
    await user.click(screen.getByText('Create Snapshot'));

    expect(screen.getByText('Snapshot name is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('creates snapshot with correct command and default scope', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true });
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'my-snapshot');
    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('New-SLSnapshot', { Name: 'my-snapshot', Scope: 'All' });
    });
    expect(defaultProps.onCreated).toHaveBeenCalledWith('my-snapshot');
  });

  it('creates snapshot with selected scope', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true });
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'labels-only');

    const select = screen.getByDisplayValue('All (Labels + Auto-Label Policies)');
    await user.selectOptions(select, 'Labels');

    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('New-SLSnapshot', { Name: 'labels-only', Scope: 'Labels' });
    });
  });

  it('shows loading state during creation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'test');
    await user.click(screen.getByText('Create Snapshot'));

    expect(screen.getByText('Capturing...')).toBeInTheDocument();
  });

  it('shows error on failed creation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Insufficient permissions' });
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'test');
    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    });
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });

  it('shows fallback error when creation fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'test');
    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create snapshot')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Timeout'));
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'test');
    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(42);
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, 'test');
    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('passes special characters as raw values in snapshot name', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true });
    render(<SnapshotCreate {...defaultProps} />);

    const input = screen.getByPlaceholderText('e.g., pre-migration-2024');
    await user.type(input, "it's");
    await user.click(screen.getByText('Create Snapshot'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('New-SLSnapshot', { Name: "it's", Scope: 'All' });
    });
  });

  it('renders scope help text', () => {
    render(<SnapshotCreate {...defaultProps} />);
    expect(screen.getByText(/What to capture/)).toBeInTheDocument();
  });
});
