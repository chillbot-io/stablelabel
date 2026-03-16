import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtectionConfigPanel from '../../../renderer/components/Protection/ProtectionConfigPanel';
import { mockInvoke } from '../../setup';

const mockConfig = {
  BPOSId: 'bpos-tenant-id-123',
  RightsManagementServiceId: 'rms-service-id-456',
  LicensingIntranetDistributionPointUrl: 'https://licensing.internal.contoso.com',
  LicensingExtranetDistributionPointUrl: 'https://licensing.contoso.com',
  CertificationIntranetDistributionPointUrl: 'https://cert.internal.contoso.com',
  CertificationExtranetDistributionPointUrl: 'https://cert.contoso.com',
  AdminConnectionUrl: 'https://admin.contoso.com',
  AdminV2ConnectionUrl: 'https://adminv2.contoso.com',
  OnPremiseDomainName: 'contoso.com',
  Keys: [{ KeyId: 'key-1', KeyType: 'RSA' }],
  CurrentLicensorCertificateGuid: 'cert-guid-789',
  Templates: [],
  FunctionalState: 'Enabled',
  SuperUsersEnabled: true,
  SuperUsers: ['admin@contoso.com', 'superuser@contoso.com'],
  AdminRoleMembers: ['roleadmin@contoso.com'],
  KeyRolloverCount: 2,
  ProvisioningDate: '2024-01-15',
  IPCv3ServiceFunctionalState: 'Enabled',
  DevicePlatformState: { Windows: 'Enabled', iOS: 'Enabled' },
  FciEnabledForConnectorAuthorization: false,
};

const mockAdmins = [
  { EmailAddress: 'admin1@contoso.com', Role: 'GlobalAdministrator' },
  { EmailAddress: 'admin2@contoso.com', Role: 'ConnectorAdministrator' },
];

const mockKeys = [
  { KeyId: 'key-001', KeyType: 'RSA', Status: 'Active' },
  { KeyId: 'key-002', KeyType: 'RSA', Status: 'Archived' },
];

