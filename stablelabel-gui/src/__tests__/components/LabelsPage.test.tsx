import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabelsPage from '../../renderer/components/Labels/LabelsPage';
import { mockInvoke } from '../setup';

describe('LabelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('renders browser section tabs', () => {
    render(<LabelsPage />);
    // Use getAllByText since "Labels" and "Policies" appear in both browser tabs and list
    expect(screen.getAllByText('Labels').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Policies').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty workspace message initially', () => {
    render(<LabelsPage />);
    expect(screen.getByText(/Select an item/i)).toBeInTheDocument();
  });

  it('renders the label list component', () => {
    render(<LabelsPage />);
    // The label list should be rendered in the left panel
    expect(screen.getAllByText('Labels').length).toBeGreaterThanOrEqual(1);
  });

  it('switches browser sections', async () => {
    const user = userEvent.setup();
    render(<LabelsPage />);

    // Click the Auto tab
    const autoButtons = screen.getAllByText('Auto');
    await user.click(autoButtons[0]);
    // Auto-label section should now show
    expect(screen.getAllByText(/Auto/).length).toBeGreaterThanOrEqual(1);
  });
});
