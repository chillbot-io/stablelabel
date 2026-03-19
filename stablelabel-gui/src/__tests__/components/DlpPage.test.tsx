import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpPage from '../../renderer/components/DLP/DlpPage';
import { mockInvoke } from '../setup';

describe('DlpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders browser section tabs', () => {
    render(<DlpPage />);
    expect(screen.getAllByText('Policies').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rules').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Info Types').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty workspace message initially', () => {
    render(<DlpPage />);
    expect(screen.getByText(/Select an item/i)).toBeInTheDocument();
  });

  it('has New DLP Policy button', () => {
    render(<DlpPage />);
    expect(screen.getAllByText('+ New DLP Policy').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Rules section', async () => {
    const user = userEvent.setup();
    render(<DlpPage />);

    const rulesButtons = screen.getAllByText('Rules');
    await user.click(rulesButtons[0]);
    expect(screen.getAllByText('+ New DLP Rule').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Info Types section', async () => {
    const user = userEvent.setup();
    render(<DlpPage />);

    const sitButtons = screen.getAllByText('Info Types');
    await user.click(sitButtons[0]);
    // Info Types section is active — sidebar no longer shows policy/rule lists
    // The empty workspace still has the quick action buttons
    expect(screen.getByText('Sensitive data patterns')).toBeInTheDocument();
  });

  it('switches back to Policies section from Rules', async () => {
    const user = userEvent.setup();
    render(<DlpPage />);

    // Go to Rules
    await user.click(screen.getAllByText('Rules')[0]);
    expect(screen.getAllByText('+ New DLP Rule').length).toBeGreaterThanOrEqual(1);

    // Back to Policies
    await user.click(screen.getAllByText('Policies')[0]);
    expect(screen.getAllByText('+ New DLP Policy').length).toBeGreaterThanOrEqual(1);
  });

  it('opens new policy form tab via button', async () => {
    const user = userEvent.setup();
    render(<DlpPage />);

    const newPolicyBtns = screen.getAllByText('+ New DLP Policy');
    await user.click(newPolicyBtns[0]);
    // Workspace should no longer show empty message
    expect(screen.queryByText(/Select an item/i)).not.toBeInTheDocument();
    // A new tab should appear
    expect(screen.getByText('+ New Policy')).toBeInTheDocument();
  });

  it('opens new rule form tab via button', async () => {
    const user = userEvent.setup();
    render(<DlpPage />);

    // Switch to Rules section first
    await user.click(screen.getAllByText('Rules')[0]);
    const newRuleBtns = screen.getAllByText('+ New DLP Rule');
    await user.click(newRuleBtns[0]);
    expect(screen.getByText('+ New Rule')).toBeInTheDocument();
  });

  it('fetches DLP policies on mount', async () => {
    render(<DlpPage />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Get-SLDlpPolicy');
    });
  });

  it('shows quick links in empty workspace', () => {
    render(<DlpPage />);
    expect(screen.getByText('DLP compliance policies')).toBeInTheDocument();
    expect(screen.getByText('Detection & actions')).toBeInTheDocument();
    expect(screen.getByText('Sensitive data patterns')).toBeInTheDocument();
  });

  it('quick link switches browser section', async () => {
    const user = userEvent.setup();
    render(<DlpPage />);

    // Click "Rules" quick link in workspace
    const rulesLink = screen.getByText('Detection & actions');
    await user.click(rulesLink.closest('button')!);
    // Rules section should be active
    expect(screen.getAllByText('+ New DLP Rule').length).toBeGreaterThanOrEqual(1);
  });

  it('displays policy list items when data returned', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: [
        { Name: 'Policy-Alpha', Guid: 'g1', Mode: 'Enable', Comment: 'Test policy' },
        { Name: 'Policy-Beta', Guid: 'g2', Mode: 'TestWithNotifications', Comment: null },
      ],
    });

    render(<DlpPage />);
    await waitFor(() => {
      expect(screen.getByText('Policy-Alpha')).toBeInTheDocument();
      expect(screen.getByText('Policy-Beta')).toBeInTheDocument();
    });
  });

  it('opens policy detail tab when clicking list item', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      success: true,
      data: [{ Name: 'My-Policy', Guid: 'g1', Mode: 'Enable', Comment: null }],
    });

    render(<DlpPage />);
    await waitFor(() => {
      expect(screen.getByText('My-Policy')).toBeInTheDocument();
    });

    // Click the policy in the list (the button)
    await user.click(screen.getByText('My-Policy'));
    // Empty workspace should be replaced by the detail tab
    expect(screen.queryByText(/Select an item/i)).not.toBeInTheDocument();
  });

  it('shows error state when policy fetch fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });

    render(<DlpPage />);
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  it('has Retry button on error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });

    render(<DlpPage />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});
