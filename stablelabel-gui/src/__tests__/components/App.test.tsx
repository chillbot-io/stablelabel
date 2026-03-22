import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../renderer/App';
import { mockInvoke } from '../setup';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the sidebar with app title', () => {
    render(<App />);
    expect(screen.getByText('StableLabel')).toBeInTheDocument();
  });

  it('renders the top bar with connection dots', () => {
    render(<App />);
    expect(screen.getByText('Graph')).toBeInTheDocument();
  });

  it('starts on the Dashboard page', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
  });

  it('navigates to Labels page via sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Labels' }));
    expect(screen.queryByText('Not Connected')).not.toBeInTheDocument();
  });

  it('navigates to Documents page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Documents'));
    expect(screen.getByText('Document Labels')).toBeInTheDocument();
  });

  it('navigates to Snapshots page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Snapshots'));
    expect(screen.getByText('Capture, compare, and restore tenant config')).toBeInTheDocument();
  });

  it('navigates to Analysis page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Analysis'));
    expect(screen.getByText('Label reports and diagnostics')).toBeInTheDocument();
  });

  it('navigates back to Dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Documents'));
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByText('Sensitivity label overview')).toBeInTheDocument();
  });
});
