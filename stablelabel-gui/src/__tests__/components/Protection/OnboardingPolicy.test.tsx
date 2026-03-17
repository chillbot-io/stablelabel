import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPolicy from '../../../renderer/components/Protection/OnboardingPolicy';
import { mockInvoke } from '../../setup';

const mockPolicy = {
  UseRmsUserLicense: true,
  SecurityGroupObjectId: 'group-guid-abc123',
  Scope: 'SecurityGroup',
};

const mockPolicyAll = {
  UseRmsUserLicense: false,
  SecurityGroupObjectId: null,
  Scope: 'All',
};

describe('OnboardingPolicy', () => {
  beforeEach(() => {
    mockInvoke.mockReset().mockResolvedValue({ success: true, data: null });
  });

  it('shows loading skeleton on initial render', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<OnboardingPolicy />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(2);
  });

  it('shows error when fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Access denied' });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  it('shows fallback error when fetch fails without error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load onboarding policy')).toBeInTheDocument();
    });
  });

  it('renders heading and description after load', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicyAll });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });
    expect(screen.getByText(/Control which users can use Azure Information Protection/)).toBeInTheDocument();
  });

  it('populates form fields from loaded data', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    // Toggle should be checked
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Scope should be SecurityGroup
    const scopeSelect = screen.getByDisplayValue('Security Group Only');
    expect(scopeSelect).toBeInTheDocument();

    // Security Group ID field should be visible
    expect(screen.getByDisplayValue('group-guid-abc123')).toBeInTheDocument();
  });

  it('populates form with All scope and defaults', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicyAll });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    const scopeSelect = screen.getByDisplayValue('All Users');
    expect(scopeSelect).toBeInTheDocument();

    // Security Group ID should NOT be visible
    expect(screen.queryByText('Security Group Object ID')).not.toBeInTheDocument();
  });

  it('handles null values in policy data gracefully', async () => {
    const nullPolicy = {
      UseRmsUserLicense: null,
      SecurityGroupObjectId: null,
      Scope: null,
    };
    mockInvoke.mockResolvedValue({ success: true, data: nullPolicy });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    // UseRmsUserLicense defaults to false when null
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Scope defaults to 'All' when null
    const scopeSelect = screen.getByDisplayValue('All Users');
    expect(scopeSelect).toBeInTheDocument();
  });

  it('shows Security Group ID field when scope is SecurityGroup', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicyAll });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    // Initially no security group field
    expect(screen.queryByText('Security Group Object ID')).not.toBeInTheDocument();

    // Change scope
    const scopeSelect = screen.getByDisplayValue('All Users');
    await user.selectOptions(scopeSelect, 'SecurityGroup');

    // Now the security group field should appear
    expect(screen.getByText('Security Group Object ID')).toBeInTheDocument();
  });

  it('hides Security Group ID field when scope changes to All', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Security Group Object ID')).toBeInTheDocument();
    });

    const scopeSelect = screen.getByDisplayValue('Security Group Only');
    await user.selectOptions(scopeSelect, 'All');

    expect(screen.queryByText('Security Group Object ID')).not.toBeInTheDocument();
  });

  it('toggles RMS User License switch', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicyAll });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('saves with All scope and correct PowerShell command', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLOnboardingPolicy', expect.objectContaining({ UseRmsUserLicense: false, Scope: 'All' }));
    });
    expect(screen.getByText('Onboarding policy updated.')).toBeInTheDocument();
  });

  it('saves with SecurityGroup scope including group ID', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicy })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLOnboardingPolicy', expect.objectContaining({ UseRmsUserLicense: true, Scope: 'SecurityGroup', SecurityGroupObjectId: 'group-guid-abc123' }));
    });
    expect(screen.getByText('Onboarding policy updated.')).toBeInTheDocument();
  });

  it('does not include SecurityGroupObjectId when scope is SecurityGroup but ID is empty', async () => {
    const user = userEvent.setup();
    const policyNoId = { ...mockPolicy, SecurityGroupObjectId: '' };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: policyNoId })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLOnboardingPolicy', expect.objectContaining({ UseRmsUserLicense: true, Scope: 'SecurityGroup' }));
      expect(mockInvoke.mock.calls.find(c => c[0] === 'Set-SLOnboardingPolicy')![1]).not.toHaveProperty('SecurityGroupObjectId');
    });
  });

  it('passes special characters as raw values in SecurityGroupObjectId', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockResolvedValueOnce({ success: true, data: null })
      .mockResolvedValueOnce({ success: true, data: null }); // possible refresh
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    // Switch to SecurityGroup scope
    const scopeSelect = screen.getByDisplayValue('All Users');
    await user.selectOptions(scopeSelect, 'SecurityGroup');

    // Type a group ID with a quote
    const groupInput = screen.getByPlaceholderText('GUID of the security group...');
    await user.type(groupInput, "test'id");

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Set-SLOnboardingPolicy', expect.objectContaining({ SecurityGroupObjectId: "test'id" }));
    });
  });

  it('shows error when save fails with error message', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockResolvedValueOnce({ success: false, data: null, error: 'Forbidden' });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });
  });

  it('shows fallback error when save fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockResolvedValueOnce({ success: false, data: null });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when save throws Error', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockRejectedValueOnce(new Error('Timeout'));
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows generic error when save throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockRejectedValueOnce('oops');
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      const errorDivs = document.querySelectorAll('.text-red-300');
      expect(errorDivs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Saving... while save is in progress', async () => {
    const user = userEvent.setup();
    let resolveInvoke: (v: any) => void;
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockPolicyAll })
      .mockImplementationOnce(() => new Promise(r => { resolveInvoke = r; }));
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Changes'));
    expect(screen.getByText('Saving...')).toBeInTheDocument();

    resolveInvoke!({ success: true, data: null });
    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  it('toggles raw JSON display', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicyAll });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });

    const showBtn = screen.getByText(/Show.*raw JSON/);
    await user.click(showBtn);
    expect(screen.getByText(/Hide.*raw JSON/)).toBeInTheDocument();

    // Verify JSON content is shown
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre!.textContent).toContain('UseRmsUserLicense');

    await user.click(screen.getByText(/Hide.*raw JSON/));
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });

  it('calls Get-SLOnboardingPolicy on mount', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicyAll });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLOnboardingPolicy');
    });
  });

  it('shows help text for toggle and security group field', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockPolicy });
    render(<OnboardingPolicy />);
    await waitFor(() => {
      expect(screen.getByText('Onboarding Control Policy')).toBeInTheDocument();
    });
    expect(screen.getByText(/Require users to have an RMS license/)).toBeInTheDocument();
    expect(screen.getByText(/Only members of this group can use AIP/)).toBeInTheDocument();
  });
});
