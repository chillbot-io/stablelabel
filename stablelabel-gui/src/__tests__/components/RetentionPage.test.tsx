import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionPage from '../../renderer/components/Retention/RetentionPage';
import { mockInvoke } from '../setup';

describe('RetentionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('renders browser section tabs', () => {
    render(<RetentionPage />);
    expect(screen.getAllByText(/Labels/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Policies/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty workspace message', () => {
    render(<RetentionPage />);
    expect(screen.getByText('Retention Management')).toBeInTheDocument();
    expect(screen.getByText(/Browse retention labels and policies/)).toBeInTheDocument();
  });

  it('has quick links for Labels and Policies', () => {
    render(<RetentionPage />);
    expect(screen.getByText('Duration, action, type')).toBeInTheDocument();
    expect(screen.getByText('Location scoping')).toBeInTheDocument();
  });

  it('has New Retention Label button in empty workspace', () => {
    render(<RetentionPage />);
    expect(screen.getAllByText('+ New Retention Label').length).toBeGreaterThanOrEqual(1);
  });

  it('has New Retention Policy button in empty workspace', () => {
    render(<RetentionPage />);
    expect(screen.getAllByText('+ New Retention Policy').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Policies section', async () => {
    const user = userEvent.setup();
    render(<RetentionPage />);

    // Click the Policies tab in the browser
    const tabs = screen.getAllByText('Policies');
    // Find the tab button (not the quick link)
    const tabButton = tabs.find(el => el.tagName === 'BUTTON' && el.className.includes('border-b-2'));
    await user.click(tabButton!);
    // Policies section should be active (amber border)
    expect(tabButton!.className).toContain('border-amber-400');
  });

  it('opens new retention label form tab', async () => {
    const user = userEvent.setup();
    render(<RetentionPage />);

    const newLabelBtns = screen.getAllByText('+ New Retention Label');
    await user.click(newLabelBtns[0]);
    // Empty workspace should be replaced
    expect(screen.queryByText('Retention Management')).not.toBeInTheDocument();
    // Tab should appear
    expect(screen.getByText('+ New Label')).toBeInTheDocument();
  });

  it('opens new retention policy form tab', async () => {
    const user = userEvent.setup();
    render(<RetentionPage />);

    const newPolicyBtns = screen.getAllByText('+ New Retention Policy');
    await user.click(newPolicyBtns[0]);
    expect(screen.queryByText('Retention Management')).not.toBeInTheDocument();
    expect(screen.getByText('+ New Policy')).toBeInTheDocument();
  });

  it('Labels tab has active amber accent by default', () => {
    render(<RetentionPage />);
    const tabs = screen.getAllByText('Labels');
    const tabBtn = tabs.find(el => el.tagName === 'BUTTON' && el.className.includes('border-b-2'));
    expect(tabBtn!.className).toContain('border-amber-400');
  });

  it('quick link for Labels switches section', async () => {
    const user = userEvent.setup();
    render(<RetentionPage />);

    // Switch to Policies first
    const policiesTabs = screen.getAllByText('Policies');
    const tabButton = policiesTabs.find(el => el.tagName === 'BUTTON' && el.className.includes('border-b-2'));
    await user.click(tabButton!);

    // Click the Labels quick link in workspace
    const labelsLink = screen.getByText('Duration, action, type');
    await user.click(labelsLink.closest('button')!);

    // Labels tab should be active
    const labelsTabs = screen.getAllByText('Labels');
    const labelsTabBtn = labelsTabs.find(el => el.tagName === 'BUTTON' && el.className.includes('border-b-2'));
    expect(labelsTabBtn!.className).toContain('border-amber-400');
  });

  it('fetches retention labels on mount', async () => {
    render(<RetentionPage />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Get-SLRetentionLabel');
    });
  });

  it('displays label list items when data returned', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: [
        { Name: 'Retain-3yr', RetentionDuration: 1095, RetentionAction: 'Keep', IsInUse: true },
        { Name: 'Delete-1yr', RetentionDuration: 365, RetentionAction: 'Delete', IsInUse: false },
      ],
    });

    render(<RetentionPage />);
    await waitFor(() => {
      expect(screen.getByText('Retain-3yr')).toBeInTheDocument();
      expect(screen.getByText('Delete-1yr')).toBeInTheDocument();
    });
  });

  it('opens label detail tab when clicking list item', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      success: true,
      data: [{ Name: 'My-Label', RetentionDuration: 365, RetentionAction: 'Keep', IsInUse: true }],
    });

    render(<RetentionPage />);
    await waitFor(() => {
      expect(screen.getByText('My-Label')).toBeInTheDocument();
    });

    await user.click(screen.getByText('My-Label'));
    expect(screen.queryByText('Retention Management')).not.toBeInTheDocument();
  });

  it('shows error state when label fetch fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Session expired' });

    render(<RetentionPage />);
    await waitFor(() => {
      expect(screen.getByText('Session expired')).toBeInTheDocument();
    });
  });

  it('opens multiple form tabs', async () => {
    const user = userEvent.setup();
    render(<RetentionPage />);

    // Open label form from sidebar
    const newLabelBtns = screen.getAllByText('+ New Retention Label');
    await user.click(newLabelBtns[0]);
    expect(screen.getByText('+ New Label')).toBeInTheDocument();

    // Switch to Policies in browser, then open policy form from sidebar
    const policiesTabs = screen.getAllByText('Policies');
    const tabButton = policiesTabs.find(el => el.tagName === 'BUTTON' && el.className.includes('border-b-2'));
    if (tabButton) await user.click(tabButton);

    // Wait for policy list to load, then click the new policy button in sidebar
    await waitFor(() => {
      const policyBtns = screen.getAllByText('+ New Retention Policy');
      expect(policyBtns.length).toBeGreaterThanOrEqual(1);
    });
    const newPolicyBtns = screen.getAllByText('+ New Retention Policy');
    await user.click(newPolicyBtns[0]);
    expect(screen.getByText('+ New Policy')).toBeInTheDocument();

    // Both tabs should exist
    expect(screen.getByText('+ New Label')).toBeInTheDocument();
    expect(screen.getByText('+ New Policy')).toBeInTheDocument();
  });

  it('quick link for Policies switches section', async () => {
    const user = userEvent.setup();
    render(<RetentionPage />);

    // Click the Policies quick link in workspace
    const policiesLink = screen.getByText('Location scoping');
    await user.click(policiesLink.closest('button')!);

    // Policies tab should be active
    const policiesTabs = screen.getAllByText('Policies');
    const policiesTabBtn = policiesTabs.find(el => el.tagName === 'BUTTON' && el.className.includes('border-b-2'));
    expect(policiesTabBtn!.className).toContain('border-amber-400');
  });
});
