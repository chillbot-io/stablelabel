import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareConnect from '../../../renderer/components/FileShares/FileShareConnect';
import { mockInvoke } from '../../setup';

const mockConnection = {
  Name: 'Finance',
  Path: '\\\\server\\finance',
  DriveLetter: 'Z',
  Server: 'server',
  ShareName: 'finance',
  ConnectedAt: '2026-01-01',
  AuthType: 'Integrated',
};

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
      .mockResolvedValueOnce({ success: true, data: mockConnection })
      .mockResolvedValue({ success: true, data: [] }); // refresh list

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\myserver\\data');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Connect-SLFileShare',
        expect.objectContaining({
          Path: '\\\\myserver\\data',
        })
      );
    });
  });

  it('sends drive letter and name when provided', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: mockConnection })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.type(inputs[1], 'Z');
    await user.type(inputs[2], 'MyShare');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Connect-SLFileShare',
        expect.objectContaining({
          Path: '\\\\server\\share',
          DriveLetter: 'Z',
          Name: 'MyShare',
        })
      );
    });
  });

  it('shows success message after connection', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: mockConnection })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\finance');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText(/Connected to/)).toBeInTheDocument();
    });
  });

  it('clears form fields after successful connection', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: mockConnection })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText(/Connected to/)).toBeInTheDocument();
    });
    // Form should be cleared
    expect(inputs[0]).toHaveValue('');
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

  it('shows fallback error when no error message', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: false, data: null });

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to connect')).toBeInTheDocument();
    });
  });

  it('shows error when connect throws', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockRejectedValueOnce(new Error('Network down'));

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });

  it('shows "No active connections" when list is empty', async () => {
    render(<FileShareConnect />);
    await waitFor(() => {
      expect(screen.getByText('No active connections.')).toBeInTheDocument();
    });
  });

  it('renders active connections list', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockConnection] });
    render(<FileShareConnect />);
    await waitFor(() => {
      expect(screen.getByText('Finance')).toBeInTheDocument();
    });
    expect(screen.getByText(/server\/finance/)).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('shows Disconnect All button when connections exist', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockConnection] });
    render(<FileShareConnect />);
    await waitFor(() => {
      expect(screen.getByText('Disconnect All')).toBeInTheDocument();
    });
  });

  it('does not show Disconnect All when no connections', async () => {
    render(<FileShareConnect />);
    await waitFor(() => {
      expect(screen.getByText('No active connections.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Disconnect All')).not.toBeInTheDocument();
  });

  it('calls Disconnect-SLFileShare when disconnect clicked', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [mockConnection] })
      .mockResolvedValueOnce({ success: true, data: null })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    await waitFor(() => {
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Disconnect-SLFileShare',
        expect.objectContaining({
          Path: '\\\\server\\finance',
        })
      );
    });
  });

  it('calls Disconnect-SLFileShare -All when Disconnect All clicked', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [mockConnection] })
      .mockResolvedValueOnce({ success: true, data: { Disconnected: 1 } })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    await waitFor(() => {
      expect(screen.getByText('Disconnect All')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Disconnect All'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Disconnect-SLFileShare',
        expect.objectContaining({ All: true })
      );
    });
  });

  it('shows success after disconnect all', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [mockConnection] })
      .mockResolvedValueOnce({ success: true, data: { Disconnected: 1 } })
      .mockResolvedValue({ success: true, data: [] });

    render(<FileShareConnect />);

    await waitFor(() => {
      expect(screen.getByText('Disconnect All')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Disconnect All'));

    await waitFor(() => {
      expect(screen.getByText(/Disconnected 1 share/)).toBeInTheDocument();
    });
  });

  it('shows button text as Connecting... while loading', async () => {
    const user = userEvent.setup();
    // Never resolve the connect call
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockReturnValueOnce(new Promise(() => {}));

    render(<FileShareConnect />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });
});
