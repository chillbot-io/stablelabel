import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentLabelRemove from '../../../renderer/components/Documents/DocumentLabelRemove';
import { mockInvoke } from '../../setup';

describe('DocumentLabelRemove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and all form fields', () => {
    render(<DocumentLabelRemove />);
    expect(screen.getByText('Remove Document Label')).toBeInTheDocument();
    expect(screen.getByText('Remove the sensitivity label from a specific document via Graph API.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('b!abc123...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('01ABC123DEF...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reason for removing the label...')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Label' })).toBeInTheDocument();
  });

  it('shows error when Drive ID and Item ID are empty', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelRemove />);

    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when Drive ID is empty but Item ID is filled', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
  });

  it('shows confirmation dialog when dry run is off', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    // Confirmation dialog appears - check for dialog-specific content
    expect(screen.getByText(/Remove the sensitivity label from item "item-456" in drive "drive-123"/)).toBeInTheDocument();
    expect(screen.getByText(/This action may affect data protection/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // invoke not called yet
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('executes remove when confirm dialog is confirmed', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    // Click confirm in dialog - the confirmLabel is "Remove Label"
    const confirmButtons = screen.getAllByRole('button', { name: 'Remove Label' });
    // The dialog confirm button is the second one (or last)
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "Remove-SLDocumentLabel -DriveId 'drive-123' -ItemId 'item-456' -Confirm:$false"
      );
    });
  });

  it('dismisses confirm dialog when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    // Cancel dialog
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Dialog should be gone, no invoke called
    expect(mockInvoke).not.toHaveBeenCalled();
    // The confirmation message should no longer be visible
    expect(screen.queryByText(/This action may affect data protection/)).not.toBeInTheDocument();
  });

  it('skips confirmation dialog when dry run is on', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');

    // Toggle dry run on
    await user.click(screen.getByRole('switch'));

    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    // No confirmation dialog, invoke called directly
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "Remove-SLDocumentLabel -DriveId 'drive-123' -ItemId 'item-456' -DryRun -Confirm:$false"
      );
    });
  });

  it('includes justification in command when provided', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('Reason for removing the label...'), 'No longer needed');

    // Toggle dry run on to skip confirmation
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "Remove-SLDocumentLabel -DriveId 'drive-123' -ItemId 'item-456' -Justification 'No longer needed' -DryRun -Confirm:$false"
      );
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
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');

    // Use dry run to skip confirmation
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    expect(screen.getByRole('button', { name: 'Removing...' })).toBeDisabled();

    resolveInvoke!({ success: true, data: null });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dry Run — Remove Label' })).toBeEnabled();
    });
  });

  it('shows success message on successful removal', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    // Confirm
    const confirmButtons = screen.getAllByRole('button', { name: 'Remove Label' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Label removed successfully.')).toBeInTheDocument();
    });
  });

  it('shows dry run success message when dry run is on', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText(/Dry run complete/)).toBeInTheDocument();
    });
  });

  it('shows error when invoke returns success:false with error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Permission denied' });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns success:false without error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to remove label')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error('Timeout'));
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(42);
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('escapes single quotes in all fields', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), "d'rive");
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), "i'tem");
    await user.type(screen.getByPlaceholderText('Reason for removing the label...'), "just'ify");
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "Remove-SLDocumentLabel -DriveId 'd''rive' -ItemId 'i''tem' -Justification 'just''ify' -DryRun -Confirm:$false"
      );
    });
  });

  it('clears previous error and success on new submission', async () => {
    const user = userEvent.setup();
    // First call fails
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'First error' });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    // Second call succeeds
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    await user.click(screen.getByRole('button', { name: 'Dry Run — Remove Label' }));

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument();
      expect(screen.getByText(/Dry run complete/)).toBeInTheDocument();
    });
  });

  it('button text changes based on dry run state', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelRemove />);

    expect(screen.getByRole('button', { name: 'Remove Label' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Dry Run — Remove Label' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Remove Label' })).toBeInTheDocument();
  });

  it('includes justification but no dry run when going through confirm', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelRemove />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('Reason for removing the label...'), 'Reclassification');
    await user.click(screen.getByRole('button', { name: 'Remove Label' }));

    // Confirm dialog appears
    const confirmButtons = screen.getAllByRole('button', { name: 'Remove Label' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "Remove-SLDocumentLabel -DriveId 'drive-123' -ItemId 'item-456' -Justification 'Reclassification' -Confirm:$false"
      );
    });
  });
});
