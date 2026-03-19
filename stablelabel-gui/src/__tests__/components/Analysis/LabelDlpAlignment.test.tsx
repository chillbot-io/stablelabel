import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabelDlpAlignment from '../../../renderer/components/Analysis/LabelDlpAlignment';
import { mockInvoke } from '../../setup';

const fullyAlignedResult = {
  LabelsChecked: 5,
  AlignedLabels: [
    { LabelId: 'id-1', LabelName: 'Confidential', DlpRule: 'Block Confidential' },
    { LabelId: 'id-2', LabelName: 'Internal', DlpRule: 'Warn Internal' },
  ],
  UnprotectedLabels: [],
  Recommendations: [],
};

const gapsResult = {
  LabelsChecked: 8,
  AlignedLabels: [
    { LabelId: 'id-1', LabelName: 'Confidential', DlpRule: 'Block Confidential' },
  ],
  UnprotectedLabels: [
    { LabelId: 'id-3', LabelName: 'Public' },
    { LabelId: 'id-4', LabelName: 'Personal' },
  ],
  Recommendations: [
    'Create DLP rule for Public label',
    'Review Personal label protection needs',
  ],
};

describe('LabelDlpAlignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<LabelDlpAlignment />);
    expect(screen.getByText('Label-DLP Alignment')).toBeInTheDocument();
    expect(screen.getByText(/Check which sensitivity labels are backed by DLP rules/)).toBeInTheDocument();
  });

  it('renders Check Alignment button', () => {
    render(<LabelDlpAlignment />);
    expect(screen.getByText('Check Alignment')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('calls invoke with correct command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullyAlignedResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));
    expect(mockInvoke).toHaveBeenCalledWith('Test-SLLabelDlpAlignment', undefined);
  });

  it('displays summary counts for fully aligned result', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullyAlignedResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // Checked
    });
    expect(screen.getByText('2')).toBeInTheDocument(); // Aligned
    expect(screen.getByText('Checked')).toBeInTheDocument();
    expect(screen.getByText('Aligned')).toBeInTheDocument();
    expect(screen.getByText('Unprotected')).toBeInTheDocument();
  });

  it('displays aligned labels section', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullyAlignedResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Aligned Labels')).toBeInTheDocument();
    });
    expect(screen.getByText('Confidential')).toBeInTheDocument();
    expect(screen.getByText('Block Confidential')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByText('Warn Internal')).toBeInTheDocument();
  });

  it('does not display aligned labels section when empty', async () => {
    const user = userEvent.setup();
    const result = { ...fullyAlignedResult, AlignedLabels: [] };
    mockInvoke.mockResolvedValue({ success: true, data: result });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Checked')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aligned Labels')).not.toBeInTheDocument();
  });

  it('displays unprotected labels section with gaps', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: gapsResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Unprotected Labels')).toBeInTheDocument();
    });
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('does not display unprotected labels section when empty', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullyAlignedResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Aligned Labels')).toBeInTheDocument();
    });
    expect(screen.queryByText('Unprotected Labels')).not.toBeInTheDocument();
  });

  it('displays recommendations section', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: gapsResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Recommendations')).toBeInTheDocument();
    });
    expect(screen.getByText('Create DLP rule for Public label')).toBeInTheDocument();
    expect(screen.getByText('Review Personal label protection needs')).toBeInTheDocument();
  });

  it('does not display recommendations section when empty', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: fullyAlignedResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Aligned Labels')).toBeInTheDocument();
    });
    expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
  });

  it('shows unprotected count with yellow styling when > 0', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: gapsResult });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // unprotected count
    });
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Not connected' });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Oops'));
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Oops')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(false);
    render(<LabelDlpAlignment />);

    await user.click(screen.getByText('Check Alignment'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('does not display results before running', () => {
    render(<LabelDlpAlignment />);
    expect(screen.queryByText('Checked')).not.toBeInTheDocument();
  });
});
