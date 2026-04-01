import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentLabelApply from '../../../renderer/components/Documents/DocumentLabelApply';
import { mockInvoke } from '../../setup';

describe('DocumentLabelApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and all form fields', () => {
    render(<DocumentLabelApply />);
    expect(screen.getByText('Apply Label to Document')).toBeInTheDocument();
    expect(screen.getByText('Assign a sensitivity label to a specific document via Graph API.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('b!abc123...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('01ABC123DEF...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Confidential')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('00000000-0000-...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reason for applying this label...')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply Label' })).toBeInTheDocument();
  });

  it('shows error when Drive ID and Item ID are empty', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelApply />);

    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when label name and label ID are both empty', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    expect(screen.getByText('Either Label Name or Label ID is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calls invoke with LabelName when labelName is provided', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({ DriveId: 'drive-123', ItemId: 'item-456', LabelName: 'Secret' }));
    });
  });

  it('calls invoke with LabelId when labelId is provided (takes priority over labelName)', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('00000000-0000-...'), 'guid-1234');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({ DriveId: 'drive-123', ItemId: 'item-456', LabelId: 'guid-1234' }));
    });
  });

  it('includes justification in command when provided', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.type(screen.getByPlaceholderText('Reason for applying this label...'), 'Compliance requirement');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({ DriveId: 'drive-123', ItemId: 'item-456', LabelName: 'Secret', Justification: 'Compliance requirement' }));
    });
  });

  it('includes -DryRun flag when dry run is toggled on', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');

    // Toggle dry run on
    await user.click(screen.getByRole('switch'));
    // Button text should change
    expect(screen.getByRole('button', { name: 'Dry Run — Apply Label' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dry Run — Apply Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({ DriveId: 'drive-123', ItemId: 'item-456', LabelName: 'Secret', DryRun: true }));
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
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled();

    resolveInvoke!({ success: true, data: null });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply Label' })).toBeEnabled();
    });
  });

  it('shows success message on successful apply', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText('Label applied successfully.')).toBeInTheDocument();
    });
  });

  it('shows dry run success message when dry run is enabled', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Dry Run — Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText(/Dry run complete/)).toBeInTheDocument();
    });
  });

  it('shows error when invoke returns success:false with error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Forbidden' });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns success:false without error message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to apply label')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error('Connection lost'));
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce('random string');
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('passes special characters as raw values', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), "d'rive");
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), "i'tem");
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), "lab'el");
    await user.type(screen.getByPlaceholderText('Reason for applying this label...'), "just'ify");
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLDocumentLabel', expect.objectContaining({ DriveId: "d'rive", ItemId: "i'tem", LabelName: "lab'el", Justification: "just'ify" }));
    });
  });

  it('clears previous error and success on new submission', async () => {
    const user = userEvent.setup();
    // First call fails
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Error one' });
    render(<DocumentLabelApply />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Secret');
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.getByText('Error one')).toBeInTheDocument();
    });

    // Second call succeeds
    mockInvoke.mockResolvedValueOnce({ success: true, data: null });
    await user.click(screen.getByRole('button', { name: 'Apply Label' }));

    await waitFor(() => {
      expect(screen.queryByText('Error one')).not.toBeInTheDocument();
      expect(screen.getByText('Label applied successfully.')).toBeInTheDocument();
    });
  });

  describe('mutual exclusion of LabelName and LabelId', () => {
    it('disables LabelId when LabelName has text', async () => {
      const user = userEvent.setup();
      render(<DocumentLabelApply />);

      const labelNameInput = screen.getByPlaceholderText('e.g., Confidential');
      const labelIdInput = screen.getByPlaceholderText('00000000-0000-...');

      await user.type(labelNameInput, 'Secret');

      expect(labelIdInput).toBeDisabled();
    });

    it('disables LabelName when LabelId has text', async () => {
      const user = userEvent.setup();
      render(<DocumentLabelApply />);

      const labelNameInput = screen.getByPlaceholderText('e.g., Confidential');
      const labelIdInput = screen.getByPlaceholderText('00000000-0000-...');

      await user.type(labelIdInput, 'guid-1234');

      expect(labelNameInput).toBeDisabled();
    });
  });

  it('button text shows "Dry Run — Apply Label" when dry run is on', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelApply />);

    expect(screen.getByRole('button', { name: 'Apply Label' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));

    expect(screen.getByRole('button', { name: 'Dry Run — Apply Label' })).toBeInTheDocument();

    // Toggle off
    await user.click(screen.getByRole('switch'));

    expect(screen.getByRole('button', { name: 'Apply Label' })).toBeInTheDocument();
  });
});
