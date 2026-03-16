import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareConnect from '../../../renderer/components/FileShares/FileShareConnect';
import { mockInvoke } from '../../setup';

describe('FileShareConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('renders the heading and form fields', () => {
    render(<FileShareConnect />);
    expect(screen.getByText('Connect to File Share')).toBeInTheDocument();
    expect(screen.getByText('UNC Path')).toBeInTheDocument();
    expect(screen.getByText('Drive Letter')).toBeInTheDocument();
    expect(screen.getByText('Friendly Name')).toBeInTheDocument();
  });

  it('shows error when path is empty', async () => {
    const user = userEvent.setup();
    render(<FileShareConnect />);

    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByText(/UNC path is required/)).toBeInTheDocument();
  });

  it('calls Connect-SLFileShare with correct command', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] }) // initial list
      .mockResolvedValueOnce({
        success: true,
        data: { Name: 'Test', Path: '\\\\myserver\\data', DriveLetter: 'X', Server: 'myserver', ShareName: 'data', ConnectedAt: '2026-01-01', AuthType: 'Integrated' },
      })
      .mockResolvedValue({ success: true, data: [] }); // refresh list

    render(<FileShareConnect />);

    // First textbox is UNC Path
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\myserver\\data');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.stringContaining('Connect-SLFileShare')
      );
    });
  });

  it('shows success message after connection', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({
        success: true,
        data: { Name: '', Path: '\\\\server\\share', DriveLetter: 'Z', Server: 'server', ShareName: 'share', ConnectedAt: '2026-01-01', AuthType: 'Integrated' },
      })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText(/Connected to/)).toBeInTheDocument();
    });
  });

  it('shows error on failed connection', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: false, data: null, error: 'Access denied' });

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  it('shows "No active connections" when list is empty', async () => {
    render(<FileShareConnect />);
    await waitFor(() => {
      expect(screen.getByText('No active connections.')).toBeInTheDocument();
    });
  });
});
