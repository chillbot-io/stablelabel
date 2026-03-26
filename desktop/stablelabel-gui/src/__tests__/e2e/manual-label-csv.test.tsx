/**
 * E2E tests for the Manual Label (CSV Upload) workflow.
 *
 * Verifies the full lifecycle: upload CSV → validate → preview → apply (dry run / live) → done → reset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import ManualLabelPage from '../../renderer/components/ManualLabel/ManualLabelPage';

const validCsvPreview = {
  Action: 'Import-SLLabelCsv',
  TotalRows: 3,
  ValidCount: 2,
  InvalidCount: 1,
  ValidRows: [
    { Row: 1, DriveId: 'b!drive01', ItemId: '01A', LabelName: 'Confidential', LabelId: null, Valid: true, Errors: null },
    { Row: 2, DriveId: 'b!drive01', ItemId: '02B', LabelName: 'Confidential', LabelId: null, Valid: true, Errors: null },
  ],
  InvalidRows: [
    { Row: 3, DriveId: '', ItemId: '03C', LabelName: 'Confidential', LabelId: null, Valid: false, Errors: 'Missing DriveId' },
  ],
};

const bulkApplyResult = {
  Action: 'Set-SLDocumentLabelBulk',
  TotalItems: 2,
  SuccessCount: 2,
  FailedCount: 0,
  SensitivityLabelId: 'l1',
  DryRun: true,
  Results: [
    { DriveId: 'b!drive01', ItemId: '01A', Status: 'success', Error: null },
    { DriveId: 'b!drive01', ItemId: '02B', Status: 'success', Error: null },
  ],
};

describe('Manual Label CSV workflow (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in upload phase with template visible', () => {
    render(<ManualLabelPage />);

    expect(screen.getByText('Manual Label — CSV Upload')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getByText('Validate CSV')).toBeInTheDocument();
  });

  it('validates empty CSV content', async () => {
    const user = userEvent.setup();
    render(<ManualLabelPage />);

    await user.click(screen.getByText('Validate CSV'));

    expect(screen.getByText('Paste CSV content or use the template.')).toBeInTheDocument();
  });

  it('parses CSV and shows preview with valid/invalid counts', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: validCsvPreview });

    render(<ManualLabelPage />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'DriveId,ItemId,LabelName\nb!drive01,01A,Confidential\nb!drive01,02B,Confidential\n,03C,Confidential');
    await user.click(screen.getByText('Validate CSV'));

    expect(mockInvoke).toHaveBeenCalledWith('Import-SLLabelCsv', expect.objectContaining({
      CsvText: expect.any(String),
    }));

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();   // Total Rows
      expect(screen.getByText('2')).toBeInTheDocument();   // Valid
      expect(screen.getByText('1')).toBeInTheDocument();   // Invalid
    });
  });

  it('shows invalid row details in preview', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: validCsvPreview });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText(/Invalid rows/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Row 3: Missing DriveId/)).toBeInTheDocument();
  });

  it('shows preview items with drive/item paths', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: validCsvPreview });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('b!drive01/01A')).toBeInTheDocument();
    });

    expect(screen.getByText('b!drive01/02B')).toBeInTheDocument();
  });

  it('executes dry-run apply with correct parameters', async () => {
    const user = userEvent.setup();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: validCsvPreview })   // Import-SLLabelCsv
      .mockResolvedValueOnce({ success: true, data: bulkApplyResult });  // Set-SLDocumentLabelBulk

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run — Apply to 2 files')).toBeInTheDocument();
    });

    // Dry run is on by default
    await user.click(screen.getByText('Dry Run — Apply to 2 files'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabelBulk', expect.objectContaining({
        Items: [
          { DriveId: 'b!drive01', ItemId: '01A' },
          { DriveId: 'b!drive01', ItemId: '02B' },
        ],
        LabelName: 'Confidential',
        DryRun: true,
      }));
    });
  });

  it('shows done phase with result summary after apply', async () => {
    const user = userEvent.setup();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: validCsvPreview })
      .mockResolvedValueOnce({ success: true, data: bulkApplyResult });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run — Apply to 2 files')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Dry Run — Apply to 2 files'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run Complete')).toBeInTheDocument();
    });

    expect(screen.getByText('Upload Another CSV')).toBeInTheDocument();
  });

  it('label override takes precedence over CSV LabelName', async () => {
    const user = userEvent.setup();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: validCsvPreview })
      .mockResolvedValueOnce({ success: true, data: { ...bulkApplyResult, DryRun: true } });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Override the label for all rows...')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Override the label for all rows...'), 'Internal');
    await user.click(screen.getByText('Dry Run — Apply to 2 files'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabelBulk', expect.objectContaining({
        LabelName: 'Internal',
      }));
    });
  });

  it('Start Over button resets to upload phase', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: validCsvPreview });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Start Over')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Start Over'));

    expect(screen.getByText('Validate CSV')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
  });

  it('Upload Another CSV resets from done phase', async () => {
    const user = userEvent.setup();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: validCsvPreview })
      .mockResolvedValueOnce({ success: true, data: bulkApplyResult });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run — Apply to 2 files')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Dry Run — Apply to 2 files'));

    await waitFor(() => {
      expect(screen.getByText('Upload Another CSV')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Upload Another CSV'));

    expect(screen.getByText('Validate CSV')).toBeInTheDocument();
  });

  it('handles CSV parse error from backend', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Missing header row' });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'bad data');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Missing header row')).toBeInTheDocument();
    });
  });

  it('handles bulk apply error gracefully', async () => {
    const user = userEvent.setup();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: validCsvPreview })
      .mockResolvedValueOnce({ success: false, data: null, error: 'Graph API rate limited' });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run — Apply to 2 files')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Dry Run — Apply to 2 files'));

    await waitFor(() => {
      expect(screen.getByText('Graph API rate limited')).toBeInTheDocument();
    });
  });

  it('prevents apply when no valid rows', async () => {
    const user = userEvent.setup();
    const allInvalidPreview = {
      ...validCsvPreview,
      ValidCount: 0,
      ValidRows: [],
      InvalidCount: 3,
    };
    mockInvoke.mockResolvedValueOnce({ success: true, data: allInvalidPreview });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv content');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      // Apply button should be disabled
      const applyBtn = screen.getByRole('button', { name: /Apply to 0 files/i });
      expect(applyBtn).toBeDisabled();
    });
  });

  it('all cmdlet calls use valid Verb-SLNoun format', async () => {
    const user = userEvent.setup();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: validCsvPreview })
      .mockResolvedValueOnce({ success: true, data: bulkApplyResult });

    render(<ManualLabelPage />);

    await user.type(screen.getByRole('textbox'), 'csv');
    await user.click(screen.getByText('Validate CSV'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run — Apply to 2 files')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Dry Run — Apply to 2 files'));

    await waitFor(() => {
      for (const call of mockInvoke.mock.calls) {
        const cmdlet = call[0] as string;
        expect(cmdlet).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
      }
    });
  });
});
