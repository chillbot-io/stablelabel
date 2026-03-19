import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteAdminPanel from '../../../renderer/components/Elevation/SiteAdminPanel';
import { mockInvoke } from '../../setup';

describe('SiteAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with all fields and buttons', () => {
    render(<SiteAdminPanel />);
    expect(screen.getByText('Site Collection Administrator')).toBeInTheDocument();
    expect(screen.getByText(/Grant or revoke temporary site collection admin/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByText('Grant Admin')).toBeInTheDocument();
    expect(screen.getByText('Revoke Admin')).toBeInTheDocument();
  });

  // --- Validation ---
  it('validates site URL is required', async () => {
    const user = userEvent.setup();
    render(<SiteAdminPanel />);
    await user.click(screen.getByText('Grant Admin'));
    expect(screen.getByText('Site URL is required.')).toBeInTheDocument();
  });

  it('validates UPN is required when site URL is filled', async () => {
    const user = userEvent.setup();
    render(<SiteAdminPanel />);
    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.click(screen.getByText('Grant Admin'));
    expect(screen.getByText('User Principal Name is required.')).toBeInTheDocument();
  });

  it('validates on revoke as well', async () => {
    const user = userEvent.setup();
    render(<SiteAdminPanel />);
    await user.click(screen.getByText('Revoke Admin'));
    expect(screen.getByText('Site URL is required.')).toBeInTheDocument();
  });

  // --- Grant with dry run ---
  it('grant with dry run executes directly without confirmation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLSiteAdmin', expect.objectContaining({
        SiteUrl: 'https://site.com',
        UserPrincipalName: 'user@contoso.com',
        DryRun: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would grant site admin.')).toBeInTheDocument();
    });
  });

  // --- Revoke with dry run ---
  it('revoke with dry run executes directly', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Revoke Admin'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Revoke-SLSiteAdmin', expect.objectContaining({
        SiteUrl: 'https://site.com',
        UserPrincipalName: 'user@contoso.com',
        DryRun: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would revoke site admin.')).toBeInTheDocument();
    });
  });

  // --- Grant without dry run (live) ---
  it('grant without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(screen.getByText('Grant Site Admin')).toBeInTheDocument();
      expect(screen.getByText(/Grant site collection admin rights to "user@contoso.com" on "https:\/\/site.com"\?/)).toBeInTheDocument();
    });
    expect(screen.getByText('Grant')).toBeInTheDocument();
  });

  it('grant confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');
    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(screen.getByText('Grant')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Grant'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLSiteAdmin', expect.objectContaining({
        SiteUrl: 'https://site.com',
        UserPrincipalName: 'user@contoso.com',
      }));
      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].DryRun).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.getByText('Site admin granted.')).toBeInTheDocument();
    });
  });

  // --- Revoke without dry run (live) ---
  it('revoke without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');
    await user.click(screen.getByText('Revoke Admin'));

    await waitFor(() => {
      expect(screen.getByText('Revoke Site Admin')).toBeInTheDocument();
      expect(screen.getByText(/Revoke site collection admin rights from "user@contoso.com" on "https:\/\/site.com"\?/)).toBeInTheDocument();
    });
  });

  it('revoke confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');
    await user.click(screen.getByText('Revoke Admin'));

    await waitFor(() => {
      expect(screen.getByText('Revoke')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Revoke-SLSiteAdmin', expect.objectContaining({
        SiteUrl: 'https://site.com',
        UserPrincipalName: 'user@contoso.com',
      }));
      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1].DryRun).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.getByText('Site admin revoked.')).toBeInTheDocument();
    });
  });

  // --- Cancel confirmation ---
  it('cancels grant confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');
    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Grant Site Admin')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // --- Error handling ---
  it('shows error when invoke returns failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Forbidden' });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when invoke throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Timeout'));
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows generic error when invoke throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue('oops');
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Revoke Admin'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  // --- Special characters (structured API passes raw values) ---
  it('passes special characters in site URL and UPN as raw values', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), "https://site.com/o'site");
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), "o'brien@contoso.com");

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Admin'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Grant-SLSiteAdmin', expect.objectContaining({
        SiteUrl: "https://site.com/o'site",
        UserPrincipalName: "o'brien@contoso.com",
      }));
    });
  });

  // --- Loading ---
  it('disables buttons during loading', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<SiteAdminPanel />);

    await user.type(screen.getByPlaceholderText('https://contoso.sharepoint.com/sites/hr'), 'https://site.com');
    await user.type(screen.getByPlaceholderText('admin@contoso.com'), 'user@contoso.com');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Grant Admin'));

    expect(screen.getByText('Grant Admin')).toBeDisabled();
    expect(screen.getByText('Revoke Admin')).toBeDisabled();
  });
});
