import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalysisPage from '../../renderer/components/Analysis/AnalysisPage';
import { mockInvoke } from '../setup';

describe('AnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', () => {
    render(<AnalysisPage />);
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<AnalysisPage />);
    expect(screen.getByText('Label reports and diagnostics')).toBeInTheDocument();
  });

  it('renders remaining section options', () => {
    render(<AnalysisPage />);
    expect(screen.getByText('Mismatches')).toBeInTheDocument();
    expect(screen.getByText('Label Report')).toBeInTheDocument();
  });

  it('shows help text about read-only checks', () => {
    render(<AnalysisPage />);
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
  });

  it('switches between sections', async () => {
    const user = userEvent.setup();
    render(<AnalysisPage />);

    // Start at Mismatches (default)
    expect(screen.getByText('Graph vs policy labels')).toBeInTheDocument();

    // Navigate to Label Report
    await user.click(screen.getByText('Label Report'));
    expect(screen.getByText('Full label summary')).toBeInTheDocument();

    // Navigate back to Mismatches
    await user.click(screen.getByText('Mismatches'));
    expect(screen.getByText('Graph vs policy labels')).toBeInTheDocument();
  });
});
