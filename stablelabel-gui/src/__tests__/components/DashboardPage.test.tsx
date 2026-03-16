import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '../../renderer/components/Dashboard/DashboardPage';
import { mockInvoke } from '../setup';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows welcome card when not connected', () => {
    // Default mock returns no connection
    mockInvoke.mockResolvedValue({ success: true, data: {
      GraphConnected: false,
      ComplianceConnected: false,
      ProtectionConnected: false,
      UserPrincipalName: null,
      TenantId: null,
    }});

    render(<DashboardPage />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
  });

  it('renders the page header', () => {
    mockInvoke.mockResolvedValue({ success: true, data: {
      GraphConnected: false,
      ComplianceConnected: false,
      ProtectionConnected: false,
      UserPrincipalName: null,
      TenantId: null,
    }});

    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Tenant compliance overview')).toBeInTheDocument();
  });

  it('shows stat cards when connected', async () => {
    // First call = connection status, subsequent = various data fetches
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: {
        GraphConnected: true,
        ComplianceConnected: true,
        ProtectionConnected: false,
        UserPrincipalName: 'admin@contoso.com',
        TenantId: 'abc-123',
      }})
      .mockResolvedValue({ success: true, data: [] });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Sensitivity Labels')).toBeInTheDocument();
      expect(screen.getByText('DLP Policies')).toBeInTheDocument();
      expect(screen.getByText('Retention Policies')).toBeInTheDocument();
    });
  });

  it('calls onNavigate when a stat card is clicked', async () => {
    const onNavigate = vi.fn();

    mockInvoke
      .mockResolvedValueOnce({ success: true, data: {
        GraphConnected: true,
        ComplianceConnected: true,
        ProtectionConnected: false,
        UserPrincipalName: 'admin@contoso.com',
        TenantId: 'abc-123',
      }})
      .mockResolvedValue({ success: true, data: [] });

    render(<DashboardPage onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('DLP Policies')).toBeInTheDocument();
    });

    screen.getByText('DLP Policies').closest('button')?.click();
    expect(onNavigate).toHaveBeenCalledWith('dlp');
  });
});
