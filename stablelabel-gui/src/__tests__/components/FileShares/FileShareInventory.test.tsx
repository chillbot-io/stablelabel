import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileShareInventory from '../../../renderer/components/FileShares/FileShareInventory';
import { mockInvoke } from '../../setup';

describe('FileShareInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and form', () => {
    render(<FileShareInventory />);
    expect(screen.getByText('File Share Inventory')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Inventory' })).toBeInTheDocument();
  });

  it('shows error when path is empty', async () => {
    const user = userEvent.setup();
    render(<FileShareInventory />);
    await user.click(screen.getByRole('button', { name: 'Get Inventory' }));
    expect(screen.getByText('Path is required.')).toBeInTheDocument();
  });

  it('displays inventory summary after successful fetch', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        Action: 'Get-FileShareInventory',
        Summary: { TotalFiles: 10, LabeledCount: 7, UnlabeledCount: 3, LabelDistribution: { 'Secret': 5, 'Public': 2 } },
        Items: [
          { FullPath: '\\\\s\\share\\doc.docx', FileName: 'doc.docx', Extension: '.docx', SizeKB: 42, LastModified: '2026-01-01', IsSupported: true, IsLabeled: true, LabelName: 'Secret', LabelId: 'id-1', SubLabelName: null, SubLabelId: null, Owner: null },
          { FullPath: '\\\\s\\share\\readme.txt', FileName: 'readme.txt', Extension: '.txt', SizeKB: 1, LastModified: '2026-01-01', IsSupported: true, IsLabeled: false, LabelName: null, LabelId: null, SubLabelName: null, SubLabelId: null, Owner: null },
        ],
        ExportPath: null,
      },
    });
    render(<FileShareInventory />);

    // First textbox is Directory Path
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Get Inventory' }));

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Total
    });
    expect(screen.getByText('7')).toBeInTheDocument(); // Labeled
    expect(screen.getByText('3')).toBeInTheDocument(); // Unlabeled
    expect(screen.getByText('doc.docx')).toBeInTheDocument();
  });

  it('shows error on failed inventory', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Share not accessible' });
    render(<FileShareInventory />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '\\\\server\\share');
    await user.click(screen.getByRole('button', { name: 'Get Inventory' }));

    await waitFor(() => {
      expect(screen.getByText('Share not accessible')).toBeInTheDocument();
    });
  });
});
