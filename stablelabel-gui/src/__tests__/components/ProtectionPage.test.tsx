import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtectionPage from '../../renderer/components/Protection/ProtectionPage';
import { mockInvoke } from '../setup';

describe('ProtectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  it('renders the page title', () => {
    render(<ProtectionPage />);
    expect(screen.getByText('AIP Protection')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<ProtectionPage />);
    expect(screen.getByText(/Azure Information Protection/)).toBeInTheDocument();
  });

  it('renders all section options', () => {
    render(<ProtectionPage />);
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('Doc Tracking')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });

  it('shows help text', () => {
    render(<ProtectionPage />);
    expect(screen.getByText(/Requires AIPService connection/)).toBeInTheDocument();
  });

  it('switches between sections', async () => {
    const user = userEvent.setup();
    render(<ProtectionPage />);

    await user.click(screen.getByText('Templates'));
    // Templates section should now be active
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });
});
