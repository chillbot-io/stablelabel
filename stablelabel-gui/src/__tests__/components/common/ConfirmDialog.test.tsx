import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../../renderer/components/common/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
  });

  it('renders message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Delete" cancelLabel="Go Back" />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);
    await user.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);
    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('shows Working... when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading />);
    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });

  it('disables buttons when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading />);
    expect(screen.getByText('Working...')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('applies danger variant styling', () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-red-600');
  });

  it('applies warning variant styling', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-amber-600');
  });

  it('applies default variant styling', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-blue-600');
  });

  it('applies default variant when variant is explicitly "default"', () => {
    render(<ConfirmDialog {...defaultProps} variant="default" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-blue-600');
  });

  it('renders as a modal overlay', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');
    expect(overlay.className).toContain('z-50');
  });

  it('does not show loading state when loading is false', () => {
    render(<ConfirmDialog {...defaultProps} loading={false} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.queryByText('Working...')).not.toBeInTheDocument();
  });

  it('does not call onConfirm when clicking disabled confirm button during loading', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} loading />);
    const workingBtn = screen.getByText('Working...');
    await user.click(workingBtn);
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('does not call onCancel when clicking disabled cancel button during loading', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} loading />);
    const cancelBtn = screen.getByText('Cancel');
    await user.click(cancelBtn);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });
});
