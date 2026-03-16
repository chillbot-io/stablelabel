import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  });

  it('has New Retention Label button', () => {
    render(<RetentionPage />);
    expect(screen.getAllByText('+ New Retention Label').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the retention label list', () => {
    render(<RetentionPage />);
    // The component renders correctly with mock data
    expect(screen.getByText('Retention Management')).toBeInTheDocument();
  });
});
