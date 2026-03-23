/**
 * E2E tests for the Documents page — all four document operations.
 *
 * Verifies: Look Up → Apply → Remove → Bulk Apply workflows including
 * validation, error handling, confirmation dialogs, and dry-run toggles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import DocumentsPage from '../../renderer/components/Documents/DocumentsPage';

describe('Document operations (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Left navigation', () => {
    it('renders all four sections and defaults to Look Up', () => {
      render(<DocumentsPage />);

      expect(screen.getByText('Look Up')).toBeInTheDocument();
      expect(screen.getByText('Apply')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
      expect(screen.getByText('Bulk Apply')).toBeInTheDocument();

      // Look Up section active by default
      expect(screen.getByText('Look Up Document Label')).toBeInTheDocument();
    });

    it('switches between sections', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);

      await user.click(screen.getByText('Apply'));
      expect(screen.getByText('Apply Label to Document')).toBeInTheDocument();

      await user.click(screen.getByText('Remove'));
      expect(screen.getByText('Remove Document Label')).toBeInTheDocument();

      await user.click(screen.getByText('Bulk Apply'));
      expect(screen.getByText('Bulk Apply Labels')).toBeInTheDocument();
    });
  });

  describe('Look Up', () => {
    it('validates required fields before calling invoke', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);

      await user.click(screen.getByText('Look Up Label'));

      expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalledWith('Get-SLDocumentLabel', expect.anything());
    });

    it('looks up a document label successfully', async () => {
      const user = userEvent.setup();
      const labelResult = {
        labels: [
          { sensitivityLabelId: 'l1', name: 'Confidential', description: 'Business data', color: '#FF0000', assignmentMethod: 'Standard' },
        ],
      };
      mockInvoke.mockResolvedValueOnce({ success: true, data: labelResult });

      render(<DocumentsPage />);

      const driveInput = screen.getByPlaceholderText('b!abc123...');
      const itemInput = screen.getByPlaceholderText('01ABC123DEF...');

      await user.type(driveInput, 'b!drive01');
      await user.type(itemInput, '01ITEM');
      await user.click(screen.getByText('Look Up Label'));

      expect(mockInvoke).toHaveBeenCalledWith('Get-SLDocumentLabel', { DriveId: 'b!drive01', ItemId: '01ITEM' });

      await waitFor(() => {
        expect(screen.getByText('Confidential')).toBeInTheDocument();
      });

      expect(screen.getByText('Business data')).toBeInTheDocument();
      expect(screen.getByText('Standard')).toBeInTheDocument();
    });

    it('shows "no label" message for unlabelled document', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: true, data: { labels: [] } });

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('No sensitivity label applied to this document.')).toBeInTheDocument();
      });
    });

    it('shows error on API failure', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Item not found' });

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'BADITEM');
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('Item not found')).toBeInTheDocument();
      });
    });
  });

  describe('Apply', () => {
    it('validates required fields', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Apply'));

      // Try with empty fields
      await user.click(screen.getByText('Apply Label'));

      expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
    });

    it('validates label requirement', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Apply'));

      // Fill drive and item but not label — only one set of these fields is rendered
      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');

      await user.click(screen.getByText('Apply Label'));

      expect(screen.getByText('Either Label Name or Label ID is required.')).toBeInTheDocument();
    });

    it('applies a label with correct parameters', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });

      render(<DocumentsPage />);
      await user.click(screen.getByText('Apply'));

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');
      await user.type(screen.getByPlaceholderText('Reason for applying this label...'), 'Business data');
      await user.click(screen.getByText('Apply Label'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({
          DriveId: 'b!drive01',
          ItemId: '01ITEM',
          LabelName: 'Confidential',
          Justification: 'Business data',
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Label applied successfully.')).toBeInTheDocument();
      });
    });

    it('dry run shows correct message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });

      render(<DocumentsPage />);
      await user.click(screen.getByText('Apply'));

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');

      // Toggle dry run on — click the switch element, not the label text
      await user.click(screen.getByRole('switch'));

      await user.click(screen.getByText('Dry Run — Apply Label'));

      await waitFor(() => {
        expect(screen.getByText('Dry run complete — no changes made.')).toBeInTheDocument();
      });

      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({
        DryRun: true,
      }));
    });
  });

  describe('Remove', () => {
    it('validates required fields', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Remove'));

      await user.click(screen.getByText('Remove Label'));

      expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
    });

    it('shows confirmation dialog for live removal (not dry run)', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Remove'));

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');

      // dryRun is false by default for Remove
      await user.click(screen.getByText('Remove Label'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/Remove the sensitivity label from item/)).toBeInTheDocument();
      });
    });

    it('skips confirmation dialog in dry-run mode', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });

      render(<DocumentsPage />);
      await user.click(screen.getByText('Remove'));

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');

      // Enable dry run — click the switch element, not the label text
      await user.click(screen.getByRole('switch'));

      await user.click(screen.getByText('Dry Run — Remove Label'));

      // Should invoke directly without confirm dialog
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabel', expect.objectContaining({
          DriveId: 'b!drive01',
          ItemId: '01ITEM',
          DryRun: true,
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Dry run complete — no changes made.')).toBeInTheDocument();
      });
    });

    it('executes removal after confirmation', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });

      render(<DocumentsPage />);
      await user.click(screen.getByText('Remove'));

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!drive01');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), '01ITEM');

      await user.click(screen.getByText('Remove Label'));

      // Confirm dialog appears
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/Remove the sensitivity label from item/)).toBeInTheDocument();
      });

      // Click the confirm button inside the dialog
      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: 'Remove Label' });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDocumentLabel', expect.objectContaining({
          DriveId: 'b!drive01',
          ItemId: '01ITEM',
        }));
      });
    });
  });

  describe('Bulk Apply', () => {
    const bulkItems = JSON.stringify([
      { DriveId: 'b!drive01', ItemId: '01A' },
      { DriveId: 'b!drive01', ItemId: '02B' },
    ]);

    it('validates label requirement', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Bulk Apply'));

      // Fill items using fireEvent.change to avoid userEvent interpreting { as special
      const itemsTextarea = screen.getByPlaceholderText(/DriveId/);
      fireEvent.change(itemsTextarea, { target: { value: bulkItems } });
      await user.click(screen.getByText('Dry Run — Bulk Apply'));

      await waitFor(() => {
        expect(screen.getByText('Either Label Name or Label ID is required.')).toBeInTheDocument();
      });
    });

    it('validates items JSON format', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Bulk Apply'));

      const itemsTextarea = screen.getByPlaceholderText(/DriveId/);
      fireEvent.change(itemsTextarea, { target: { value: 'not json' } });
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');
      await user.click(screen.getByText('Dry Run — Bulk Apply'));

      await waitFor(() => {
        expect(screen.getByText(/Items must be a JSON array/)).toBeInTheDocument();
      });
    });

    it('performs dry-run bulk apply', async () => {
      const user = userEvent.setup();
      const bulkResult = {
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
      mockInvoke.mockResolvedValue({ success: true, data: bulkResult });

      render(<DocumentsPage />);
      await user.click(screen.getByText('Bulk Apply'));

      const itemsTextarea = screen.getByPlaceholderText(/DriveId/);
      fireEvent.change(itemsTextarea, { target: { value: bulkItems } });
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');

      // dryRun is true by default
      await user.click(screen.getByText('Dry Run — Bulk Apply'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabelBulk', expect.objectContaining({
          LabelName: 'Confidential',
          DryRun: true,
        }));
      });
    });

    it('shows confirmation for live (non-dry-run) bulk apply', async () => {
      const user = userEvent.setup();
      render(<DocumentsPage />);
      await user.click(screen.getByText('Bulk Apply'));

      const itemsTextarea = screen.getByPlaceholderText(/DriveId/);
      fireEvent.change(itemsTextarea, { target: { value: bulkItems } });
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');

      // Disable dry run — click the switch element, not the label text
      await user.click(screen.getByRole('switch'));

      await user.click(screen.getByRole('button', { name: 'Bulk Apply Labels' }));

      await waitFor(() => {
        expect(screen.getByText(/This will apply label/)).toBeInTheDocument();
      });
    });
  });

  describe('Security', () => {
    it('all invoke calls use valid SL cmdlet names', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: { labels: [] } });

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!d');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'i1');
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(mockInvoke.mock.calls.length).toBeGreaterThan(0);
      });

      for (const call of mockInvoke.mock.calls) {
        const cmdlet = call[0] as string;
        expect(cmdlet).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
      }
    });
  });
});
