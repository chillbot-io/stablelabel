import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PermissionCheck from '../../../renderer/components/Analysis/PermissionCheck';
import { mockInvoke } from '../../setup';

const mockResult = {
  UserPrincipalName: 'admin@contoso.com',
  ScopesChecked: ['Labels', 'DLP'],
  GroupMemberships: ['Compliance Admin'],
  Results: [
    { Scope: 'Labels', HasAccess: true, Details: 'Full access to label management' },
    { Scope: 'DLP', HasAccess: false, Details: 'Missing DLP role assignment' },
  ],
};

describe('PermissionCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<PermissionCheck />);
    expect(screen.getByText('Permission Check')).toBeInTheDocument();
    expect(screen.getByText(/Verify the current user has required permissions/)).toBeInTheDocument();
  });

  it('renders scope selector with all options', () => {
    render(<PermissionCheck />);
    expect(screen.getByDisplayValue('All')).toBeInTheDocument();
  });

  it('renders Run Check button', () => {
    render(<PermissionCheck />);
    expect(screen.getByText('Run Check')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('calls invoke with correct command and default scope', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockResult });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));
    expect(mockInvoke).toHaveBeenCalledWith('Test-SLPermission', { Scope: 'All' });
  });

  it('calls invoke with selected scope', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockResult });
    render(<PermissionCheck />);

    const select = screen.getByDisplayValue('All');
    await user.selectOptions(select, 'DLP');
    await user.click(screen.getByText('Run Check'));

    expect(mockInvoke).toHaveBeenCalledWith('Test-SLPermission', { Scope: 'DLP' });
  });

  it('displays user principal name', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockResult });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    });
  });

  it('displays permission results with Pass/Fail badges', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockResult });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Full access to label management')).toBeInTheDocument();
    });
    expect(screen.getByText('Missing DLP role assignment')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });

  it('does not show UPN when empty', async () => {
    const user = userEvent.setup();
    const resultNoUPN = { ...mockResult, UserPrincipalName: '' };
    mockInvoke.mockResolvedValue({ success: true, data: resultNoUPN });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Pass')).toBeInTheDocument();
    });
    expect(screen.queryByText(/^User:/)).not.toBeInTheDocument();
  });

  it('shows check with empty details', async () => {
    const user = userEvent.setup();
    const resultNoDetails = {
      ...mockResult,
      Results: [{ Scope: 'Labels', HasAccess: true, Details: '' }],
    };
    mockInvoke.mockResolvedValue({ success: true, data: resultNoDetails });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Pass')).toBeInTheDocument();
    });
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Auth expired' });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Auth expired')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Connection lost'));
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Connection lost')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(123);
    render(<PermissionCheck />);

    await user.click(screen.getByText('Run Check'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('does not display results before running', () => {
    render(<PermissionCheck />);
    expect(screen.queryByText('admin@contoso.com')).not.toBeInTheDocument();
  });

  it('can select all scope options', async () => {
    const user = userEvent.setup();
    render(<PermissionCheck />);

    const select = screen.getByDisplayValue('All');
    for (const opt of ['Labels', 'DLP', 'Retention', 'Protection', 'All']) {
      await user.selectOptions(select, opt);
      expect(select).toHaveValue(opt);
    }
  });
});
