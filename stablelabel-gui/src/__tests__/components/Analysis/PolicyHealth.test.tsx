import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyHealth from '../../../renderer/components/Analysis/PolicyHealth';
import { mockInvoke } from '../../setup';

const mockPolicies = [
  { Name: 'Label Policy A', Type: 'Label', Status: 'Active', Mode: 'Enforce', DistributionStatus: 'Distributed', HasRules: true, LastModified: '2024-01-10', HealthStatus: 'Healthy' },
  { Name: 'DLP Policy B', Type: 'DLP', Status: 'Active', Mode: 'TestWithNotifications', DistributionStatus: 'Pending', HasRules: true, LastModified: '2024-01-12', HealthStatus: 'Warning' },
  { Name: 'Retention Policy C', Type: 'Retention', Status: 'Disabled', Mode: 'None', DistributionStatus: 'Failed', HasRules: false, LastModified: '2024-01-08', HealthStatus: 'Error' },
];

describe('PolicyHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<PolicyHealth />);
    expect(screen.getByText('Policy Health')).toBeInTheDocument();
    expect(screen.getByText(/Health status of label, DLP, and retention policies/)).toBeInTheDocument();
  });

  it('renders policy type selector', () => {
    render(<PolicyHealth />);
    expect(screen.getByText('Policy Type')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All')).toBeInTheDocument();
  });

  it('renders Check Health button', () => {
    render(<PolicyHealth />);
    expect(screen.getByText('Check Health')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('calls invoke with correct command and default policy type', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLPolicyHealth', { PolicyType: 'All' });
  });

  it('calls invoke with selected policy type', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyHealth />);

    const select = screen.getByDisplayValue('All');
    await user.selectOptions(select, 'DLP');
    await user.click(screen.getByText('Check Health'));

    expect(mockInvoke).toHaveBeenCalledWith('Get-SLPolicyHealth', { PolicyType: 'DLP' });
  });

  it('displays summary counts', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      // 'Healthy' appears both as summary card label and status badge
      expect(screen.getAllByText('Healthy').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays per-policy details', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText('Label Policy A')).toBeInTheDocument();
    });
    expect(screen.getByText('DLP Policy B')).toBeInTheDocument();
    expect(screen.getByText('Retention Policy C')).toBeInTheDocument();
  });

  it('displays policy type badges', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      // 'Label' and 'Retention' appear in both dropdown and badges
      expect(screen.getAllByText('Label').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText('Retention').length).toBeGreaterThanOrEqual(2);
  });

  it('displays policy metadata (Mode, Rules, Dist, Modified)', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText(/Mode: Enforce/)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Rules:/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Dist:/).length).toBeGreaterThanOrEqual(2);
  });

  it('handles single non-array data response', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicies[0] });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText('Label Policy A')).toBeInTheDocument();
    });
  });

  it('handles null data response', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    // Should show empty results with all zeros
    await waitFor(() => {
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBe(3);
    });
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Timeout' });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Err'));
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText('Err')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(undefined);
    render(<PolicyHealth />);

    await user.click(screen.getByText('Check Health'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('does not display results before running', () => {
    render(<PolicyHealth />);
    expect(screen.queryByText('Label Policy A')).not.toBeInTheDocument();
  });
});
