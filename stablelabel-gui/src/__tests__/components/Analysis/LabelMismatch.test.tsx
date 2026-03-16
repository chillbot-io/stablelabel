import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabelMismatch from '../../../renderer/components/Analysis/LabelMismatch';
import { mockInvoke } from '../../setup';

const noMismatchResult = {
  InGraphOnly: [],
  InPolicyOnly: [],
  Matched: 10,
  TotalGraphLabels: 10,
  TotalPolicyReferences: 10,
};

const mismatchResult = {
  InGraphOnly: [
    { LabelId: 'id-1', LabelName: 'Orphan Label A' },
    { LabelId: 'id-2', LabelName: 'Orphan Label B' },
  ],
  InPolicyOnly: [
    { Reference: 'ref-abc', PolicyName: 'Policy X' },
  ],
  Matched: 8,
  TotalGraphLabels: 10,
  TotalPolicyReferences: 9,
};

describe('LabelMismatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<LabelMismatch />);
    expect(screen.getByText('Label Mismatch')).toBeInTheDocument();
    expect(screen.getByText(/Find labels that exist in Graph but not in policies/)).toBeInTheDocument();
  });

  it('renders Check Mismatches button', () => {
    render(<LabelMismatch />);
    expect(screen.getByText('Check Mismatches')).toBeInTheDocument();
  });

  it('shows loading state when running', async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('calls invoke with correct command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: noMismatchResult });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabelMismatch');
  });

  it('shows all-matched message when no mismatches', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: noMismatchResult });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText(/All labels are properly matched/)).toBeInTheDocument();
    });
    expect(screen.getByText('10 labels aligned')).toBeInTheDocument();
  });

  it('displays Graph Only section with mismatches', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mismatchResult });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Graph Only (2)')).toBeInTheDocument();
    });
    expect(screen.getByText(/Labels in Graph API but not referenced/)).toBeInTheDocument();
    expect(screen.getByText('Orphan Label A')).toBeInTheDocument();
    expect(screen.getByText('Orphan Label B')).toBeInTheDocument();
  });

  it('displays Policy Only section with mismatches', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mismatchResult });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Policy Only (1)')).toBeInTheDocument();
    });
    expect(screen.getByText(/Labels referenced by policies but not found in Graph/)).toBeInTheDocument();
    expect(screen.getByText('ref-abc')).toBeInTheDocument();
    expect(screen.getByText('Policy X')).toBeInTheDocument();
  });

  it('displays summary stats when mismatches exist', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mismatchResult });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('8 matched | 10 in Graph | 9 in policies')).toBeInTheDocument();
    });
  });

  it('does not display Graph Only section when empty', async () => {
    const user = userEvent.setup();
    const result = { ...mismatchResult, InGraphOnly: [] };
    mockInvoke.mockResolvedValue({ success: true, data: result });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Policy Only (1)')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Graph Only/)).not.toBeInTheDocument();
  });

  it('does not display Policy Only section when empty', async () => {
    const user = userEvent.setup();
    const result = { ...mismatchResult, InPolicyOnly: [] };
    mockInvoke.mockResolvedValue({ success: true, data: result });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Graph Only (2)')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Policy Only/)).not.toBeInTheDocument();
  });

  it('shows error on failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false, error: 'Not authenticated' });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });

  it('shows fallback error on failure without message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: false });
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error on exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error('Net error'));
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Net error')).toBeInTheDocument();
    });
  });

  it('shows fallback error on non-Error exception', async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(0);
    render(<LabelMismatch />);

    await user.click(screen.getByText('Check Mismatches'));

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('does not display results before running', () => {
    render(<LabelMismatch />);
    expect(screen.queryByText(/labels aligned/)).not.toBeInTheDocument();
    expect(screen.queryByText('Graph Only')).not.toBeInTheDocument();
  });
});
