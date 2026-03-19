import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpPolicyDetail from '../../../renderer/components/DLP/DlpPolicyDetail';
import { mockInvoke } from '../../setup';

const mockPolicy = {
  Name: 'PII Protection',
  Guid: 'abc-123-def',
  Comment: 'Protects personally identifiable information',
  Mode: 'Enable',
  Enabled: true,
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: '2024-06-20T14:00:00Z',
  ExchangeLocation: ['All'],
  SharePointLocation: ['https://contoso.sharepoint.com/sites/hr'],
  OneDriveLocation: null,
  TeamsLocation: ['All'],
};

const mockRules = [
  {
    Name: 'Block SSN Sharing',
    Guid: 'rule-1',
    Policy: 'PII Protection',
    Comment: 'Blocks SSN',
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
    Policy: 'PII Protection',
    Comment: null,
    BlockAccess: false,
    NotifyUser: null,
    GenerateAlert: null,
    ContentContainsSensitiveInformation: null,
    Disabled: true,
    Priority: 1,
  },
];

describe('DlpPolicyDetail', () => {
  const onEdit = vi.fn();
  const onDeleted = vi.fn();
  const onOpenRule = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('fetches policy and rules with correct commands', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: mockRules });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLDlpPolicy', expect.objectContaining({ Identity: 'PII Protection' }));
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLDlpRule', expect.objectContaining({ Identity: 'PII Protection' }));
  });

  it('passes policy name directly without escaping', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="It's a policy" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLDlpPolicy', expect.objectContaining({ Identity: "It's a policy" }));
    });
  });

  it('displays policy name, comment, and mode badge', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: mockRules });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
    expect(screen.getByText('Protects personally identifiable information')).toBeInTheDocument();
    expect(screen.getByText('Enforcing')).toBeInTheDocument();
  });

  it('shows mode description for Enable mode', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('This policy is actively enforcing DLP rules.')).toBeInTheDocument();
    });
  });

  it('shows mode description for TestWithNotifications', async () => {
    const testPolicy = { ...mockPolicy, Mode: 'TestWithNotifications' };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: testPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Test + Notifications')).toBeInTheDocument();
      expect(screen.getByText(/Running in test mode/)).toBeInTheDocument();
    });
  });

  it('shows mode description for TestWithoutNotifications', async () => {
    const testPolicy = { ...mockPolicy, Mode: 'TestWithoutNotifications' };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: testPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Test (Silent)')).toBeInTheDocument();
      expect(screen.getByText(/silent test mode/)).toBeInTheDocument();
    });
  });

  it('shows unknown mode without description', async () => {
    const testPolicy = { ...mockPolicy, Mode: null };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: testPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('displays GUID and dates', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('abc-123-def')).toBeInTheDocument();
    });
    expect(screen.getByText('GUID')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
  });

  it('displays rules list with correct details', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: mockRules });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.getByText('Monitor Credit Cards')).toBeInTheDocument();
    expect(screen.getByText('Rules (2)')).toBeInTheDocument();
    expect(screen.getByText('Blocks')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Blocks SSN')).toBeInTheDocument();
  });

  it('shows empty rules message when no rules', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText(/No rules configured/)).toBeInTheDocument();
    });
  });

  it('calls onOpenRule when a rule is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: mockRules });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Block SSN Sharing'));
    expect(onOpenRule).toHaveBeenCalledWith('Block SSN Sharing');
  });

  it('calls onEdit when Edit button is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('PII Protection');
  });

  it('renders error state when policy fetch fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: false, data: null, error: 'Policy not found' });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Policy not found')).toBeInTheDocument();
    });
  });

  it('renders "Not found" when policy fetch returns null data without error', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: false, data: null });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('displays locations correctly', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('Scoped Locations')).toBeInTheDocument();
    });
    // Exchange = All, so "All locations" shown
    const allLocations = screen.getAllByText('All locations');
    expect(allLocations.length).toBeGreaterThanOrEqual(1);
    // SharePoint has specific site
    expect(screen.getByText('https://contoso.sharepoint.com/sites/hr')).toBeInTheDocument();
    // OneDrive is null, so "Not configured"
    const notConfigured = screen.getAllByText('Not configured');
    expect(notConfigured.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles raw JSON display', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: mockPolicy });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Show raw JSON/));
    expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
    // JSON should be visible
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain('PII Protection');

    // Toggle off
    await user.click(screen.getByText(/Hide raw JSON/));
    expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });

  it('handles null comment on policy', async () => {
    const policyNoComment = { ...mockPolicy, Comment: null };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: policyNoComment });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
    // Comment paragraph should not be present
    expect(screen.queryByText('Protects personally identifiable information')).not.toBeInTheDocument();
  });

  it('handles null WhenCreated date', async () => {
    const policyNoDates = { ...mockPolicy, WhenCreated: null, WhenChanged: null };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'Get-SLDlpPolicy') return Promise.resolve({ success: true, data: policyNoDates });
      if (cmd === 'Get-SLDlpRule') return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: false, data: null });
    });
    render(<DlpPolicyDetail policyName="PII Protection" onEdit={onEdit} onDeleted={onDeleted} onOpenRule={onOpenRule} />);
    await waitFor(() => {
      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
