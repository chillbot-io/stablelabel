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
    // "Dashboard" appears in both sidebar and page header
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
  });

  it('navigates to Labels page via sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Click Labels in the sidebar
    const sidebarLabels = screen.getAllByText('Labels')[0];
    await user.click(sidebarLabels);
    // LabelsPage renders, so "Not Connected" should be gone
    expect(screen.queryByText('Not Connected')).not.toBeInTheDocument();
  });

  it('navigates to DLP page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('DLP'));
    // DLP page should render with its workspace sections
    expect(screen.getByText(/Select an item/i)).toBeInTheDocument();
  });

  it('navigates to Documents page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Documents'));
    expect(screen.getByText('Document Labels')).toBeInTheDocument();
  });

  it('navigates to Protection page', async () => {
    const user = userEvent.setup();
    render(<App />);

    // "Protection" appears in both sidebar and TopBar, click the sidebar one
    const protectionItems = screen.getAllByText('Protection');
    // The sidebar item is the button element
    const sidebarButton = protectionItems.find((el) => el.closest('button'));
    await user.click(sidebarButton!);
    expect(screen.getByText('AIP Protection')).toBeInTheDocument();
  });

  it('navigates to Elevation page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Elevation'));
    expect(screen.getByText('Just-in-time privilege management')).toBeInTheDocument();
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
    expect(screen.getByText('Checks, reports, and diagnostics')).toBeInTheDocument();
  });

  it('navigates to Templates page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Templates'));
    expect(screen.getByText('Classification Templates')).toBeInTheDocument();
  });

  it('navigates back to Dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Elevation'));
    const dashboardItems = screen.getAllByText('Dashboard');
    await user.click(dashboardItems[0]);
    expect(screen.getByText('Tenant compliance overview')).toBeInTheDocument();
  });
});
