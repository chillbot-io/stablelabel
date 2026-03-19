import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplatesPage from '../../renderer/components/Templates/TemplatesPage';
import { mockInvoke } from '../setup';

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Get-SLTemplate returns empty so fallback templates are used
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

  it('renders all template options after loading', async () => {
    render(<TemplatesPage />);
    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    expect(screen.getByText('PCI-DSS')).toBeInTheDocument();
    expect(screen.getByText('PII-Protection')).toBeInTheDocument();
    expect(screen.getByText('GDPR-DLP')).toBeInTheDocument();
    expect(screen.getByText('Standard-Labels')).toBeInTheDocument();
  });

  it('shows placeholder when no template selected', async () => {
    render(<TemplatesPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Select a template/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('selects Healthcare-HIPAA template and shows detail', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));
    expect(screen.getAllByText(/HIPAA/i).length).toBeGreaterThanOrEqual(1);
  });

  it('selects PCI-DSS template and shows detail', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('PCI-DSS')).toBeInTheDocument();
    });
    await user.click(screen.getByText('PCI-DSS'));
    expect(screen.getAllByText(/PCI-DSS/i).length).toBeGreaterThanOrEqual(1);
  });

  it('has Deploy and Dry Run buttons for selected template', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('Dry Run')).toBeInTheDocument();
  });

  it('calls Deploy-SLTemplate with DryRun on dry run', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: { Status: 'DryRun' } });
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));
    await user.click(screen.getByText('Dry Run'));

    expect(mockInvoke).toHaveBeenCalledWith(
      'Deploy-SLTemplate', expect.objectContaining({ Name: 'Healthcare-HIPAA', DryRun: true })
    );
  });

  it('calls Deploy-SLTemplate without DryRun on deploy', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: { Status: 'Deployed' } });
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));
    await user.click(screen.getByText('Deploy'));

    expect(mockInvoke).toHaveBeenCalledWith(
      'Deploy-SLTemplate', expect.objectContaining({ Name: 'Healthcare-HIPAA' })
    );
    const deployCall = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'Deploy-SLTemplate' && !(c[1] as Record<string, unknown>)?.DryRun);
    expect(deployCall).toBeTruthy();
  });

  it('shows deploy error message', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));

    // Make deploy fail
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Compliance not connected' });
    await user.click(screen.getByText('Deploy'));

    await waitFor(() => {
      expect(screen.getByText('Compliance not connected')).toBeInTheDocument();
    });
  });

  it('shows dry run result after simulation', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));

    mockInvoke.mockResolvedValue({
      success: true,
      data: { TemplateName: 'Healthcare-HIPAA', Type: 'DLP', ItemsCreated: 3, Results: [] },
    });
    await user.click(screen.getByText('Dry Run'));

    await waitFor(() => {
      expect(screen.getByText('Dry Run Complete')).toBeInTheDocument();
    });
  });

  it('shows deploy success result', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));

    mockInvoke.mockResolvedValue({
      success: true,
      data: { TemplateName: 'Healthcare-HIPAA', Type: 'DLP', ItemsCreated: 3, Results: [] },
    });
    await user.click(screen.getByText('Deploy'));

    await waitFor(() => {
      expect(screen.getByText('Deployed Successfully')).toBeInTheDocument();
    });
  });

  it('shows template type badge (DLP/Labels)', async () => {
    render(<TemplatesPage />);
    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    // DLP templates should have DLP badge, Labels should have Labels badge
    expect(screen.getAllByText('DLP').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Labels').length).toBeGreaterThanOrEqual(1);
  });

  it('shows template count in empty state', async () => {
    render(<TemplatesPage />);
    await waitFor(() => {
      expect(screen.getByText(/5 compliance templates available/)).toBeInTheDocument();
    });
  });

  it('shows "What gets deployed" section for selected template', async () => {
    const user = userEvent.setup();
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthcare-HIPAA')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Healthcare-HIPAA'));
    expect(screen.getByText('What gets deployed')).toBeInTheDocument();
  });

  it('has Refresh Templates button', async () => {
    render(<TemplatesPage />);
    await waitFor(() => {
      expect(screen.getByText('Refresh Templates')).toBeInTheDocument();
    });
  });

  it('fetches templates on mount', async () => {
    render(<TemplatesPage />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('Get-SLTemplate');
    });
  });
});
