import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectionDialog from '../../renderer/components/Connection/ConnectionDialog';
import { mockInvoke } from '../setup';

describe('ConnectionDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three connect buttons', () => {
    render(<ConnectionDialog onClose={onClose} />);

    expect(screen.getByText('Microsoft Graph')).toBeInTheDocument();
    expect(screen.getByText('Security & Compliance')).toBeInTheDocument();
    expect(screen.getByText('Protection Service')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<ConnectionDialog onClose={onClose} />);
    expect(screen.getByText('Connect to Microsoft 365')).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes Connect-SLGraph when Microsoft Graph button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: null });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Microsoft Graph'));
    expect(mockInvoke).toHaveBeenCalledWith('Connect-SLGraph');
  });

  it('invokes Connect-SLCompliance when Compliance button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: null });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Security & Compliance'));
    expect(mockInvoke).toHaveBeenCalledWith('Connect-SLCompliance');
  });

  it('invokes Connect-SLProtection when Protection button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: null });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Protection Service'));
    expect(mockInvoke).toHaveBeenCalledWith('Connect-SLProtection');
  });

  it('displays error when connection fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Auth failed' });
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Microsoft Graph'));

    expect(await screen.findByText('Auth failed')).toBeInTheDocument();
  });

  it('shows Connecting... text while connecting', async () => {
    let resolveInvoke: (v: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => { resolveInvoke = resolve; })
    );
    const user = userEvent.setup();

    render(<ConnectionDialog onClose={onClose} />);

    await user.click(screen.getByText('Microsoft Graph'));

    expect(screen.getByText('Connecting...')).toBeInTheDocument();

    // Resolve the promise to clean up
    resolveInvoke!({ success: true, data: null });
  });
});
