import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TopBar from '../../renderer/components/Layout/TopBar';
import { mockInvoke } from '../setup';

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders connection status labels', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        GraphConnected: false,
        ComplianceConnected: false,
        ProtectionConnected: false,
        UserPrincipalName: null,
        TenantId: null,
      },
    });

    render(<TopBar />);

    expect(screen.getByText('Graph')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('Protection')).toBeInTheDocument();
  });

  it('displays UserPrincipalName when connected', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        GraphConnected: true,
        ComplianceConnected: false,
        ProtectionConnected: false,
        UserPrincipalName: 'admin@contoso.com',
        TenantId: 'tenant-123',
      },
    });

    render(<TopBar />);

    await waitFor(() => {
      expect(screen.getByText('admin@contoso.com')).toBeInTheDocument();
    });
  });
});
