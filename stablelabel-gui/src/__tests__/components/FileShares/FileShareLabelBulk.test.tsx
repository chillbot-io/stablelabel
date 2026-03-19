import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareLabelBulk from '../../../renderer/components/FileShares/FileShareLabelBulk';
import { mockInvoke } from '../../setup';

describe('FileShareLabelBulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    render(<FileShareLabelBulk />);
    expect(screen.getByText('Bulk Apply Labels')).toBeInTheDocument();
  });

  it('shows error when path is empty', async () => {
    const user = userEvent.setup();
    render(<FileShareLabelBulk />);
    await user.click(screen.getByRole('button', { name: /Bulk Apply/i }));
    expect(screen.getByText('Directory path is required.')).toBeInTheDocument();
  });

  it('shows error when neither label name nor ID is provided', async () => {
    const user = userEvent.setup();
    render(<FileShareLabelBulk />);
    await user.type(screen.getByPlaceholderText(/server.*share.*folder/i), '\\\\server\\share\\folder');
    await user.click(screen.getByRole('button', { name: /Bulk Apply/i }));
    expect(screen.getByText(/Either Label Name or Label ID is required/)).toBeInTheDocument();
  });

  it('calls Set-SLFileShareLabelBulk with correct params', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { Action: 'Set-FileShareLabelBulk', Path: '\\\\server\\share', TotalFiles: 3, SuccessCount: 3, FailedCount: 0, SkippedCount: 0, SensitivityLabelId: 'id-1', Results: [], DryRun: true },
    });
    render(<FileShareLabelBulk />);

    await user.type(screen.getByPlaceholderText(/server.*share.*folder/i), '\\\\server\\share\\folder');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');
    await user.click(screen.getByRole('button', { name: /Bulk Apply/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLFileShareLabelBulk',
        expect.objectContaining({
          Path: '\\\\server\\share\\folder',
          LabelName: 'Confidential',
        })
      );
    });
  });

  it('displays bulk result summary', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        Action: 'Set-FileShareLabelBulk',
        Path: '\\\\server\\share',
        TotalFiles: 10,
        SuccessCount: 8,
        FailedCount: 1,
        SkippedCount: 1,
        SensitivityLabelId: 'id-1',
        Results: [],
        DryRun: false,
      },
    });
    render(<FileShareLabelBulk />);

    await user.type(screen.getByPlaceholderText(/server.*share.*folder/i), '\\\\server\\share\\folder');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');
    await user.click(screen.getByRole('button', { name: /Bulk Apply/i }));

    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument(); // Success
    });
  });
});
