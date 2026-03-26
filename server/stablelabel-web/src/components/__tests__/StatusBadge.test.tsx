import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('replaces underscores with spaces in status text', () => {
    render(<StatusBadge status="rolled_back" />);
    expect(screen.getByText('rolled back')).toBeInTheDocument();
  });

  it('applies green classes for completed status', () => {
    render(<StatusBadge status="completed" />);
    const el = screen.getByText('completed');
    expect(el.className).toContain('bg-green-900/50');
    expect(el.className).toContain('text-green-400');
  });

  it('applies blue classes for running status', () => {
    render(<StatusBadge status="running" />);
    const el = screen.getByText('running');
    expect(el.className).toContain('bg-blue-900/50');
    expect(el.className).toContain('text-blue-400');
  });

  it('applies red classes for failed status', () => {
    render(<StatusBadge status="failed" />);
    const el = screen.getByText('failed');
    expect(el.className).toContain('bg-red-900/50');
    expect(el.className).toContain('text-red-400');
  });

  it('applies default zinc classes for unknown status', () => {
    render(<StatusBadge status="unknown" />);
    const el = screen.getByText('unknown');
    expect(el.className).toContain('bg-zinc-800');
    expect(el.className).toContain('text-zinc-400');
  });
});
