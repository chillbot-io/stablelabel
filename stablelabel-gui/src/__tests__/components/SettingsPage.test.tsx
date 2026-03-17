import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../../renderer/components/Settings/SettingsPage';
import { mockGetStatus, mockCheckPwsh } from '../setup';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({ initialized: true, modulePath: '/path/to/StableLabel' });
    mockCheckPwsh.mockResolvedValue({ available: true, path: '/usr/bin/pwsh' });
    localStorage.clear();
  });

  it('renders the page title', async () => {
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Application preferences and diagnostics')).toBeInTheDocument();
  });

  it('shows environment info', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Environment')).toBeInTheDocument();
    });
    expect(screen.getByText('win32')).toBeInTheDocument(); // from mock setup
  });

  it('shows PowerShell availability', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('PowerShell Available')).toBeInTheDocument();
    });
    // Should show "Yes" because mockCheckPwsh returns available: true
    expect(screen.getAllByText('Yes').length).toBeGreaterThanOrEqual(1);
  });

  it('shows PowerShell path when available', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('/usr/bin/pwsh')).toBeInTheDocument();
    });
  });

  it('shows Bridge Initialized status', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Bridge Initialized')).toBeInTheDocument();
    });
  });

  it('shows PowerShell module section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('PowerShell Module')).toBeInTheDocument();
  });

  it('shows command timeout section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Command Timeout')).toBeInTheDocument();
  });

  it('shows logging section with level buttons', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Logging')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Debug')).toBeInTheDocument();
  });

  it('Info log level is active by default', () => {
    render(<SettingsPage />);
    const infoBtn = screen.getByText('Info');
    expect(infoBtn.className).toContain('bg-blue-500/[0.15]');
  });

  it('changes log level when clicking a different level', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Debug'));
    expect(screen.getByText('Debug').className).toContain('bg-blue-500/[0.15]');
    // Info should no longer be active
    expect(screen.getByText('Info').className).not.toContain('bg-blue-500/[0.15]');
  });

  it('saves settings to localStorage', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });
    expect(localStorage.getItem('stablelabel-settings')).toBeTruthy();
  });

  it('saved settings contain correct structure', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });

    const saved = JSON.parse(localStorage.getItem('stablelabel-settings')!);
    expect(saved).toHaveProperty('timeout');
    expect(saved).toHaveProperty('logLevel');
    expect(saved.timeout).toBe(300);
    expect(saved.logLevel).toBe('Info');
  });

  it('loads settings from localStorage on mount', async () => {
    localStorage.setItem('stablelabel-settings', JSON.stringify({
      modulePath: '/custom/path',
      timeout: 600,
      logLevel: 'Debug',
    }));

    render(<SettingsPage />);

    await waitFor(() => {
      // Debug should be the active log level
      expect(screen.getByText('Debug').className).toContain('bg-blue-500/[0.15]');
    });
  });

  it('handles invalid localStorage gracefully', () => {
    localStorage.setItem('stablelabel-settings', 'invalid json{{{');
    // Should not throw
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('saves timeout value from input', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });

    const saved = JSON.parse(localStorage.getItem('stablelabel-settings')!);
    expect(typeof saved.timeout).toBe('number');
    expect(saved.timeout).toBeGreaterThanOrEqual(10);
  });

  it('enforces minimum timeout of 10', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const timeoutInput = screen.getByRole('spinbutton');
    await user.clear(timeoutInput);
    await user.type(timeoutInput, '5');

    await user.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });

    const saved = JSON.parse(localStorage.getItem('stablelabel-settings')!);
    expect(saved.timeout).toBeGreaterThanOrEqual(10);
  });

  it('auto-fills module path from bridge status', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Auto-detected from app resources');
      expect(input).toHaveValue('/path/to/StableLabel');
    });
  });

  it('shows about section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('StableLabel')).toBeInTheDocument();
  });

  it('shows "Settings saved" message immediately after save', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Save Settings'));
    expect(screen.getByText('Settings saved')).toBeInTheDocument();
  });
});
