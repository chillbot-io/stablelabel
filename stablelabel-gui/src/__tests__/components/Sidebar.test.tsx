import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../../renderer/components/Layout/Sidebar';

describe('Sidebar', () => {
  const onNavigate = vi.fn();

  it('renders the app title', () => {
    render(<Sidebar currentPage="dashboard" onNavigate={onNavigate} />);
    expect(screen.getByText('StableLabel')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<Sidebar currentPage="dashboard" onNavigate={onNavigate} />);
    expect(screen.getByText('Purview Compliance')).toBeInTheDocument();
  });

  it('renders the version', () => {
    render(<Sidebar currentPage="dashboard" onNavigate={onNavigate} />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('renders all navigation groups', () => {
    render(<Sidebar currentPage="dashboard" onNavigate={onNavigate} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Information Protection')).toBeInTheDocument();
  });

  it('renders all page navigation items', () => {
    render(<Sidebar currentPage="dashboard" onNavigate={onNavigate} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('DLP')).toBeInTheDocument();
    expect(screen.getByText('Retention')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Protection')).toBeInTheDocument();
    expect(screen.getByText('Elevation')).toBeInTheDocument();
    expect(screen.getByText('Snapshots')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('calls onNavigate when a nav item is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar currentPage="dashboard" onNavigate={onNavigate} />);

    await user.click(screen.getByText('Labels'));
    expect(onNavigate).toHaveBeenCalledWith('labels');
  });

  it('highlights the active page', () => {
    const { container } = render(
      <Sidebar currentPage="labels" onNavigate={onNavigate} />
    );
    // The active item should have distinct styling (blue border/text)
    const labelsButton = screen.getByText('Labels').closest('button');
    expect(labelsButton?.className).toContain('blue');
  });
});
