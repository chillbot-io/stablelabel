import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileSharesPage from '../../renderer/components/FileShares/FileSharesPage';
import { mockInvoke } from '../setup';

/** Find the nav button for a section by its label text */
function getNavButton(label: string): HTMLElement {
  const matches = screen.getAllByText(label);
  // The nav button has the border-l-2 class from the sidebar
  const navBtn = matches.find(el => el.closest('button')?.className.includes('border-l-2'));
  return navBtn?.closest('button') ?? matches[0].closest('button')!;
}

describe('FileSharesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', () => {
    render(<FileSharesPage />);
    expect(screen.getByText('File Shares')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<FileSharesPage />);
    expect(screen.getByText('AIPService operations on CIFS/SMB shares')).toBeInTheDocument();
  });

  it('renders all section options in nav', () => {
    render(<FileSharesPage />);
    expect(screen.getAllByText('Connect').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Inventory').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Scan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Apply Label').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Remove Label').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bulk Apply').length).toBeGreaterThanOrEqual(1);
  });

  it('shows descriptions for each section', () => {
    render(<FileSharesPage />);
    expect(screen.getByText('Mount or disconnect CIFS/SMB shares')).toBeInTheDocument();
    expect(screen.getByText('Browse files and label status')).toBeInTheDocument();
    expect(screen.getByText('Scan for sensitive content')).toBeInTheDocument();
    expect(screen.getByText('Apply a sensitivity label to a file')).toBeInTheDocument();
    expect(screen.getByText('Remove the label from a file')).toBeInTheDocument();
    expect(screen.getByText('Apply labels to multiple files at once')).toBeInTheDocument();
  });

  it('starts with Connect section active', () => {
    render(<FileSharesPage />);
    const connectBtn = getNavButton('Connect');
    expect(connectBtn.className).toContain('border-blue-400');
  });

  it('switches to Inventory section', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(getNavButton('Inventory'));
    expect(getNavButton('Inventory').className).toContain('border-blue-400');
    expect(getNavButton('Connect').className).not.toContain('border-blue-400');
  });

  it('switches to Scan section', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(getNavButton('Scan'));
    expect(getNavButton('Scan').className).toContain('border-blue-400');
  });

  it('switches to Apply Label section', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(getNavButton('Apply Label'));
    expect(getNavButton('Apply Label').className).toContain('border-blue-400');
  });

  it('switches to Remove Label section', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(getNavButton('Remove Label'));
    expect(getNavButton('Remove Label').className).toContain('border-blue-400');
  });

  it('switches to Bulk Apply section', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(getNavButton('Bulk Apply'));
    expect(getNavButton('Bulk Apply').className).toContain('border-blue-400');
  });

  it('shows AIPService requirement note', () => {
    render(<FileSharesPage />);
    expect(screen.getByText(/Requires AIPService/)).toBeInTheDocument();
  });

  it('shows connection prerequisite note', () => {
    render(<FileSharesPage />);
    expect(screen.getByText(/Connect to a share before scanning/)).toBeInTheDocument();
  });

  it('cycles through all sections correctly', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    for (const label of ['Inventory', 'Scan', 'Apply Label', 'Remove Label', 'Bulk Apply', 'Connect'] as const) {
      await user.click(getNavButton(label));
      expect(getNavButton(label).className).toContain('border-blue-400');
    }
  });
});
