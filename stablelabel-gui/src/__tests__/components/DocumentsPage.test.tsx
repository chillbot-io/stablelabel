import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentsPage from '../../renderer/components/Documents/DocumentsPage';
import { mockInvoke } from '../setup';

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page title', () => {
    render(<DocumentsPage />);
    expect(screen.getByText('Document Labels')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<DocumentsPage />);
    expect(screen.getAllByText(/Graph API operations/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders all section options', () => {
    render(<DocumentsPage />);
    expect(screen.getByText('Look Up')).toBeInTheDocument();
    expect(screen.getByText('Apply')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(screen.getByText('Bulk Apply')).toBeInTheDocument();
  });

  it('starts with Look Up section active', () => {
    render(<DocumentsPage />);
    // Multiple elements may match the description text
    expect(screen.getAllByText(/Extract the current sensitivity label/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Apply section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Apply'));
    expect(screen.getAllByText(/Assign a sensitivity label to a document/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Remove section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Remove'));
    expect(screen.getAllByText(/Remove the sensitivity label/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Bulk Apply section', async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await user.click(screen.getByText('Bulk Apply'));
    expect(screen.getAllByText(/Assign a label to multiple/).length).toBeGreaterThanOrEqual(1);
  });
});
