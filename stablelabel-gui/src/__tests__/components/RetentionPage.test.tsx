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
});
