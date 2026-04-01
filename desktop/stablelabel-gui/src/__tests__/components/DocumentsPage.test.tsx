import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentsPage from '../../renderer/components/Documents/DocumentsPage';
import { mockInvoke } from '../setup';

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', () => {
    render(<DocumentsPage />);
    expect(screen.getByText('Document Labels')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<DocumentsPage />);
    expect(screen.getAllByText(/Graph API operations/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders all section options', () => {
    render(<DocumentsPage />);
    expect(screen.getByText('Look Up')).toBeInTheDocument();
    expect(screen.getByText('Apply')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(screen.getByText('Bulk Apply')).toBeInTheDocument();
  });

  it('starts with Look Up section active', () => {
    render(<DocumentsPage />);
    expect(screen.getAllByText(/Extract the current sensitivity label/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Apply section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Apply'));
    expect(screen.getAllByText(/Assign a sensitivity label to a document/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Remove section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Remove'));
    expect(screen.getAllByText(/Remove the sensitivity label/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Bulk Apply section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Bulk Apply'));
    expect(screen.getAllByText(/Assign a label to multiple/).length).toBeGreaterThanOrEqual(1);
  });

  // ── Look Up section interaction tests ──────────────────────────────────

  it('Look Up section has Drive ID and Item ID fields', () => {
    render(<DocumentsPage />);
    expect(screen.getByText('Drive ID')).toBeInTheDocument();
    expect(screen.getByText('Item ID')).toBeInTheDocument();
  });

  it('Look Up shows validation error when fields empty', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Look Up Label'));
    await waitFor(() => {
      expect(screen.getByText(/Drive ID and Item ID are required/)).toBeInTheDocument();
    });
  });

  it('Look Up invokes Get-SLDocumentLabel with parameters', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'b!drive123');
    await user.type(inputs[1], '01ITEM456');
    await user.click(screen.getByText('Look Up Label'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLDocumentLabel', {
        DriveId: 'b!drive123',
        ItemId: '01ITEM456',
      });
    });
  });

  it('Look Up shows label results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        labels: [
          { name: 'Confidential', description: 'Company confidential', color: '#FF0000', assignmentMethod: 'Standard' },
        ],
      },
    });

    render(<DocumentsPage />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'b!drive');
    await user.type(inputs[1], '01ITEM');
    await user.click(screen.getByText('Look Up Label'));

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
      expect(screen.getByText('Company confidential')).toBeInTheDocument();
    });
  });

  it('Look Up shows error from invoke failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Not found' });

    render(<DocumentsPage />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'b!drive');
    await user.type(inputs[1], '01ITEM');
    await user.click(screen.getByText('Look Up Label'));

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('Look Up shows "no label" message when empty labels array', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      success: true,
      data: { labels: [] },
    });

    render(<DocumentsPage />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'b!drive');
    await user.type(inputs[1], '01ITEM');
    await user.click(screen.getByText('Look Up Label'));

    await waitFor(() => {
      expect(screen.getByText(/No sensitivity label applied/)).toBeInTheDocument();
    });
  });

  // ── Apply section interaction tests ────────────────────────────────────

  it('Apply section has label name and label ID fields', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Apply'));
    expect(screen.getByText('Label Name')).toBeInTheDocument();
    expect(screen.getByText('Label ID (GUID)')).toBeInTheDocument();
  });

  it('Apply section validates required fields', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Apply'));
    const applyBtn = screen.getByText('Apply Label');
    await user.click(applyBtn);
    await waitFor(() => {
      expect(screen.getByText(/Drive ID and Item ID are required/)).toBeInTheDocument();
    });
  });

  it('Apply section has dry run toggle', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Apply'));
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
  });

  // ── Nav highlight tests ────────────────────────────────────────────────

  it('highlights the active section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    const lookupBtn = screen.getByText('Look Up').closest('button')!;
    expect(lookupBtn.className).toContain('border-blue-400');

    await user.click(screen.getByText('Remove'));
    const removeBtn = screen.getByText('Remove').closest('button')!;
    expect(removeBtn.className).toContain('border-blue-400');
    expect(lookupBtn.className).not.toContain('border-blue-400');
  });

  it('shows Graph API connection note', () => {
    render(<DocumentsPage />);
    expect(screen.getByText(/Requires Graph API connection/)).toBeInTheDocument();
  });
});
