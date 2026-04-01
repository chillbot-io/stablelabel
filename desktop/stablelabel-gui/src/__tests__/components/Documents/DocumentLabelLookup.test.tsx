import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentLabelLookup from '../../../renderer/components/Documents/DocumentLabelLookup';
import { mockInvoke } from '../../setup';

describe('DocumentLabelLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and form fields', () => {
    render(<DocumentLabelLookup />);
    expect(screen.getByText('Look Up Document Label')).toBeInTheDocument();
    expect(screen.getByText('Extract the current sensitivity label from a document via Graph API.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('b!abc123...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('01ABC123DEF...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look Up Label' })).toBeInTheDocument();
  });

  it('shows error when Drive ID is empty', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelLookup />);

    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when Item ID is empty but Drive ID is filled', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('shows error when Drive ID is whitespace only', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), '   ');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    expect(screen.getByText('Drive ID and Item ID are required.')).toBeInTheDocument();
  });

  it('calls invoke with correct PS command on valid submission', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { labels: [] },
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Get-SLDocumentLabel', { DriveId: 'drive-123', ItemId: 'item-456' }
      );
    });
  });

  it('escapes single quotes in input', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { labels: [] },
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), "drive'id");
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), "item'id");
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'Get-SLDocumentLabel', { DriveId: "drive'id", ItemId: "item'id" }
      );
    });
  });

  it('shows loading state while executing', async () => {
    const user = userEvent.setup();
    let resolveInvoke: (value: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      })
    );
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    expect(screen.getByRole('button', { name: 'Looking up...' })).toBeDisabled();

    resolveInvoke!({ success: true, data: { labels: [] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Look Up Label' })).toBeEnabled();
    });
  });

  it('displays labels when result has labels', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        labels: [
          {
            sensitivityLabelId: 'label-1',
            name: 'Confidential',
            description: 'Company confidential data',
            color: '#ff0000',
            assignmentMethod: 'Standard',
          },
          {
            sensitivityLabelId: 'label-2',
            name: null,
            description: null,
            color: null,
            assignmentMethod: null,
          },
        ],
      },
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    expect(screen.getByText('Company confidential data')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    // label.name is null so "Unnamed" is shown
    expect(screen.getByText('Unnamed')).toBeInTheDocument();
    expect(screen.getByText('Current Labels')).toBeInTheDocument();
  });

  it('displays "No sensitivity label" when labels array is empty', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { labels: [] },
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('No sensitivity label applied to this document.')).toBeInTheDocument();
    });
  });

  it('shows error when invoke returns success:false', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: false,
      data: null,
      error: 'Access denied',
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns success:false without error message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: false,
      data: null,
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('No label data returned')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke returns success:true but no data', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: null,
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('No label data returned')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error('Network failure'));
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce('string error');
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('clears previous error and result on new submission', async () => {
    const user = userEvent.setup();
    // First call fails
    mockInvoke.mockResolvedValueOnce({
      success: false,
      data: null,
      error: 'First error',
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    // Second call succeeds
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { labels: [] },
    });
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument();
    });
  });

  describe('RawJson toggle', () => {
    it('toggles raw JSON display', async () => {
      const user = userEvent.setup();
      const resultData = { labels: [{ sensitivityLabelId: 'lbl-1', name: 'Test', description: null, color: null, assignmentMethod: null }] };
      mockInvoke.mockResolvedValueOnce({
        success: true,
        data: resultData,
      });
      render(<DocumentLabelLookup />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
      await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

      await waitFor(() => {
        expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
      });

      // Initially hidden
      expect(screen.queryByText(/"sensitivityLabelId"/)).not.toBeInTheDocument();

      // Show raw JSON
      await user.click(screen.getByText(/Show raw JSON/));
      expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
      expect(screen.getByText(/"sensitivityLabelId"/)).toBeInTheDocument();

      // Hide raw JSON
      await user.click(screen.getByText(/Hide raw JSON/));
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
      expect(screen.queryByText(/"sensitivityLabelId"/)).not.toBeInTheDocument();
    });
  });

  it('renders label with color swatch', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        labels: [
          {
            sensitivityLabelId: 'label-1',
            name: 'Secret',
            description: null,
            color: '#00ff00',
            assignmentMethod: null,
          },
        ],
      },
    });
    render(<DocumentLabelLookup />);

    await user.type(screen.getByPlaceholderText('b!abc123...'), 'drive-123');
    await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'item-456');
    await user.click(screen.getByRole('button', { name: 'Look Up Label' }));

    await waitFor(() => {
      expect(screen.getByText('Secret')).toBeInTheDocument();
    });
  });

  it('allows user to type into fields', async () => {
    const user = userEvent.setup();
    render(<DocumentLabelLookup />);

    const driveInput = screen.getByPlaceholderText('b!abc123...') as HTMLInputElement;
    const itemInput = screen.getByPlaceholderText('01ABC123DEF...') as HTMLInputElement;

    await user.type(driveInput, 'my-drive');
    await user.type(itemInput, 'my-item');

    expect(driveInput.value).toBe('my-drive');
    expect(itemInput.value).toBe('my-item');
  });
});
