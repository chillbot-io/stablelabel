import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalysisPage from '../../renderer/components/Analysis/AnalysisPage';
import { mockInvoke } from '../setup';

describe('AnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  it('renders the page title', () => {
    render(<AnalysisPage />);
    expect(screen.getByText('Analysis')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<AnalysisPage />);
    expect(screen.getByText('Checks, reports, and diagnostics')).toBeInTheDocument();
  });

  it('renders all section options', () => {
    render(<AnalysisPage />);
    expect(screen.getByText('Readiness')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Policy Health')).toBeInTheDocument();
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
    expect(screen.getByText('DLP Alignment')).toBeInTheDocument();
    expect(screen.getByText('Mismatches')).toBeInTheDocument();
    expect(screen.getByText('Label Report')).toBeInTheDocument();
  });

  it('shows help text about read-only checks', () => {
    render(<AnalysisPage />);
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
  });

  it('switches to Permissions section', async () => {
    const user = userEvent.setup();
    render(<AnalysisPage />);

    await user.click(screen.getByText('Permissions'));
    expect(screen.getByText('Permissions')).toBeInTheDocument();
  });

  it('switches to Conflicts section', async () => {
    const user = userEvent.setup();
    render(<AnalysisPage />);

    await user.click(screen.getByText('Conflicts'));
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
  });
});
