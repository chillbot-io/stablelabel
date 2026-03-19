import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PimRolePanel from '../../../renderer/components/Elevation/PimRolePanel';
import { mockInvoke } from '../../setup';

describe('PimRolePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with all fields and role hints', () => {
    render(<PimRolePanel />);
    expect(screen.getByText('PIM Role Activation')).toBeInTheDocument();
    expect(screen.getByText(/Activate an eligible Entra ID role/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('GUID of the role to activate...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reason for activating this role...')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
    expect(screen.getByText('Common Role IDs')).toBeInTheDocument();
    expect(screen.getByText('Global Administrator')).toBeInTheDocument();
    expect(screen.getByText('Security Administrator')).toBeInTheDocument();
    expect(screen.getByText('Compliance Administrator')).toBeInTheDocument();
    expect(screen.getByText('Exchange Administrator')).toBeInTheDocument();
    expect(screen.getByText('SharePoint Administrator')).toBeInTheDocument();
  });

  it('shows button as "Activate Role" when dry run is off (default)', () => {
    render(<PimRolePanel />);
    expect(screen.getByText('Activate Role')).toBeInTheDocument();
  });

  it('shows button as "Dry Run — Activate Role" when dry run is on', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    expect(screen.getByText('Dry Run — Activate Role')).toBeInTheDocument();
  });

  it('has duration defaulting to 8', () => {
    render(<PimRolePanel />);
    const durationInput = screen.getByDisplayValue('8') as HTMLInputElement;
    expect(durationInput).toBeInTheDocument();
    expect(durationInput.type).toBe('number');
  });

  // --- Validation ---
  it('validates role ID is required', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);
    await user.click(screen.getByText('Activate Role'));
    expect(screen.getByText('Role Definition ID is required.')).toBeInTheDocument();
  });

  it('validates justification is required', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);
    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'some-guid');
    await user.click(screen.getByText('Activate Role'));
    expect(screen.getByText('Justification is required.')).toBeInTheDocument();
  });

  // --- Role hint selection ---
  it('clicking a role hint sets the role ID', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);

    // Click the Global Administrator role ID
    await user.click(screen.getByText('62e90394-69f5-4237-9190-012177145e10'));

    const roleInput = screen.getByPlaceholderText('GUID of the role to activate...') as HTMLInputElement;
    expect(roleInput.value).toBe('62e90394-69f5-4237-9190-012177145e10');
  });

  it('clicking SharePoint Administrator role hint sets the role ID', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);

    await user.click(screen.getByText('f28a1f50-f6e7-4571-818b-6a12f2af6b6c'));

    const roleInput = screen.getByPlaceholderText('GUID of the role to activate...') as HTMLInputElement;
    expect(roleInput.value).toBe('f28a1f50-f6e7-4571-818b-6a12f2af6b6c');
  });

  // --- Activate with dry run ---
  it('activate with dry run executes directly without confirmation', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid-123');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'Investigation');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);

    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Request-SLPimRole', expect.objectContaining({
        RoleDefinitionId: 'role-guid-123',
        Justification: 'Investigation',
        DurationHours: 8,
        DryRun: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would activate role for 8h.')).toBeInTheDocument();
    });
  });

  // --- Activate without dry run (live) ---
  it('activate without dry run shows confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid-123');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'Investigation');

    await user.click(screen.getByText('Activate Role'));

    await waitFor(() => {
      expect(screen.getByText('Activate PIM Role')).toBeInTheDocument();
      expect(screen.getByText(/Activate role "role-guid-123" for 8 hours\?/)).toBeInTheDocument();
    });
    expect(screen.getByText('Activate')).toBeInTheDocument();
  });

  it('activate confirmed executes command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid-123');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'Investigation');

    await user.click(screen.getByText('Activate Role'));
    await waitFor(() => {
      expect(screen.getByText('Activate')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Activate'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Request-SLPimRole', expect.objectContaining({
        RoleDefinitionId: 'role-guid-123',
        Justification: 'Investigation',
        DurationHours: 8,
      }));
      const callArgs = mockInvoke.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('DryRun');
    });
    await waitFor(() => {
      expect(screen.getByText('PIM role activated for 8 hours.')).toBeInTheDocument();
    });
  });

  // --- Custom duration ---
  it('uses custom duration value', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    // Clear and type new duration
    const durationInput = screen.getByDisplayValue('8');
    await user.clear(durationInput);
    await user.type(durationInput, '4');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Request-SLPimRole', expect.objectContaining({
        DurationHours: 4,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText('Dry run: would activate role for 4h.')).toBeInTheDocument();
    });
  });

  // --- Cancel confirmation ---
  it('cancels confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    await user.click(screen.getByText('Activate Role'));
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Activate PIM Role')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // --- Error handling ---
  it('shows error when invoke returns failure with message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Role not eligible' });
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(screen.getByText('Role not eligible')).toBeInTheDocument();
    });
  });

  it('shows fallback error when invoke fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when invoke throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows generic error when invoke throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(undefined);
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  // --- Special characters (structured API passes raw values) ---
  it('passes special characters in role ID and justification as raw values', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), "role'id");
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), "it's needed");

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Request-SLPimRole', expect.objectContaining({
        RoleDefinitionId: "role'id",
        Justification: "it's needed",
      }));
    });
  });

  // --- Loading ---
  it('shows loading state and disables button', async () => {
    const user = userEvent.setup();
    let resolveInvoke: (value: any) => void;
    mockInvoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));
    render(<PimRolePanel />);

    await user.type(screen.getByPlaceholderText('GUID of the role to activate...'), 'role-guid');
    await user.type(screen.getByPlaceholderText('Reason for activating this role...'), 'test');

    const dryRunSwitch = screen.getByRole('switch');
    await user.click(dryRunSwitch);
    await user.click(screen.getByText('Dry Run — Activate Role'));

    expect(screen.getByText('Activating...')).toBeInTheDocument();
    expect(screen.getByText('Activating...')).toBeDisabled();

    resolveInvoke!({ success: true, data: null });
    await waitFor(() => {
      expect(screen.queryByText('Activating...')).not.toBeInTheDocument();
    });
  });

  // --- All role hints are clickable ---
  it('all five role hints are rendered and clickable', async () => {
    const user = userEvent.setup();
    render(<PimRolePanel />);

    const roleIds = [
      '62e90394-69f5-4237-9190-012177145e10',
      '194ae4cb-b126-40b2-bd5b-6091b380977d',
      '17315797-102d-40b4-93e0-432062caca18',
      '29232cdf-9323-42fd-ade2-1d097af3e4de',
      'f28a1f50-f6e7-4571-818b-6a12f2af6b6c',
    ];

    for (const id of roleIds) {
      const btn = screen.getByText(id);
      expect(btn).toBeInTheDocument();
      expect(btn.tagName).toBe('BUTTON');
    }

    // Click the last one to verify it updates input
    await user.click(screen.getByText(roleIds[4]));
    const roleInput = screen.getByPlaceholderText('GUID of the role to activate...') as HTMLInputElement;
    expect(roleInput.value).toBe(roleIds[4]);
  });
});
