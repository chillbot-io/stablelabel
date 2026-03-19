import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentLabelBulk from '../../../renderer/components/Documents/DocumentLabelBulk';
import { mockInvoke } from '../../setup';

const validItemsJson = JSON.stringify([
  { DriveId: 'b!abc123', ItemId: '01ABC' },
  { DriveId: 'b!abc123', ItemId: '02DEF' },
]);

const bulkResultData = {
  Action: 'Apply',
  TotalItems: 2,
  SuccessCount: 1,
  FailedCount: 1,
  SensitivityLabelId: 'label-guid',
  DryRun: false,
  Results: [
    { DriveId: 'b!abc123', ItemId: '01ABC', Status: 'Succeeded', Error: null },
    { DriveId: 'b!abc123', ItemId: '02DEF', Status: 'Failed', Error: 'Not found' },
  ],
};

const dryRunResultData = {
  Action: 'Apply',
  TotalItems: 2,
  SuccessCount: 2,
  FailedCount: 0,
  SensitivityLabelId: 'label-guid',
  DryRun: true,
  Results: [
    { DriveId: 'b!abc123', ItemId: '01ABC', Status: 'DryRun', Error: null },
    { DriveId: 'b!abc123', ItemId: '02DEF', Status: 'DryRun', Error: null },
  ],
};

/** Helper to set textarea value (userEvent.type can't handle JSON special chars like { [ ) */
function setTextareaValue(textarea: HTMLElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
}

