import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpPolicyList from '../../../renderer/components/DLP/DlpPolicyList';
import { mockInvoke } from '../../setup';

const mockPolicies = [
  {
    Name: 'PII Protection',
    Guid: 'guid-1',
    Comment: 'Protects PII data',
    Mode: 'Enable',
    Enabled: true,
    WhenCreated: '2024-01-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: ['All'],
    SharePointLocation: null,
    OneDriveLocation: null,
    TeamsLocation: null,
  },
  {
    Name: 'Financial Data Policy',
    Guid: 'guid-2',
    Comment: null,
    Mode: 'TestWithNotifications',
    Enabled: true,
    WhenCreated: '2024-02-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    TeamsLocation: null,
  },
  {
    Name: 'Health Records',
    Guid: 'guid-3',
    Comment: 'HIPAA compliance',
    Mode: 'TestWithoutNotifications',
    Enabled: true,
    WhenCreated: '2024-03-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    TeamsLocation: null,
  },
  {
    Name: 'Unknown Mode Policy',
    Guid: 'guid-4',
    Comment: null,
    Mode: null,
    Enabled: true,
    WhenCreated: '2024-04-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    TeamsLocation: null,
  },
  {
    Name: 'Custom Mode Policy',
    Guid: 'guid-5',
    Comment: null,
    Mode: 'SomeCustomMode',
    Enabled: true,
    WhenCreated: '2024-05-01T00:00:00Z',
    WhenChanged: null,
    ExchangeLocation: null,
    SharePointLocation: null,
    OneDriveLocation: null,
    TeamsLocation: null,
  },
];

describe('DlpPolicyList', () => {
  const onOpen = vi.fn();
  const onNew = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('renders policies after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
    expect(screen.getByText('Financial Data Policy')).toBeInTheDocument();
    expect(screen.getByText('Health Records')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLDlpPolicy', undefined);
  });

  it('displays policy count text (plural)', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText(/5 DLP policies/)).toBeInTheDocument();
    });
  });

  it('displays singular policy count', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockPolicies[0]] });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText(/1 DLP policy$/)).toBeInTheDocument();
    });
  });

  it('shows mode badge "Enforcing" for Enable mode', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Enforcing')).toBeInTheDocument();
    });
  });

  it('shows mode badge "Test + Notify" for TestWithNotifications mode', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Test + Notify')).toBeInTheDocument();
    });
  });

  it('shows mode badge "Test" for TestWithoutNotifications mode', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });

  it('shows "Unknown" for null mode', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('shows raw mode string for unrecognized modes', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('SomeCustomMode')).toBeInTheDocument();
    });
  });

  it('displays comment when present', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Protects PII data')).toBeInTheDocument();
    });
  });

  it('renders error state and retry button on failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows generic "Failed" on error with no error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('renders error state when invoke throws', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders generic error when invoke throws non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('retries fetch when Retry button is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Failed first' });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed first')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: [mockPolicies[0]] });
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
  });

  it('calls onOpen when a policy is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PII Protection'));
    expect(onOpen).toHaveBeenCalledWith('PII Protection');
  });

  it('calls onNew when "+ New DLP Policy" is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('+ New DLP Policy')).toBeInTheDocument();
    });
    await user.click(screen.getByText('+ New DLP Policy'));
    expect(onNew).toHaveBeenCalled();
  });

  it('filters policies by search text', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search DLP policies...');
    await user.type(searchInput, 'Financial');
    expect(screen.getByText('Financial Data Policy')).toBeInTheDocument();
    expect(screen.queryByText('PII Protection')).not.toBeInTheDocument();
  });

  it('shows "No DLP policies found." when search has no results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search DLP policies...');
    await user.type(searchInput, 'ZZZZNOEXIST');
    expect(screen.getByText('No DLP policies found.')).toBeInTheDocument();
  });

  it('shows empty message when API returns empty array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('No DLP policies found.')).toBeInTheDocument();
    });
  });

  it('refreshes data when Refresh button is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: [mockPolicies[1]] });
    await user.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(screen.getByText('Financial Data Policy')).toBeInTheDocument();
    });
  });

  it('renders error when data is not an array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not-an-array' });
    render(<DlpPolicyList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });
});
