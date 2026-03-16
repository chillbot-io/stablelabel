import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpRuleDetail from '../../../renderer/components/DLP/DlpRuleDetail';
import { mockInvoke } from '../../setup';

const mockRule = {
  Name: 'Block SSN Sharing',
  Guid: 'rule-guid-1',
  Policy: 'PII Protection',
  Comment: 'Blocks SSN in emails',
  BlockAccess: true,
  NotifyUser: ['admin@contoso.com', 'security@contoso.com'],
  GenerateAlert: ['alert@contoso.com'],
  ContentContainsSensitiveInformation: [
    { Name: 'U.S. Social Security Number', minCount: 1 },
    { name: 'Credit Card Number', minCount: 5 },
  ],
  Disabled: false,
  Priority: 3,
};

describe('DlpRuleDetail', () => {
  const onEdit = vi.fn();
  const onDeleted = vi.fn();
  const onOpenPolicy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('fetches rule with correct command', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLDlpRule -Identity 'Block SSN Sharing'");
    });
  });

  it('escapes single quotes in rule name', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="It's a rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLDlpRule -Identity 'It''s a rule'");
    });
  });

  it('displays rule name, comment, and rule details', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.getByText('Blocks SSN in emails')).toBeInTheDocument();
    expect(screen.getByText('rule-guid-1')).toBeInTheDocument();
  });

  it('shows Block Access as Yes when true', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });
  });

  it('shows Block Access as No when false', async () => {
    const ruleNoBlock = { ...mockRule, BlockAccess: false };
    mockInvoke.mockResolvedValue({ success: true, data: ruleNoBlock });
    render(<DlpRuleDetail ruleName="Test Rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('No')).toBeInTheDocument();
    });
  });

  it('displays notify users list', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('admin@contoso.com, security@contoso.com')).toBeInTheDocument();
    });
  });

  it('shows "None" when NotifyUser is empty', async () => {
    const ruleNoNotify = { ...mockRule, NotifyUser: [], GenerateAlert: [] };
    mockInvoke.mockResolvedValue({ success: true, data: ruleNoNotify });
    render(<DlpRuleDetail ruleName="Test Rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      const noneElements = screen.getAllByText('None');
      expect(noneElements.length).toBe(2); // NotifyUser and GenerateAlert
    });
  });

  it('shows "None" when NotifyUser is null', async () => {
    const ruleNullNotify = { ...mockRule, NotifyUser: null, GenerateAlert: null };
    mockInvoke.mockResolvedValue({ success: true, data: ruleNullNotify });
    render(<DlpRuleDetail ruleName="Test Rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      const noneElements = screen.getAllByText('None');
      expect(noneElements.length).toBe(2);
    });
  });

  it('displays generate alert list', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('alert@contoso.com')).toBeInTheDocument();
    });
  });

  it('shows Disabled badge when rule is disabled', async () => {
    const disabledRule = { ...mockRule, Disabled: true };
    mockInvoke.mockResolvedValue({ success: true, data: disabledRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('does not show Disabled badge when rule is enabled', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
  });

  it('displays parent policy as clickable link', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('PII Protection')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PII Protection'));
    expect(onOpenPolicy).toHaveBeenCalledWith('PII Protection');
  });

  it('displays priority when present', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('hides priority card when null', async () => {
    const noPriority = { ...mockRule, Priority: null };
    mockInvoke.mockResolvedValue({ success: true, data: noPriority });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Priority')).not.toBeInTheDocument();
  });

  it('displays sensitive info types', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Detects Sensitive Info Types')).toBeInTheDocument();
    });
    expect(screen.getByText(/U\.S\. Social Security Number/)).toBeInTheDocument();
    expect(screen.getByText(/min: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Credit Card Number/)).toBeInTheDocument();
    expect(screen.getByText(/min: 5/)).toBeInTheDocument();
  });

  it('hides sensitive info types section when empty', async () => {
    const noSit = { ...mockRule, ContentContainsSensitiveInformation: [] };
    mockInvoke.mockResolvedValue({ success: true, data: noSit });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Detects Sensitive Info Types')).not.toBeInTheDocument();
  });

  it('hides sensitive info types section when null', async () => {
    const nullSit = { ...mockRule, ContentContainsSensitiveInformation: null };
    mockInvoke.mockResolvedValue({ success: true, data: nullSit });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Detects Sensitive Info Types')).not.toBeInTheDocument();
  });

  it('handles sensitive info type without Name (fallback to JSON)', async () => {
    const ruleWeirdSit = {
      ...mockRule,
      ContentContainsSensitiveInformation: [{ someField: 'value' }],
    };
    mockInvoke.mockResolvedValue({ success: true, data: ruleWeirdSit });
    render(<DlpRuleDetail ruleName="Test Rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Detects Sensitive Info Types')).toBeInTheDocument();
    });
    // Should show JSON stringified
    expect(screen.getByText(/someField/)).toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('Block SSN Sharing');
  });

  it('renders error state when fetch fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Rule not found' });
    render(<DlpRuleDetail ruleName="Missing Rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Rule not found')).toBeInTheDocument();
    });
  });

  it('renders "Not found" when fetch returns null without error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<DlpRuleDetail ruleName="Missing Rule" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('handles null comment', async () => {
    const noComment = { ...mockRule, Comment: null };
    mockInvoke.mockResolvedValue({ success: true, data: noComment });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText('Block SSN Sharing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Blocks SSN in emails')).not.toBeInTheDocument();
  });

  it('toggles raw JSON', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockRule });
    render(<DlpRuleDetail ruleName="Block SSN Sharing" onEdit={onEdit} onDeleted={onDeleted} onOpenPolicy={onOpenPolicy} />);
    await waitFor(() => {
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Show raw JSON/));
    expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain('Block SSN Sharing');

    await user.click(screen.getByText(/Hide raw JSON/));
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });
});
