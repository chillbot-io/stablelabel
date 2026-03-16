import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeploymentReadiness from '../../../renderer/components/Analysis/DeploymentReadiness';
import { mockInvoke } from '../../setup';

const readyResult = {
  Ready: true,
  Summary: 'All checks passed.',
  Checks: [
    { Name: 'Graph Connection', Status: 'Pass', Message: 'Connected to Graph API' },
    { Name: 'Compliance Connection', Status: 'Pass', Message: 'Connected to SCC' },
  ],
};

const notReadyResult = {
  Ready: false,
  Summary: 'Some checks failed.',
  Checks: [
    { Name: 'Graph Connection', Status: 'Pass', Message: 'Connected to Graph API' },
    { Name: 'Compliance Connection', Status: 'Fail', Message: 'Not connected' },
    { Name: 'License Check', Status: 'Warning', Message: 'E3 license detected, E5 recommended' },
  ],
};

describe('DeploymentReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<DeploymentReadiness />);
    expect(screen.getByText('Deployment Readiness')).toBeInTheDocument();
    expect(screen.getByText(/Pre-deployment checklist/)).toBeInTheDocument();
  });

  it('renders the run button', () => {
    render(<DeploymentReadiness />);
    expect(screen.getByText('Run Readiness Check')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));
    expect(screen.getByText('Running checks...')).toBeInTheDocument();
  });

  it('displays ready result', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: readyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Ready to deploy')).toBeInTheDocument();
    });
    expect(screen.getByText('All checks passed.')).toBeInTheDocument();
    expect(screen.getByText('Graph Connection')).toBeInTheDocument();
    expect(screen.getByText('Connected to Graph API')).toBeInTheDocument();
  });

  it('displays not-ready result', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: notReadyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Not ready')).toBeInTheDocument();
    });
    expect(screen.getByText('Some checks failed.')).toBeInTheDocument();
  });

  it('renders correct status badges (Pass, Fail, Warning)', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: notReadyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      // Two Pass badges, one Fail, one Warning
      expect(screen.getByText('Pass')).toBeInTheDocument();
      expect(screen.getByText('Fail')).toBeInTheDocument();
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  it('shows check with empty message', async () => {
    const user = userEvent.setup();
    const result = {
      Ready: true,
      Summary: '',
      Checks: [{ Name: 'Basic Check', Status: 'Pass', Message: '' }],
    };
    mockInvoke.mockResolvedValue({ success: true, data: result });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Basic Check')).toBeInTheDocument();
    });
  });

  it('shows error message on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Not connected' });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue('string err');
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('calls invoke with correct command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: readyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    expect(mockInvoke).toHaveBeenCalledWith('Test-SLDeploymentReadiness');
  });

  it('does not display result before running', () => {
    render(<DeploymentReadiness />);
    expect(screen.queryByText('Ready to deploy')).not.toBeInTheDocument();
    expect(screen.queryByText('Not ready')).not.toBeInTheDocument();
  });

  it('clears previous result on new run', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: true, data: readyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));
    await waitFor(() => {
      expect(screen.getByText('Ready to deploy')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Oops' });
    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('Oops')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ready to deploy')).not.toBeInTheDocument();
  });

  it('shows ready icon (checkmark) when ready', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: readyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('\u2714')).toBeInTheDocument();
    });
  });

  it('shows not-ready icon (cross) when not ready', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: notReadyResult });
    render(<DeploymentReadiness />);

    await user.click(screen.getByText('Run Readiness Check'));

    await waitFor(() => {
      expect(screen.getByText('\u2716')).toBeInTheDocument();
    });
  });
});
