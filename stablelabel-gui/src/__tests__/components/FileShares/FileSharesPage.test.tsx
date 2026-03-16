import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileSharesPage from '../../../renderer/components/FileShares/FileSharesPage';
import { mockInvoke } from '../../setup';

describe('FileSharesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('renders the page header and section descriptions', () => {
    render(<FileSharesPage />);
    expect(screen.getByText('File Shares')).toBeInTheDocument();
    expect(screen.getByText('Mount or disconnect CIFS/SMB shares')).toBeInTheDocument();
    expect(screen.getByText('Browse files and label status')).toBeInTheDocument();
    expect(screen.getByText('Scan for sensitive content')).toBeInTheDocument();
    expect(screen.getByText('Apply a sensitivity label to a file')).toBeInTheDocument();
    expect(screen.getByText('Remove the label from a file')).toBeInTheDocument();
    expect(screen.getByText('Apply labels to multiple files at once')).toBeInTheDocument();
  });

  it('defaults to Connect section', () => {
    render(<FileSharesPage />);
    expect(screen.getByText('Connect to File Share')).toBeInTheDocument();
  });

  it('navigates to Inventory section when clicked', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(screen.getByText('Inventory'));
    expect(screen.getByText('File Share Inventory')).toBeInTheDocument();
  });

  it('navigates to Scan section when clicked', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(screen.getByText('Scan'));
    expect(screen.getByText('Scan File Share')).toBeInTheDocument();
  });

  it('navigates to Apply Label section when clicked', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(screen.getByText('Apply Label'));
    expect(screen.getByText('Apply Label to File')).toBeInTheDocument();
  });

  it('navigates to Remove Label section when clicked', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(screen.getByText('Remove Label'));
    expect(screen.getByText('Remove Label from File')).toBeInTheDocument();
  });

  it('navigates to Bulk Apply section when clicked', async () => {
    const user = userEvent.setup();
    render(<FileSharesPage />);

    await user.click(screen.getByText('Bulk Apply'));
    expect(screen.getByText('Bulk Apply Labels')).toBeInTheDocument();
  });

  it('shows AIPService requirement in footer', () => {
    render(<FileSharesPage />);
    expect(screen.getByText('Requires AIPService (Windows only).')).toBeInTheDocument();
  });
});
