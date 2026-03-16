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

  it('shows environment info', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Environment')).toBeInTheDocument();
    });
    expect(screen.getByText('win32')).toBeInTheDocument(); // from mock setup
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

  it('saves settings to localStorage', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });
    expect(localStorage.getItem('stablelabel-settings')).toBeTruthy();
  });

  it('shows about section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
  });
});
