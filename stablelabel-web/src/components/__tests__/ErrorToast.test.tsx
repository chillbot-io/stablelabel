import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ErrorToast from '../ErrorToast';
import type { Toast } from '@/hooks/useErrorToast';

describe('ErrorToast', () => {
  const sampleToasts: Toast[] = [
    { id: 1, message: 'Something went wrong' },
    { id: 2, message: 'Network error' },
  ];

  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<ErrorToast toasts={[]} onDismiss={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders toast messages', () => {
    render(<ErrorToast toasts={sampleToasts} onDismiss={() => {}} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('calls onDismiss with correct id when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<ErrorToast toasts={sampleToasts} onDismiss={onDismiss} />);
    // Click the first dismiss button (X buttons)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('renders a dismiss button for each toast', () => {
    render(<ErrorToast toasts={sampleToasts} onDismiss={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });
});