describe('DocumentLabelBulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and all form fields', () => {
    render(<DocumentLabelBulk />);
    expect(screen.getByText('Bulk Apply Labels')).toBeInTheDocument();
    expect(screen.getByText(/Assign a sensitivity label to multiple documents/)).toBeInTheDocument();
    expect(screen.getByText('Items (JSON Array)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Confidential')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('00000000-0000-...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reason for bulk label assignment...')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    // Dry run is on by default, so button shows dry run text
    expect(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' })).toBeInTheDocument();
  });

  it('dry run is enabled by default', () => {
    render(<DocumentLabelBulk />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('shows error when label name and label ID are both empty', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByText('Either Label Name or Label ID is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when items JSON is invalid', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    await user.type(textarea, 'not valid json');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByText('Items must be a JSON array of objects with DriveId and ItemId.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when items JSON is not an array', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, '{"DriveId":"a","ItemId":"b"}');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByText('Items must be a JSON array of objects with DriveId and ItemId.')).toBeInTheDocument();
  });

  it('shows error when items JSON array has objects missing DriveId', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, '[{"ItemId":"b"}]');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByText('Items must be a JSON array of objects with DriveId and ItemId.')).toBeInTheDocument();
  });

  it('shows error when items JSON array has objects missing ItemId', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, '[{"DriveId":"a"}]');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByText('Items must be a JSON array of objects with DriveId and ItemId.')).toBeInTheDocument();
  });

  it('shows error when items JSON is an empty array', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, '[]');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByText('Items must be a JSON array of objects with DriveId and ItemId.')).toBeInTheDocument();
  });

  it('calls invoke with LabelName and DryRun when valid', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLDocumentLabelBulk', expect.objectContaining({
          Items: [{ DriveId: 'b!abc123', ItemId: '01ABC' }, { DriveId: 'b!abc123', ItemId: '02DEF' }],
          LabelName: 'Secret',
          DryRun: true,
        })
      );
    });
  });

  it('calls invoke with LabelId instead of LabelName when LabelId is provided', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('00000000-0000-...'), 'guid-1234');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLDocumentLabelBulk', expect.objectContaining({
          Items: [{ DriveId: 'b!abc123', ItemId: '01ABC' }, { DriveId: 'b!abc123', ItemId: '02DEF' }],
          LabelId: 'guid-1234',
          DryRun: true,
        })
      );
    });
  });

  it('includes justification in command when provided', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.type(screen.getByPlaceholderText('Reason for bulk label assignment...'), 'Audit compliance');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLDocumentLabelBulk', expect.objectContaining({
          Justification: 'Audit compliance',
        })
      );
    });
  });

  it('omits -DryRun when dry run is toggled off', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: bulkResultData });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');

    // Toggle dry run off
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Bulk Apply Labels' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLDocumentLabelBulk', expect.objectContaining({
          LabelName: 'Secret',
        })
      );
      const params = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
      expect(params.DryRun).toBeUndefined();
    });
  });

  it('shows loading state during execution', async () => {
    const user = userEvent.setup();
    let resolveInvoke: (value: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      })
    );
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();

    resolveInvoke!({ success: true, data: dryRunResultData });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' })).toBeEnabled();
    });
  });

  it('shows error when invoke returns success:false with error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Service unavailable' });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns success:false without error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.getByText('Bulk operation failed')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns success:true but no data', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.getByText('Bulk operation failed')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce('something weird');
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('passes raw values without escaping single quotes', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
    render(<DocumentLabelBulk />);

    const itemsWithQuotes = JSON.stringify([{ DriveId: "b!'123", ItemId: "01'ABC" }]);
    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, itemsWithQuotes);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), "Se''cret");
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Set-SLDocumentLabelBulk', expect.objectContaining({
          Items: [{ DriveId: "b!'123", ItemId: "01'ABC" }],
          LabelName: "Se''cret",
          DryRun: true,
        })
      );
    });
  });

  describe('BulkResult display', () => {
    it('displays result summary counts', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: true, data: bulkResultData });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      // Toggle dry run off
      await user.click(screen.getByRole('switch'));
      await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

      await waitFor(() => {
        expect(screen.getByText('Results')).toBeInTheDocument();
      });

      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Succeeded')).toBeInTheDocument();
      expect(screen.getByText('Failed', { selector: 'dt' })).toBeInTheDocument();
      // TotalItems=2, SuccessCount=1, FailedCount=1
      const totalDd = screen.getByText('Total').closest('div')!.querySelector('dd')!;
      expect(totalDd.textContent).toBe('2');
      const succeededDd = screen.getByText('Succeeded').closest('div')!.querySelector('dd')!;
      expect(succeededDd.textContent).toBe('1');
    });

    it('displays "Dry Run Results" heading when DryRun is true', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

      await waitFor(() => {
        expect(screen.getByText('Dry Run Results')).toBeInTheDocument();
      });
    });

    it('toggles item details display', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: true, data: bulkResultData });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      await user.click(screen.getByRole('switch'));
      await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

      await waitFor(() => {
        expect(screen.getByText(/Show item details/)).toBeInTheDocument();
      });

      // Details not shown initially
      expect(screen.queryByText('b!abc123/01ABC')).not.toBeInTheDocument();

      // Show details
      await user.click(screen.getByText(/Show item details/));
      expect(screen.getByText(/Hide item details/)).toBeInTheDocument();
      expect(screen.getByText('b!abc123/01ABC')).toBeInTheDocument();
      expect(screen.getByText('b!abc123/02DEF')).toBeInTheDocument();
      // "Succeeded" appears as both a stat label (dt) and item badge (span)
      expect(screen.getAllByText('Succeeded').length).toBeGreaterThanOrEqual(2);
      // "Failed" appears as both a stat label (dt) and item badge (span)
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2);

      // Hide details
      await user.click(screen.getByText(/Hide item details/));
      expect(screen.getByText(/Show item details/)).toBeInTheDocument();
      expect(screen.queryByText('b!abc123/01ABC')).not.toBeInTheDocument();
    });

    it('shows DryRun status styling for dry run items', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

      await waitFor(() => {
        expect(screen.getByText(/Show item details/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Show item details/));

      const dryRunBadges = screen.getAllByText('DryRun');
      expect(dryRunBadges.length).toBe(2);
    });

    it('does not show details toggle when Results array is empty', async () => {
      const user = userEvent.setup();
      const emptyResults = {
        ...bulkResultData,
        Results: [],
      };
      mockInvoke.mockResolvedValueOnce({ success: true, data: emptyResults });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      await user.click(screen.getByRole('switch'));
      await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Show item details/)).not.toBeInTheDocument();
    });

    it('displays FailedCount in red when > 0', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: true, data: bulkResultData });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      await user.click(screen.getByRole('switch'));
      await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

      await waitFor(() => {
        const failedDt = screen.getByText('Failed', { selector: 'dt' });
        const failedDd = failedDt.closest('div')!.querySelector('dd')!;
        expect(failedDd).toHaveClass('text-red-400');
      });
    });

    it('displays FailedCount in gray when 0', async () => {
      const user = userEvent.setup();
      const noFailures = { ...bulkResultData, FailedCount: 0 };
      mockInvoke.mockResolvedValueOnce({ success: true, data: noFailures });
      render(<DocumentLabelBulk />);

      const textarea = screen.getByPlaceholderText(/DriveId/);
      setTextareaValue(textarea, validItemsJson);
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      await user.click(screen.getByRole('switch'));
      await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

      await waitFor(() => {
        const failedDt = screen.getByText('Failed', { selector: 'dt' });
        const failedDd = failedDt.closest('div')!.querySelector('dd')!;
        expect(failedDd).toHaveClass('text-zinc-400');
      });
    });
  });

  describe('mutual exclusion of LabelName and LabelId', () => {
    it('disables LabelId when LabelName has text', async () => {
      const user = userEvent.setup();
      render(<DocumentLabelBulk />);

      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
      expect(screen.getByPlaceholderText('00000000-0000-...')).toBeDisabled();
    });

    it('disables LabelName when LabelId has text', async () => {
      const user = userEvent.setup();
      render(<DocumentLabelBulk />);

      await user.type(screen.getByPlaceholderText('00000000-0000-...'), 'guid-1234');
      expect(screen.getByPlaceholderText('e.g., Confidential')).toBeDisabled();
    });
  });

  it('clears previous error and result on new submission', async () => {
    const user = userEvent.setup();
    // First call fails
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'First error' });
    render(<DocumentLabelBulk />);

    const textarea = screen.getByPlaceholderText(/DriveId/);
    setTextareaValue(textarea, validItemsJson);
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    // Second call succeeds
    mockInvoke.mockResolvedValueOnce({ success: true, data: dryRunResultData });
    await user.click(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' }));

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument();
      expect(screen.getByText('Dry Run Results')).toBeInTheDocument();
    });
  });

  it('button text changes based on dry run state', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelBulk />);

    // Dry run is on by default
    expect(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Bulk Apply Labels' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Dry Run — Bulk Apply' })).toBeInTheDocument();
  });
});