describe('ProtectionConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton on initial render', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ProtectionConfigPanel />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('shows error when config fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  it('shows fallback error when config fetch fails without error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load config')).toBeInTheDocument();
    });
  });

  it('shows error when invoke throws an Error', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows generic error when invoke throws a non-Error', async () => {
    mockInvoke.mockRejectedValue('something bad');
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('renders null when config is null (success but no data)', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: null });
    const { container } = render(<ProtectionConfigPanel />);
    await waitFor(() => {
      // Loading should be done, but no content since config is null
      expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    });
    // The component returns null so there's nothing meaningful rendered
    expect(screen.queryByText('Service Configuration')).not.toBeInTheDocument();
  });

  it('renders config data after successful load', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: mockAdmins })
      .mockResolvedValueOnce({ success: true, data: mockKeys });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Enabled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2')).toBeInTheDocument(); // KeyRolloverCount
  });

  it('displays Functional State as Unknown when null', async () => {
    const configNoState = { ...mockConfig, FunctionalState: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: configNoState })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('displays SuperUsers as Disabled when SuperUsersEnabled is false', async () => {
    const configNoSU = { ...mockConfig, SuperUsersEnabled: false };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: configNoSU })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('displays KeyRolloverCount as 0 when null', async () => {
    const configNoKeys = { ...mockConfig, KeyRolloverCount: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: configNoKeys })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('displays service details with mono styling', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Details')).toBeInTheDocument();
    });
    expect(screen.getByText('bpos-tenant-id-123')).toBeInTheDocument();
    expect(screen.getByText('rms-service-id-456')).toBeInTheDocument();
    expect(screen.getByText('2024-01-15')).toBeInTheDocument();
    expect(screen.getByText('contoso.com')).toBeInTheDocument();
  });

  it('shows N/A for null InfoRow values', async () => {
    const configNulls = { ...mockConfig, OnPremiseDomainName: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: configNulls })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Details')).toBeInTheDocument();
    });
    // At least one N/A for the null domain
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1);
  });

  it('renders super users section when present', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Super Users (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('superuser@contoso.com')).toBeInTheDocument();
  });

  it('hides super users section when array is empty', async () => {
    const configEmpty = { ...mockConfig, SuperUsers: [] };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: configEmpty })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Super Users \(/)).not.toBeInTheDocument();
  });

  it('hides super users section when null', async () => {
    const configNoSU = { ...mockConfig, SuperUsers: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: configNoSU })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Super Users \(/)).not.toBeInTheDocument();
  });

  it('renders admins section when admins are returned', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: mockAdmins })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Role-Based Administrators (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('admin1@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('GlobalAdministrator')).toBeInTheDocument();
    expect(screen.getByText('admin2@contoso.com')).toBeInTheDocument();
    expect(screen.getByText('ConnectorAdministrator')).toBeInTheDocument();
  });

  it('hides admins section when empty', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Role-Based Administrators/)).not.toBeInTheDocument();
  });

  it('renders keys section when keys are returned', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: mockKeys });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Tenant Keys')).toBeInTheDocument();
    });
  });

  it('wraps non-array keys data into array', async () => {
    const singleKey = { KeyId: 'key-single', KeyType: 'RSA' };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: singleKey });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Tenant Keys')).toBeInTheDocument();
    });
  });

  it('hides keys section when keys are null', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });
    expect(screen.queryByText('Tenant Keys')).not.toBeInTheDocument();
  });

  it('toggles raw JSON display for full config', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });

    // Find the "Show" button for full config (there's at least one RawJson)
    const showBtn = screen.getByText(/Show.*Full config|Show.*raw JSON/i);
    expect(showBtn).toBeInTheDocument();
    await user.click(showBtn);
    // Should now show JSON pre element
    expect(screen.getByText(/Hide/)).toBeInTheDocument();
    // Click again to hide
    await user.click(screen.getByText(/Hide/));
    expect(screen.queryByText(/Hide.*raw JSON|Hide.*Full config/)).not.toBeInTheDocument();
  });

  it('toggles raw JSON display for keys section', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: mockKeys });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Tenant Keys')).toBeInTheDocument();
    });

    // There should be multiple "Show" buttons now (keys + full config)
    const showButtons = screen.getAllByText(/Show/);
    expect(showButtons.length).toBeGreaterThanOrEqual(2);
    await user.click(showButtons[0]);
    expect(screen.getByText(/Hide/)).toBeInTheDocument();
  });

  it('calls correct PowerShell commands on mount', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLProtectionConfig');
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLProtectionAdmin');
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLProtectionKey');
    });
  });

  it('handles admins fetch failure gracefully (only config error shown)', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: false, data: null, error: 'No admin access' })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Configuration')).toBeInTheDocument();
    });
    // Admins section should not appear since data wasn't set
    expect(screen.queryByText(/Role-Based Administrators/)).not.toBeInTheDocument();
  });

  it('renders StatusCard with green color for enabled state', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Functional State')).toBeInTheDocument();
    });
    // Enabled state should have green text
    const enabledValues = screen.getAllByText('Enabled');
    const greenEnabled = enabledValues.find(el => el.className.includes('text-green-400'));
    expect(greenEnabled).toBeTruthy();
  });

  it('renders StatusCard with yellow color for super users warning', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockConfig })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: null });
    render(<ProtectionConfigPanel />);
    await waitFor(() => {
      expect(screen.getByText('Super Users')).toBeInTheDocument();
    });
    // The "Enabled" text under Super Users should be yellow since warn=true and highlight=true
    const superUsersCard = screen.getByText('Super Users').closest('div')!;
    const value = superUsersCard.querySelector('dd')!;
    expect(value.className).toContain('text-yellow-400');
  });
});
