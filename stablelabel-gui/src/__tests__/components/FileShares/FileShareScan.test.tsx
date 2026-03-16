import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareScan from '../../../renderer/components/FileShares/FileShareScan';
import { mockInvoke } from '../../setup';

describe('FileShareScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading', () => {
    render(<FileShareScan />);
    expect(screen.getByText('Scan File Share')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Scan' })).toBeInTheDocument();
  });

  it('shows error when path is empty', async () => {
    const user = userEvent.setup();
    render(<FileShareScan />);
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));
    expect(screen.getByText('Path is required.')).toBeInTheDocument();
  });

  it('displays scan results after successful scan', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        Action: 'Get-FileShareScan',
        Path: '\\\\server\\share',
        TotalFiles: 50,
        SupportedFiles: 40,
        UnsupportedFiles: 10,
        LabeledFiles: 25,
        UnlabeledFiles: 15,
        FilesByLabel: { 'Confidential': 25 },
        FilesByExtension: { '.docx': 30, '.pdf': 20 },
        ScanDuration: '00:00:05',
        Details: [
          { FullPath: '\\\\s\\doc.docx', FileName: 'doc.docx', Extension: '.docx', SizeKB: 10, IsLabeled: true, LabelName: 'Confidential', SubLabelName: null, IsProtected: false, ScanStatus: 'Success', Error: null },
        ],
      },
    });
    render(<FileShareScan />);

    // First textbox is Directory Path
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument(); // Total
    });
    expect(screen.getByText('doc.docx')).toBeInTheDocument();
    expect(screen.getByText(/00:00:05/)).toBeInTheDocument();
  });
});
