/**
 * E2E tests for the Settings page.
 *
 * Verifies: environment info → settings form → save → log level toggle → validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockCheckPwsh, mockGetStatus } from '../setup';

import SettingsPage from '../../renderer/components/Settings/SettingsPage';

describe('Settings page (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPwsh.mockResolvedValue({ available: true, path: '/usr/bin/pwsh' });
    mockGetStatus.mockResolvedValue({ initialized: true, modulePath: '/opt/stablelabel/module' });
    (window.stablelabel.getPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (window.stablelabel.setPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (window.stablelabel.updateSettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders settings page with all sections', async () => {
    render(<SettingsPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Application preferences and diagnostics')).toBeInTheDocument();

    // Section headers (rendered with CSS text-transform uppercase, DOM text is mixed case)
    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(screen.getByText('PowerShell Module')).toBeInTheDocument();
    expect(screen.getByText('Command Timeout')).toBeInTheDocument();
    expect(screen.getByText('Logging')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('displays environment info from bridge', async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      // Both PowerShell Available and Bridge Initialized show "Yes"
      const yesElements = screen.getAllByText('Yes');
      expect(yesElements.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('/usr/bin/pwsh')).toBeInTheDocument();
  });

  it('displays platform info', () => {
    render(<SettingsPage />);

    expect(screen.getByText('win32')).toBeInTheDocument(); // from mock: platform: 'win32'
  });

  it('auto-fills module path from bridge status', async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      const moduleInput = screen.getByPlaceholderText('Auto-detected from app resources') as HTMLInputElement;
      expect(moduleInput.value).toBe('/opt/stablelabel/module');
    });
  });

  it('does not override user-set module path', async () => {
    (window.stablelabel.getPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      settings: { modulePath: '/custom/path', timeout: 300, logLevel: 'Info' },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      const moduleInput = screen.getByPlaceholderText('Auto-detected from app resources') as HTMLInputElement;
      expect(moduleInput.value).toBe('/custom/path');
    });
  });

  it('displays all log level buttons', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Debug')).toBeInTheDocument();
  });

  it('changes log level on click', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Debug'));

    // The Debug button should now be highlighted (we verify by saving)
    await user.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(window.stablelabel.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ logLevel: 'Debug' }),
      );
    });
  });

  it('saves settings and shows confirmation', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });

    expect(window.stablelabel.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          timeout: 300,
          logLevel: 'Info',
        }),
      }),
    );

    expect(window.stablelabel.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 300,
        logLevel: 'Info',
      }),
    );
  });

  it('shows version and about info', () => {
    render(<SettingsPage />);

    expect(screen.getByText('StableLabel')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('Unified Microsoft Purview Compliance Management')).toBeInTheDocument();
  });

  it('loads saved preferences on mount', async () => {
    (window.stablelabel.getPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      settings: { modulePath: '/saved/path', timeout: 600, logLevel: 'Debug' },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      const moduleInput = screen.getByPlaceholderText('Auto-detected from app resources') as HTMLInputElement;
      expect(moduleInput.value).toBe('/saved/path');
    });

    // Timeout should be loaded
    const timeoutInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(timeoutInput.value).toBe('600');
  });

  it('validates settings shape — rejects invalid timeout', async () => {
    (window.stablelabel.getPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      settings: { timeout: 5, logLevel: 'InvalidLevel' },
    });

    render(<SettingsPage />);

    // Invalid values should be ignored, defaults used
    await waitFor(() => {
      const timeoutInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(timeoutInput.value).toBe('300'); // default, since 5 < 10 is rejected
    });
  });

  it('handles preferences load failure gracefully', async () => {
    (window.stablelabel.getPreferences as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Decrypt failed'));

    render(<SettingsPage />);

    // Page should still render with defaults
    expect(screen.getByText('Settings')).toBeInTheDocument();

    await waitFor(() => {
      const timeoutInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(timeoutInput.value).toBe('300');
    });
  });

  it('shows PowerShell unavailable when check fails', async () => {
    mockCheckPwsh.mockResolvedValue({ available: false });

    render(<SettingsPage />);

    await waitFor(() => {
      // "No" for PowerShell Available
      const noElements = screen.getAllByText('No');
      expect(noElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows bridge not initialized state', async () => {
    mockGetStatus.mockResolvedValue({ initialized: false });

    render(<SettingsPage />);

    await waitFor(() => {
      // Should show "No" for Bridge Initialized
      const noElements = screen.getAllByText('No');
      expect(noElements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
