import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    // Multiple elements may match "Policies", "Rules", "Info Types"
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
});
