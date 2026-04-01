import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '../Modal';

describe('Modal', () => {
  it('renders the title', () => {
    render(
      <Modal title="Confirm" onClose={() => {}}>
        <p>Are you sure?</p>
      </Modal>,
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <Modal title="Info" onClose={() => {}}>
        <p>Details here</p>
      </Modal>,
    );
    expect(screen.getByText('Details here')).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <p>Content</p>
      </Modal>,
    );
    // Click the backdrop (outermost div)
    fireEvent.click(screen.getByText('Content').closest('.fixed')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when dialog content is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        <p>Content</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
