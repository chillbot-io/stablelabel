import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyConflicts from '../../../renderer/components/Analysis/PolicyConflicts';
import { mockInvoke } from '../../setup';

const noConflictsResult = {
  PoliciesChecked: 5,
  HasConflicts: false,
  Conflicts: [],
};

const conflictsResult = {
  PoliciesChecked: 8,
  HasConflicts: true,
  Conflicts: [
    { PolicyA: 'Policy Alpha', PolicyB: 'Policy Beta', ConflictType: 'Overlapping Scope', Detail: 'Both policies target the same Exchange locations' },
    { PolicyA: 'Policy Gamma', PolicyB: 'Policy Delta', ConflictType: 'Contradictory Rules', Detail: 'Conflicting block/allow rules' },
  ],
};

describe('PolicyConflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<PolicyConflicts />);
    expect(screen.getByText('Policy Conflict Detection')).toBeInTheDocument();
    expect(screen.getByText(/Find overlapping scopes and contradictory rules/)).toBeInTheDocument();
  });

  it('renders policy type selector', () => {
    render(<PolicyConflicts />);
    expect(screen.getByText('Policy Type')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All')).toBeInTheDocument();
  });

  it('renders Detect Conflicts button', () => {
    render(<PolicyConflicts />);
    expect(screen.getByText('Detect Conflicts')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('calls invoke with correct command and default type', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: noConflictsResult });
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));
    expect(mockInvoke).toHaveBeenCalledWith('Test-SLPolicyConflict', { PolicyType: 'All' });
  });

  it('calls invoke with selected policy type', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: noConflictsResult });
    render(<PolicyConflicts />);

    const select = screen.getByDisplayValue('All');
    await user.selectOptions(select, 'Label');
    await user.click(screen.getByText('Detect Conflicts'));

    expect(mockInvoke).toHaveBeenCalledWith('Test-SLPolicyConflict', { PolicyType: 'Label' });
  });

  it('shows no conflicts message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: noConflictsResult });
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      expect(screen.getByText('No policy conflicts detected.')).toBeInTheDocument();
    });
    expect(screen.getByText('5 policies checked')).toBeInTheDocument();
  });

  it('displays conflicts with details', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: conflictsResult });
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      expect(screen.getByText('8 policies checked')).toBeInTheDocument();
    });
    expect(screen.getByText('Overlapping Scope')).toBeInTheDocument();
    expect(screen.getByText('Both policies target the same Exchange locations')).toBeInTheDocument();
    expect(screen.getByText('Policy Alpha')).toBeInTheDocument();
    expect(screen.getByText('Policy Beta')).toBeInTheDocument();
    expect(screen.getByText('Contradictory Rules')).toBeInTheDocument();
    expect(screen.getByText('Policy Gamma')).toBeInTheDocument();
    expect(screen.getByText('Policy Delta')).toBeInTheDocument();
  });

  it('shows "vs" between conflicting policies', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: conflictsResult });
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      const vsElements = screen.getAllByText('vs');
      expect(vsElements.length).toBe(2);
    });
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Permission denied' });
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Timeout'));
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(null);
    render(<PolicyConflicts />);

    await user.click(screen.getByText('Detect Conflicts'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('does not display results before running', () => {
    render(<PolicyConflicts />);
    expect(screen.queryByText('policies checked')).not.toBeInTheDocument();
  });

  it('can select all policy type options', async () => {
    const user = userEvent.setup();
    render(<PolicyConflicts />);

    const select = screen.getByDisplayValue('All');
    for (const opt of ['Label', 'DLP', 'Retention', 'All']) {
      await user.selectOptions(select, opt);
      expect(select).toHaveValue(opt);
    }
  });
});
