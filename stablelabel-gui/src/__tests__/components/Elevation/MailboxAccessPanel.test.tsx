import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MailboxAccessPanel from '../../../renderer/components/Elevation/MailboxAccessPanel';
import { mockInvoke } from '../../setup';

describe('MailboxAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with all fields and buttons', () => {
    render(<MailboxAccessPanel />);
    expect(screen.getByText('Mailbox Access')).toBeInTheDocument();
    expect(screen.getByText(/Grant or revoke Exchange mailbox permissions/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('user@contoso.com or alias')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('Access Rights')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByText('Grant Access')).toBeInTheDocument();
    expect(screen.getByText('Revoke Access')).toBeInTheDocument();
  });

  it('defaults access rights to FullAccess', () => {
    render(<MailboxAccessPanel />);
    const select = screen.getByDisplayValue('Full Access') as HTMLSelectElement;
    expect(select.value).toBe('FullAccess');
  });

  it('can change access rights to ReadPermission', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);
    const select = screen.getByDisplayValue('Full Access');
    await user.selectOptions(select, 'ReadPermission');
    expect((select as HTMLSelectElement).value).toBe('ReadPermission');
  });

  // --- Validation ---
  it('validates identity is required', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);
    await user.click(screen.getByText('Grant Access'));
    expect(screen.getByText('Mailbox identity is required.')).toBeInTheDocument();
  });

  it('validates user is required when identity is filled', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);
    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.click(screen.getByText('Grant Access'));
    expect(screen.getByText('User is required.')).toBeInTheDocument();
  });

  it('validates on revoke too', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);
    await user.click(screen.getByText('Revoke Access'));
    expect(screen.getByText('Mailbox identity is required.')).toBeInTheDocument();
  });

  // --- Grant with dry run ---
  it('grant with dry run executes directly without confirmation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLMailboxAccess', expect.objectContaining({
        Identity: 'mailbox@contoso.com',
        User: 'admin@contoso.com',
        AccessRights: 'FullAccess',
        DryRun: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would grant mailbox access.')).toBeInTheDocument();
    });
  });

  // --- Revoke with dry run ---
  it('revoke with dry run executes directly', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Revoke Access'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Revoke-SLMailboxAccess', expect.objectContaining({
        Identity: 'mailbox@contoso.com',
        User: 'admin@contoso.com',
        AccessRights: 'FullAccess',
        DryRun: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would revoke mailbox access.')).toBeInTheDocument();
    });
  });

  // --- Grant with ReadPermission ---
  it('grant with ReadPermission access rights', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');
    await user.selectOptions(screen.getByDisplayValue('Full Access'), 'ReadPermission');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLMailboxAccess', expect.objectContaining({
        AccessRights: 'ReadPermission',
      }));
    });
  });

  // --- Grant without dry run (live) ---
  it('grant without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(screen.getByText('Grant Mailbox Access')).toBeInTheDocument();
      expect(screen.getByText(/Grant FullAccess to "admin@contoso.com" on mailbox "mailbox@contoso.com"\?/)).toBeInTheDocument();
    });
    expect(screen.getByText('Grant')).toBeInTheDocument();
  });

  it('grant confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(screen.getByText('Grant')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Grant'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLMailboxAccess', expect.objectContaining({
        Identity: 'mailbox@contoso.com',
        User: 'admin@contoso.com',
        AccessRights: 'FullAccess',
      }));
      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].DryRun).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.getByText('Mailbox access granted.')).toBeInTheDocument();
    });
  });

  // --- Revoke without dry run (live) ---
  it('revoke without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');
    await user.click(screen.getByText('Revoke Access'));

    await waitFor(() => {
      expect(screen.getByText('Revoke Mailbox Access')).toBeInTheDocument();
      expect(screen.getByText(/Revoke FullAccess from "admin@contoso.com" on mailbox "mailbox@contoso.com"\?/)).toBeInTheDocument();
    });
  });

  it('revoke confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');
    await user.click(screen.getByText('Revoke Access'));

    await waitFor(() => {
      expect(screen.getByText('Revoke')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Revoke-SLMailboxAccess', expect.objectContaining({
        Identity: 'mailbox@contoso.com',
        User: 'admin@contoso.com',
        AccessRights: 'FullAccess',
      }));
      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].DryRun).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.getByText('Mailbox access revoked.')).toBeInTheDocument();
    });
  });

  // --- Cancel confirmation ---
  it('cancels grant confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Grant Mailbox Access')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('cancels revoke confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');
    await user.click(screen.getByText('Revoke Access'));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Revoke Mailbox Access')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // --- Error handling ---
  it('shows error when invoke returns failure with message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Mailbox not found' });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(screen.getByText('Mailbox not found')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when invoke throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Service unavailable'));
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('shows generic error when invoke throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(null);
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Revoke Access'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  // --- Special characters (structured API passes raw values) ---
  it('passes special characters in identity and user as raw values', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), "o'malley@contoso.com");
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), "o'brien@contoso.com");

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Access'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLMailboxAccess', expect.objectContaining({
        Identity: "o'malley@contoso.com",
        User: "o'brien@contoso.com",
      }));
    });
  });

  // --- Loading ---
  it('disables buttons during loading', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<MailboxAccessPanel />);

    await user.type(screen.getByPlaceholderText('user@contoso.com or alias'), 'mailbox@contoso.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'admin@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Access'));

    expect(screen.getByText('Grant Access')).toBeDisabled();
    expect(screen.getByText('Revoke Access')).toBeDisabled();
  });
});
