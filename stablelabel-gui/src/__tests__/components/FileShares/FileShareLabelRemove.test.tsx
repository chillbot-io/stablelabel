import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareLabelRemove from '../../../renderer/components/FileShares/FileShareLabelRemove';
import { mockInvoke } from '../../setup';

describe('FileShareLabelRemove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    render(<FileShareLabelRemove />);
    expect(screen.getByText('Remove Label from File')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Label' })).toBeInTheDocument();
  });

  it('shows error when path is empty', async () => {
    const user = userEvent.setup();
    render(<FileShareLabelRemove />);
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));
    expect(screen.getByText('File path is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calls Remove-SLFileShareLabel on submit', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: {} });
    render(<FileShareLabelRemove />);

    await user.type(screen.getByPlaceholderText(/server.*share.*file/i), '\\\\server\\file.docx');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Remove-SLFileShareLabel',
        expect.objectContaining({
          Path: '\\\\server\\file.docx',
        })
      );
    });
  });

  it('shows success message after removal', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: {} });
    render(<FileShareLabelRemove />);

    await user.type(screen.getByPlaceholderText(/server.*share.*file/i), '\\\\server\\file.docx');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('Label removed successfully.')).toBeInTheDocument();
    });
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'File not found' });
    render(<FileShareLabelRemove />);

    await user.type(screen.getByPlaceholderText(/server.*share.*file/i), '\\\\server\\file.docx');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('File not found')).toBeInTheDocument();
    });
  });
});
