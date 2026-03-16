import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplatesPage from '../../renderer/components/Templates/TemplatesPage';
import { mockInvoke } from '../setup';

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true, data: null });
  });

  it('renders the page title', () => {
    render(<TemplatesPage />);
    expect(screen.getByText('Classification Templates')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<TemplatesPage />);
    expect(screen.getAllByText(/Content-based classification policies/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders all template options', () => {
    render(<TemplatesPage />);
    expect(screen.getByText('PHI')).toBeInTheDocument();
    expect(screen.getByText('PCI')).toBeInTheDocument();
    expect(screen.getByText('PII')).toBeInTheDocument();
    expect(screen.getByText('GDPR')).toBeInTheDocument();
  });

  it('shows placeholder when no template selected', () => {
    render(<TemplatesPage />);
    expect(screen.getAllByText(/Select a template/).length).toBeGreaterThanOrEqual(1);
  });

  it('selects PHI template and shows detail', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await user.click(screen.getByText('PHI'));
    expect(screen.getAllByText(/HIPAA/i).length).toBeGreaterThanOrEqual(1);
  });

  it('selects PCI template and shows detail', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await user.click(screen.getByText('PCI'));
    expect(screen.getAllByText(/Payment Card/i).length).toBeGreaterThanOrEqual(1);
  });

  it('has Deploy and Dry Run buttons for selected template', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await user.click(screen.getByText('PHI'));
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
  });

  it('calls Deploy-SLTemplate with -DryRun on dry run', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: { Status: 'DryRun' } });
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await user.click(screen.getByText('PHI'));
    await user.click(screen.getByText('Dry Run'));

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining('Deploy-SLTemplate')
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining('-DryRun')
    );
  });

  it('calls Deploy-SLTemplate with -Confirm:$false on deploy', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: { Status: 'Deployed' } });
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await user.click(screen.getByText('PHI'));
    await user.click(screen.getByText('Deploy'));

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining('Deploy-SLTemplate')
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining('-Confirm:$false')
    );
  });
});
