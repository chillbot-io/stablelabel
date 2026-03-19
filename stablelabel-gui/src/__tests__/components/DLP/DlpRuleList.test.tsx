import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpRuleList from '../../../renderer/components/DLP/DlpRuleList';
import { mockInvoke } from '../../setup';

const mockRules = [
  {
    Name: 'Block SSN Sharing',
    Guid: 'rule-1',
    Policy: 'PII Protection',
    Comment: null,
    BlockAccess: true,
    NotifyUser: null,
    GenerateAlert: null,
    ContentContainsSensitiveInformation: null,
    Disabled: false,
    Priority: 0,
  },
  {
    Name: 'Monitor Credit Cards',
    Guid: 'rule-2',
    Policy: 'Financial Policy',
    Comment: null,
    BlockAccess: false,
    NotifyUser: null,
    GenerateAlert: null,
    ContentContainsSensitiveInformation: null,
    Disabled: true,
    Priority: 1,
  },
  {
    Name: 'Health Data Rule',
    Guid: 'rule-3',
    Policy: 'HIPAA Policy',
    Comment: null,
    BlockAccess: false,
    NotifyUser: null,
    GenerateAlert: null,
    ContentContainsSensitiveInformation: null,
    Disabled: false,
    Priority: 2,
  },
];

describe('DlpRuleList', () => {
  const onOpen = vi.fn();
  const onNew = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('fetches and displays rules', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.getByText('Monitor Credit Cards')).toBeInTheDocument();
    expect(screen.getByText('Health Data Rule')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLDlpRule', undefined);
  });

  it('displays rule count (plural)', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText(/3 DLP rules/)).toBeInTheDocument();
    });
  });

  it('displays singular rule count', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockRules[0]] });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText(/1 DLP rule$/)).toBeInTheDocument();
    });
  });

  it('shows Block badge for BlockAccess rules', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block')).toBeInTheDocument();
    });
  });

  it('shows Off badge for disabled rules', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Off')).toBeInTheDocument();
    });
  });

  it('shows parent policy name', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Policy: PII Protection')).toBeInTheDocument();
      expect(screen.getByText('Policy: Financial Policy')).toBeInTheDocument();
    });
  });

  it('renders error state with retry', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows generic error when no error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('handles invoke exception', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('retries fetch on Retry click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Error' });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockRules });
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
  });

  it('calls onOpen when a rule is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Block SSN Sharing'));
    expect(onOpen).toHaveBeenCalledWith('Block SSN Sharing');
  });

  it('calls onNew when "+ New DLP Rule" is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('+ New DLP Rule')).toBeInTheDocument();
    });
    await user.click(screen.getByText('+ New DLP Rule'));
    expect(onNew).toHaveBeenCalled();
  });

  it('filters rules by name', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search rules...'), 'Block');
    expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    expect(screen.queryByText('Monitor Credit Cards')).not.toBeInTheDocument();
  });

  it('filters rules by policy name', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search rules...'), 'Financial');
    expect(screen.getByText('Monitor Credit Cards')).toBeInTheDocument();
    expect(screen.queryByText('Block SSN Sharing')).not.toBeInTheDocument();
  });

  it('shows empty message when no rules match filter', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search rules...'), 'ZZZZZZZZZ');
    expect(screen.getByText('No DLP rules found.')).toBeInTheDocument();
  });

  it('shows empty message when API returns empty array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('No DLP rules found.')).toBeInTheDocument();
    });
  });

  it('refreshes on Refresh click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRules });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    mockInvoke.mockResolvedValue({ success: true, data: [mockRules[1]] });
    await user.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(screen.getByText('Monitor Credit Cards')).toBeInTheDocument();
    });
  });

  it('renders error when data is not array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not-array' });
    render(<DlpRuleList onOpen={onOpen} onNew={onNew} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });
});
