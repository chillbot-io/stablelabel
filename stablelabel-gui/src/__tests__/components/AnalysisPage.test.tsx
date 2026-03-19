import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('switches to Permissions section and shows Run Check button', async () => {
    const user = userEvent.setup();
    render(<AnalysisPage />);

    await user.click(screen.getByText('Permissions'));
    expect(screen.getByText('Permission Check')).toBeInTheDocument();
    // The Run Check button should be available to invoke Test-SLPermission
    const runBtn = screen.getByText('Run Check');
    expect(runBtn).toBeInTheDocument();
  });

  it('invokes Test-SLPermission when Run Check is clicked in Permissions section', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        UserPrincipalName: 'admin@contoso.com',
        ScopesChecked: ['All'],
        GroupMemberships: [],
        Results: [{ Scope: 'Labels', HasAccess: true, Details: 'OK' }],
      },
    });
    render(<AnalysisPage />);

    await user.click(screen.getByText('Permissions'));
    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Test-SLPermission', { Scope: 'All' });
    });
  });

  it('switches to Conflicts section', async () => {
    const user = userEvent.setup();
    render(<AnalysisPage />);

    await user.click(screen.getByText('Conflicts'));
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
  });

  it('navigates between sections and back', async () => {
    const user = userEvent.setup();
    render(<AnalysisPage />);

    // Start at Readiness (default)
    expect(screen.getByText('Pre-deployment checklist')).toBeInTheDocument();

    // Navigate to Permissions
    await user.click(screen.getByText('Permissions'));
    expect(screen.getByText('Permission Check')).toBeInTheDocument();

    // Navigate back to Readiness
    await user.click(screen.getByText('Readiness'));
    expect(screen.getByText('Pre-deployment checklist')).toBeInTheDocument();
  });
});
