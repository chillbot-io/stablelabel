import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareLabelApply from '../../../renderer/components/FileShares/FileShareLabelApply';
import { mockInvoke } from '../../setup';

describe('FileShareLabelApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and form fields', () => {
    render(<FileShareLabelApply />);
    expect(screen.getByText('Apply Label to File')).toBeInTheDocument();
    expect(screen.getByText('File Path')).toBeInTheDocument();
    expect(screen.getByText('Label Name')).toBeInTheDocument();
  });

  it('shows error when path is empty', async () => {
    const user = userEvent.setup();
    render(<FileShareLabelApply />);
    // The apply button — the first one without "Dry Run" text
    const buttons = screen.getAllByRole('button');
    const applyBtn = buttons.find(b => b.textContent === 'Apply Label')!;
    await user.click(applyBtn);
    expect(screen.getByText('File path is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when neither label name nor ID is provided', async () => {
    const user = userEvent.setup();
    render(<FileShareLabelApply />);
    // First textbox is File Path
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share\\file.docx');
    const buttons = screen.getAllByRole('button');
    const applyBtn = buttons.find(b => b.textContent === 'Apply Label')!;
    await user.click(applyBtn);
    expect(screen.getByText(/Either Label Name or Label ID is required/)).toBeInTheDocument();
  });

  it('calls Set-SLFileShareLabel with label name', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: {} });
    render(<FileShareLabelApply />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\file.docx'); // File Path
    await user.type(inputs[1], 'Confidential'); // Label Name
    const buttons = screen.getAllByRole('button');
    const applyBtn = buttons.find(b => b.textContent === 'Apply Label')!;
    await user.click(applyBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLFileShareLabel',
        expect.objectContaining({
          Path: '\\\\server\\file.docx',
          LabelName: 'Confidential',
        })
      );
    });
  });

  it('shows success message after applying', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: {} });
    render(<FileShareLabelApply />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\file.docx');
    await user.type(inputs[1], 'Confidential');
    const buttons = screen.getAllByRole('button');
    const applyBtn = buttons.find(b => b.textContent === 'Apply Label')!;
    await user.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByText('Label applied successfully.')).toBeInTheDocument();
    });
  });

  it('includes DryRun flag when toggled', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: {} });
    render(<FileShareLabelApply />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\file.docx');
    await user.type(inputs[1], 'Confidential');
    // Enable dry run toggle
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    // Now button text changes to "Dry Run — Apply Label"
    const buttons = screen.getAllByRole('button');
    const dryRunBtn = buttons.find(b => b.textContent?.includes('Dry Run'))!;
    await user.click(dryRunBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLFileShareLabel',
        expect.objectContaining({
          Path: '\\\\server\\file.docx',
          LabelName: 'Confidential',
          DryRun: true,
        })
      );
    });
  });
});
