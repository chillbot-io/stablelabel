import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentTracking from '../../../renderer/components/Protection/DocumentTracking';
import { mockInvoke } from '../../setup';

const mockEntries = [
  {
    ContentId: 'doc-001',
    Issuer: 'alice@contoso.com',
    Owner: 'bob@contoso.com',
    ContentName: 'Quarterly Report.docx',
    CreatedTime: '2024-03-15T10:30:00Z',
  },
  {
    ContentId: 'doc-002',
    Issuer: 'charlie@contoso.com',
    Owner: null,
    ContentName: null,
    CreatedTime: null,
  },
];

describe('DocumentTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and description', () => {
    render(<DocumentTracking />);
    expect(screen.getByText('Document Tracking')).toBeInTheDocument();
    expect(screen.getByText(/Search AIP document tracking logs/)).toBeInTheDocument();
  });

  it('renders search form with fields', () => {
    render(<DocumentTracking />);
    expect(screen.getByText('Search Tracking Logs')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('user@contoso.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('2024-01-01')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('2024-12-31')).toBeInTheDocument();
    expect(screen.getByText('Search Logs')).toBeInTheDocument();
  });

  it('does not show results initially', () => {
    render(<DocumentTracking />);
    expect(screen.queryByText(/Entries Found/)).not.toBeInTheDocument();
  });

  it('searches with no filters', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLDocumentTrack');
    });
    expect(screen.getByText('2 Entries Found')).toBeInTheDocument();
  });

  it('searches with all filters populated', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });
    render(<DocumentTracking />);

    await user.type(screen.getByPlaceholderText('user@contoso.com'), 'alice@contoso.com');
    await user.type(screen.getByPlaceholderText('2024-01-01'), '2024-01-01');
    await user.type(screen.getByPlaceholderText('2024-12-31'), '2024-12-31');
    await user.click(screen.getByText('Search Logs'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLDocumentTrack -UserEmail 'alice@contoso.com' -FromTime '2024-01-01' -ToTime '2024-12-31'");
    });
  });

  it('displays search results with entry details', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('Quarterly Report.docx')).toBeInTheDocument();
    });
    expect(screen.getByText('doc-001')).toBeInTheDocument();
    expect(screen.getByText('Issuer: alice@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('Owner: bob@contoso.com')).toBeInTheDocument();
  });

  it('shows Unnamed document when ContentName is null', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [mockEntries[1]] });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('Unnamed document')).toBeInTheDocument();
    });
  });

  it('uses singular Entry for one result', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [mockEntries[0]] });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('1 Entry Found')).toBeInTheDocument();
    });
  });

  it('shows empty message when no results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('0 Entries Found')).toBeInTheDocument();
    });
    expect(screen.getByText('No tracking entries match your search criteria.')).toBeInTheDocument();
  });

  it('handles null data as empty array', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('0 Entries Found')).toBeInTheDocument();
    });
  });

  it('wraps non-array data into array', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries[0] });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('1 Entry Found')).toBeInTheDocument();
    });
  });

  it('shows error when search fails', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Service error' });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('shows error when search throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Network down'));
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });

  it('shows Searching... while loading', async () => {
    const user = userEvent.setup();
    let resolveSearch!: (v: unknown) => void;
    mockInvoke.mockImplementation(() => new Promise(r => { resolveSearch = r; }));
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    expect(screen.getByText('Searching...')).toBeInTheDocument();

    resolveSearch({ success: true, data: [] });
    await waitFor(() => {
      expect(screen.getByText('Search Logs')).toBeInTheDocument();
    });
  });

  it('toggles raw JSON in results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });
    render(<DocumentTracking />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('2 Entries Found')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Show.*raw JSON/));
    expect(screen.getByText(/Hide.*raw JSON/)).toBeInTheDocument();
  });

  // === Revoke Access ===
  it('renders revoke and restore sections', () => {
    render(<DocumentTracking />);
    expect(screen.getAllByText(/Revoke Access/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Restore Access/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows revoke validation error when fields are empty', async () => {
    const user = userEvent.setup();
    render(<DocumentTracking />);

    // The "Revoke Access" button is the one inside the revoke form
    const revokeButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Revoke Access');
    await user.click(revokeButtons[0]);
    expect(screen.getByText('Content ID and Issuer Email are required.')).toBeInTheDocument();
  });

  it('shows revoke confirm dialog with filled fields', async () => {
    const user = userEvent.setup();
    render(<DocumentTracking />);

    // There are two sets of Content ID / Issuer Email fields (revoke and restore)
    const contentInputs = screen.getAllByPlaceholderText('Document content ID...');
    const emailInputs = screen.getAllByPlaceholderText('issuer@contoso.com');

    await user.type(contentInputs[0], 'doc-abc');
    await user.type(emailInputs[0], 'user@test.com');

    const revokeButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Revoke Access');
    await user.click(revokeButtons[0]);

    expect(screen.getByText('Revoke Document Access')).toBeInTheDocument();
    expect(screen.getByText(/Revoke access to document "doc-abc"/)).toBeInTheDocument();
  });

  it('confirms revoke and calls correct PS command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<DocumentTracking />);

    const contentInputs = screen.getAllByPlaceholderText('Document content ID...');
    const emailInputs = screen.getAllByPlaceholderText('issuer@contoso.com');

    await user.type(contentInputs[0], 'doc-abc');
    await user.type(emailInputs[0], 'user@test.com');

    const revokeButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Revoke Access');
    await user.click(revokeButtons[0]);

    // Click confirm in dialog
    await user.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Revoke-SLDocumentAccess -ContentId 'doc-abc' -IssuerEmail 'user@test.com' -Confirm:$false");
    });
    expect(screen.getByText('Document access revoked.')).toBeInTheDocument();
  });

  it('shows error when revoke fails', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Not found' });
    render(<DocumentTracking />);

    const contentInputs = screen.getAllByPlaceholderText('Document content ID...');
    const emailInputs = screen.getAllByPlaceholderText('issuer@contoso.com');

    await user.type(contentInputs[0], 'doc-abc');
    await user.type(emailInputs[0], 'user@test.com');

    const revokeButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Revoke Access');
    await user.click(revokeButtons[0]);
    await user.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  // === Restore Access ===
  it('shows restore validation error when fields are empty', async () => {
    const user = userEvent.setup();
    render(<DocumentTracking />);

    const restoreButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Restore Access');
    await user.click(restoreButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByText('Content ID and Issuer Email are required.').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('restores access successfully', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<DocumentTracking />);

    const contentInputs = screen.getAllByPlaceholderText('Document content ID...');
    const emailInputs = screen.getAllByPlaceholderText('issuer@contoso.com');

    // Second set of inputs = restore section
    await user.type(contentInputs[1], 'doc-xyz');
    await user.type(emailInputs[1], 'admin@test.com');

    const restoreButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Restore Access');
    await user.click(restoreButtons[0]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Restore-SLDocumentAccess -ContentId 'doc-xyz' -IssuerEmail 'admin@test.com' -Confirm:$false");
    });
    expect(screen.getByText('Document access restored.')).toBeInTheDocument();
  });

  it('shows error when restore fails', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Already active' });
    render(<DocumentTracking />);

    const contentInputs = screen.getAllByPlaceholderText('Document content ID...');
    const emailInputs = screen.getAllByPlaceholderText('issuer@contoso.com');

    await user.type(contentInputs[1], 'doc-xyz');
    await user.type(emailInputs[1], 'admin@test.com');

    const restoreButtons = screen.getAllByRole('button').filter(b => b.textContent === 'Restore Access');
    await user.click(restoreButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Already active')).toBeInTheDocument();
    });
  });
});
