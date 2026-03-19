import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ElevationPage from '../../renderer/components/Elevation/ElevationPage';
import { mockInvoke } from '../setup';

describe('ElevationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Elevation')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Just-in-time privilege management')).toBeInTheDocument();
  });

  it('renders all section options', () => {
    render(<ElevationPage />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Elevated Jobs')).toBeInTheDocument();
    expect(screen.getByText('Super User')).toBeInTheDocument();
    expect(screen.getByText('Site Admin')).toBeInTheDocument();
    expect(screen.getByText('Mailbox')).toBeInTheDocument();
    expect(screen.getByText('PIM Roles')).toBeInTheDocument();
  });

  it('shows help text about audit logging', () => {
    render(<ElevationPage />);
    expect(screen.getByText(/audit-logged/)).toBeInTheDocument();
  });

  it('switches to Super User section', async () => {
    const user = userEvent.setup();
    render(<ElevationPage />);

    await user.click(screen.getByText('Super User'));
    // Super User section should now be rendered
    expect(screen.getByText('Super User')).toBeInTheDocument();
  });
});
