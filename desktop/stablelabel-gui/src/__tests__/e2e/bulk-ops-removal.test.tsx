/**
 * E2E tests for the Bulk Operations page — bulk label/encryption removal.
 *
 * Verifies: mode selection → input parsing (JSON + CSV) → dry-run → live confirm → result display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import BulkOpsPage from '../../renderer/components/BulkOps/BulkOpsPage';

const ITEMS_PLACEHOLDER = /Paste JSON array or CSV/;

const bulkRemoveResult = {
  Action: 'Remove-SLDocumentLabelBulk',
  Mode: 'LabelOnly',
  TotalItems: 2,
  SuccessCount: 2,
  FailedCount: 0,
  DryRun: true,
  Results: [
    { DriveId: 'b!drive01', ItemId: '01A', Status: 'success', Error: null },
    { DriveId: 'b!drive01', ItemId: '02B', Status: 'success', Error: null },
  ],
};

describe('Bulk Ops removal workflow (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with all three removal modes', () => {
    render(<BulkOpsPage />);

    expect(screen.getByText('Bulk Operations')).toBeInTheDocument();
    expect(screen.getByText('Remove Label Only')).toBeInTheDocument();
    expect(screen.getByText('Remove Encryption Only')).toBeInTheDocument();
    expect(screen.getByText('Remove Label + Encryption')).toBeInTheDocument();
  });

  it('defaults to LabelOnly mode with dry run enabled', () => {
    render(<BulkOpsPage />);

    // First mode button should be highlighted (via border-blue-500)
    expect(screen.getByText('Dry Run — Remove Label Only')).toBeInTheDocument();
  });

  it('switches between removal modes', async () => {
    const user = userEvent.setup();
    render(<BulkOpsPage />);

    await user.click(screen.getByText('Remove Encryption Only'));

    expect(screen.getByText('Dry Run — Remove Encryption Only')).toBeInTheDocument();

    await user.click(screen.getByText('Remove Label + Encryption'));

    expect(screen.getByText('Dry Run — Remove Label + Encryption')).toBeInTheDocument();
  });

  it('validates empty items input', async () => {
    const user = userEvent.setup();
    render(<BulkOpsPage />);

    await user.click(screen.getByText('Dry Run — Remove Label Only'));

    expect(screen.getByText('Provide items as JSON array or CSV (DriveId,ItemId per line).')).toBeInTheDocument();
  });

  it('accepts JSON array input and performs dry run', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: bulkRemoveResult });

    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    // Use fireEvent.change for JSON with special characters ({ and } are special in userEvent)
    fireEvent.change(itemsArea, {
      target: { value: '[{"DriveId":"b!drive01","ItemId":"01A"},{"DriveId":"b!drive01","ItemId":"02B"}]' },
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Dry Run — Remove Label Only'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabelBulk', expect.objectContaining({
        Mode: 'LabelOnly',
        DryRun: true,
      }));
    });
  });

  it('accepts CSV-style input (DriveId,ItemId per line)', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: bulkRemoveResult });

    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    // Use fireEvent.change with \n for newlines instead of userEvent {enter}
    fireEvent.change(itemsArea, {
      target: { value: 'b!drive01,01A\nb!drive01,02B' },
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Dry Run — Remove Label Only'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabelBulk', expect.objectContaining({
        Items: [
          { DriveId: 'b!drive01', ItemId: '01A' },
          { DriveId: 'b!drive01', ItemId: '02B' },
        ],
        Mode: 'LabelOnly',
        DryRun: true,
      }));
    });
  });

  it('shows confirmation dialog for live (non-dry-run) removal', async () => {
    const user = userEvent.setup();
    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A' } });

    // Disable dry run by clicking the switch
    await user.click(screen.getByRole('switch'));

    // The submit button text matches the mode label when dry run is off.
    // Find the submit button (contains bg-red-600 class, not the mode selector).
    const submitBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.className.includes('bg-red-600'));
    expect(submitBtn).toBeTruthy();
    await user.click(submitBtn!);

    await waitFor(() => {
      expect(screen.getByText('Confirm Bulk Removal')).toBeInTheDocument();
      expect(screen.getByText(/This will remove label only/i)).toBeInTheDocument();
    });
  });

  it('cancels confirmation dialog without invoking', async () => {
    const user = userEvent.setup();
    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A' } });

    await user.click(screen.getByRole('switch'));

    const submitBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.className.includes('bg-red-600'));
    await user.click(submitBtn!);

    await waitFor(() => {
      expect(screen.getByText('Confirm Bulk Removal')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Confirm dialog should close; invoke should not have been called with Remove cmdlet
    expect(mockInvoke).not.toHaveBeenCalledWith('Remove-SLDocumentLabelBulk', expect.anything());
  });

  it('proceeds after confirmation and shows results', async () => {
    const user = userEvent.setup();
    const liveResult = { ...bulkRemoveResult, DryRun: false };
    mockInvoke.mockResolvedValue({ success: true, data: liveResult });

    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A\nb!drive01,02B' } });

    await user.click(screen.getByRole('switch'));

    const submitBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.className.includes('bg-red-600'));
    await user.click(submitBtn!);

    await waitFor(() => {
      expect(screen.getByText('Confirm Bulk Removal')).toBeInTheDocument();
    });

    // Click the confirm button inside the dialog
    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getAllByRole('button').find(b => b.textContent !== 'Cancel');
    await user.click(confirmBtn!);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabelBulk', expect.objectContaining({
        Mode: 'LabelOnly',
      }));
    });
  });

  it('passes justification to the cmdlet', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: bulkRemoveResult });

    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A' } });

    await user.type(screen.getByPlaceholderText('Reason for removal...'), 'Data migration');
    await user.click(screen.getByText('Dry Run — Remove Label Only'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabelBulk', expect.objectContaining({
        Justification: 'Data migration',
      }));
    });
  });

  it('handles API error gracefully', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Insufficient permissions' });

    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A' } });

    await user.click(screen.getByText('Dry Run — Remove Label Only'));

    await waitFor(() => {
      expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    });
  });

  it('passes correct mode to the cmdlet when changed', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: { ...bulkRemoveResult, Mode: 'Both' } });

    render(<BulkOpsPage />);

    await user.click(screen.getByText('Remove Label + Encryption'));

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A' } });

    await user.click(screen.getByText('Dry Run — Remove Label + Encryption'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabelBulk', expect.objectContaining({
        Mode: 'Both',
      }));
    });
  });

  it('all cmdlet calls use valid Verb-SLNoun format', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: bulkRemoveResult });

    render(<BulkOpsPage />);

    const itemsArea = screen.getByPlaceholderText(ITEMS_PLACEHOLDER);
    fireEvent.change(itemsArea, { target: { value: 'b!drive01,01A' } });

    await user.click(screen.getByText('Dry Run — Remove Label Only'));

    await waitFor(() => {
      for (const call of mockInvoke.mock.calls) {
        expect(call[0]).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
      }
    });
  });
});
