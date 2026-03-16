import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabelReport from '../../../renderer/components/Analysis/LabelReport';
import { mockInvoke } from '../../setup';

const fullReport = {
  TotalLabels: 20,
  ActiveLabels: 15,
  InactiveLabels: 5,
  ParentLabels: 4,
  SubLabels: 16,
  PoliciesUsingLabels: [
    { PolicyName: 'Global Policy', LabelCount: 12 },
    { PolicyName: 'IT Policy', LabelCount: 1 },
  ],
  UnassignedLabels: ['Draft Label', 'Test Label'],
};

const cleanReport = {
  TotalLabels: 10,
  ActiveLabels: 10,
  InactiveLabels: 0,
  ParentLabels: 2,
  SubLabels: 8,
  PoliciesUsingLabels: [],
  UnassignedLabels: [],
};

describe('LabelReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<LabelReport />);
    expect(screen.getByText('Label Report')).toBeInTheDocument();
    expect(screen.getByText(/Comprehensive summary of sensitivity labels/)).toBeInTheDocument();
  });

  it('renders Generate Report button', () => {
    render(<LabelReport />);
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));
    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('calls invoke with correct command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabelReport');
  });

  it('displays stat cards', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Parents')).toBeInTheDocument();
    expect(screen.getByText('Sub-labels')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('displays policies using labels section', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Policies Using Labels')).toBeInTheDocument();
    });
    expect(screen.getByText('Global Policy')).toBeInTheDocument();
    expect(screen.getByText('12 labels')).toBeInTheDocument();
    expect(screen.getByText('IT Policy')).toBeInTheDocument();
    expect(screen.getByText('1 label')).toBeInTheDocument(); // singular
  });

  it('does not display policies section when empty', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: cleanReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
    expect(screen.queryByText('Policies Using Labels')).not.toBeInTheDocument();
  });

  it('displays unassigned labels section', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Unassigned Labels (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('Draft Label')).toBeInTheDocument();
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('does not display unassigned labels section when empty', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: cleanReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Unassigned Labels/)).not.toBeInTheDocument();
  });

  it('toggles raw JSON view', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    });

    // Show JSON
    await user.click(screen.getByText(/Show raw JSON/));
    expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
    // The pre element should contain JSON
    const pre = screen.getByText(/"TotalLabels"/);
    expect(pre).toBeInTheDocument();

    // Hide JSON
    await user.click(screen.getByText(/Hide raw JSON/));
    expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    expect(screen.queryByText(/"TotalLabels"/)).not.toBeInTheDocument();
  });

  it('applies green color to Active stat', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    const activeValue = screen.getByText('15');
    expect(activeValue.className).toContain('text-green-400');
  });

  it('applies yellow color to Inactive stat when > 0', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    const inactiveValue = screen.getByText('5');
    expect(inactiveValue.className).toContain('text-yellow-400');
  });

  it('applies default color to Inactive stat when 0', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: cleanReport });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    // Inactive is 0, should use default gray color
    const inactiveCard = screen.getByText('Inactive').closest('div');
    const valueElement = inactiveCard?.querySelector('dd');
    expect(valueElement?.className).toContain('text-gray-200');
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Auth error' });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Auth error')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Timeout'));
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue({});
    render(<LabelReport />);

    await user.click(screen.getByText('Generate Report'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('does not display results before running', () => {
    render(<LabelReport />);
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });
});
