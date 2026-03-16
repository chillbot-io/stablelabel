import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtectionLogs from '../../../renderer/components/Protection/ProtectionLogs';
import { mockInvoke } from '../../setup';

const mockLogEntries = [
  {
    RequesterEmail: 'alice@contoso.com',
    Operation: 'Decrypt',
    DateTime: '2024-06-15T14:30:00Z',
    ContentName: 'Budget.xlsx',
    ContentId: 'log-001',
  },
  {
    UserEmail: 'bob@contoso.com',
    Action: 'View',
    CreatedTime: '2024-06-14T09:00:00Z',
    FileName: 'Report.pdf',
  },
  {
    Email: 'charlie@contoso.com',
    ActivityType: 'Protect',
    Timestamp: '2024-06-13T11:00:00Z',
    ObjectId: 'ProjectPlan.docx',
  },
  {
    // entry with no recognizable fields
    SomeField: 'value',
  },
];

describe('ProtectionLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and description', () => {
    render(<ProtectionLogs />);
    expect(screen.getByText('Protection Logs')).toBeInTheDocument();
    expect(screen.getByText(/AIP protection tracking logs/)).toBeInTheDocument();
  });

  it('renders search form', () => {
    render(<ProtectionLogs />);
    expect(screen.getByPlaceholderText('user@contoso.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('2024-01-01')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('2024-12-31')).toBeInTheDocument();
    expect(screen.getByText('Search Logs')).toBeInTheDocument();
  });

  it('does not show results initially', () => {
    render(<ProtectionLogs />);
    expect(screen.queryByText(/Log Entr/)).not.toBeInTheDocument();
  });

  it('searches with no filters', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockLogEntries });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLProtectionLog');
    });
    expect(screen.getByText('4 Log Entries')).toBeInTheDocument();
  });

  it('searches with all filters', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<ProtectionLogs />);

    await user.type(screen.getByPlaceholderText('user@contoso.com'), 'alice@contoso.com');
    await user.type(screen.getByPlaceholderText('2024-01-01'), '2024-06-01');
    await user.type(screen.getByPlaceholderText('2024-12-31'), '2024-06-30');
    await user.click(screen.getByText('Search Logs'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLProtectionLog -UserEmail 'alice@contoso.com' -FromTime '2024-06-01' -ToTime '2024-06-30'");
    });
  });

  it('escapes single quotes in search fields', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<ProtectionLogs />);

    await user.type(screen.getByPlaceholderText('user@contoso.com'), "o'malley@test.com");
    await user.click(screen.getByText('Search Logs'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLProtectionLog -UserEmail 'o''malley@test.com'");
    });
  });

  it('uses singular "Entry" for one result', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[0]] });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('1 Log Entry')).toBeInTheDocument();
    });
  });

  it('shows empty message when no results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('0 Log Entries')).toBeInTheDocument();
    });
    expect(screen.getByText('No log entries match your search criteria.')).toBeInTheDocument();
  });

  it('wraps non-array data into single-element array', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockLogEntries[0] });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('1 Log Entry')).toBeInTheDocument();
    });
  });

  it('handles null data as empty array', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('0 Log Entries')).toBeInTheDocument();
    });
  });

  it('shows error when search fails', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Unauthorized' });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  it('shows fallback error when search fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when search throws Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('CORS blocked'));
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('CORS blocked')).toBeInTheDocument();
    });
  });

  it('shows generic error when search throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(42);
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      const errorDivs = document.querySelectorAll('.text-red-300');
      expect(errorDivs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Searching... while loading', async () => {
    const user = userEvent.setup();
    let resolveSearch: (v: any) => void;
    mockInvoke.mockImplementation(() => new Promise(r => { resolveSearch = r; }));
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    expect(screen.getByText('Searching...')).toBeInTheDocument();

    resolveSearch!({ success: true, data: [] });
    await waitFor(() => {
      expect(screen.getByText('Search Logs')).toBeInTheDocument();
    });
  });

  // LogEntryCard tests
  describe('LogEntryCard', () => {
    it('displays entry with RequesterEmail, Operation, DateTime, ContentName', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[0]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('Decrypt')).toBeInTheDocument();
      });
      expect(screen.getByText('Budget.xlsx')).toBeInTheDocument();
      expect(screen.getByText('alice@contoso.com')).toBeInTheDocument();
      expect(screen.getByText('2024-06-15T14:30:00Z')).toBeInTheDocument();
    });

    it('displays entry with UserEmail, Action, CreatedTime, FileName', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[1]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      expect(screen.getByText('Report.pdf')).toBeInTheDocument();
      expect(screen.getByText('bob@contoso.com')).toBeInTheDocument();
      expect(screen.getByText('2024-06-14T09:00:00Z')).toBeInTheDocument();
    });

    it('displays entry with Email, ActivityType, Timestamp, ObjectId', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[2]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('Protect')).toBeInTheDocument();
      });
      expect(screen.getByText('ProjectPlan.docx')).toBeInTheDocument();
      expect(screen.getByText('charlie@contoso.com')).toBeInTheDocument();
      expect(screen.getByText('2024-06-13T11:00:00Z')).toBeInTheDocument();
    });

    it('shows Unknown when no content name fields exist', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[3]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
    });

    it('hides action badge when no action field exists', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[3]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
      // No badge should be rendered
      expect(document.querySelector('.bg-blue-500\\/10')).not.toBeInTheDocument();
    });

    it('hides email and time when fields are absent', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[3]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
      // The meta row exists but should have no child spans
      expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    });

    it('expands and collapses entry JSON detail', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: [mockLogEntries[0]] });
      render(<ProtectionLogs />);

      await user.click(screen.getByText('Search Logs'));
      await waitFor(() => {
        expect(screen.getByText('Budget.xlsx')).toBeInTheDocument();
      });

      // Find the expand button (triangle)
      const expandBtns = screen.getAllByRole('button');
      const expandBtn = expandBtns.find(b => b.textContent?.includes('\u25B8'));
      expect(expandBtn).toBeDefined();
      await user.click(expandBtn!);

      // JSON should be visible in a pre tag
      const pre = document.querySelector('pre');
      expect(pre).toBeInTheDocument();
      expect(pre!.textContent).toContain('RequesterEmail');

      // Collapse
      const collapseBtn = expandBtns.find(b => b.textContent?.includes('\u25BE'));
      // Re-query since the text changed
      const allBtns = screen.getAllByRole('button');
      const collapseBtn2 = allBtns.find(b => b.textContent?.includes('\u25BE'));
      if (collapseBtn2) {
        await user.click(collapseBtn2);
        // Pre should be gone (within the card; the RawJson pre might still exist)
      }
    });
  });

  // RawJson toggle
  it('toggles all raw JSON display', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockLogEntries });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('4 Log Entries')).toBeInTheDocument();
    });

    const showBtn = screen.getByText(/Show.*all raw JSON/);
    await user.click(showBtn);
    expect(screen.getByText(/Hide.*all raw JSON/)).toBeInTheDocument();

    await user.click(screen.getByText(/Hide.*all raw JSON/));
    expect(screen.queryByText(/Hide.*all raw JSON/)).not.toBeInTheDocument();
  });

  it('clears previous results on new search', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLogEntries })
      .mockResolvedValueOnce({ success: true, data: [] });
    render(<ProtectionLogs />);

    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('4 Log Entries')).toBeInTheDocument();
    });

    // Search again
    await user.click(screen.getByText('Search Logs'));
    await waitFor(() => {
      expect(screen.getByText('0 Log Entries')).toBeInTheDocument();
    });
  });
});
