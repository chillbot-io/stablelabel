import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionLabelList from '../../../renderer/components/Retention/RetentionLabelList';
import { mockInvoke } from '../../setup';

const mockLabels = [
  {
    Name: 'Financial Records 7yr',
    Guid: 'guid-1',
    Comment: 'Financial retention',
    RetentionDuration: 2555,
    RetentionAction: 'Keep',
    RetentionType: 'CreationAgeInDays',
    IsRecordLabel: false,
    IsRegulatoryLabel: false,
    WhenCreated: '2024-01-01T00:00:00Z',
    WhenChanged: null,
  },
  {
    Name: 'HR Documents',
    Guid: 'guid-2',
    Comment: null,
    RetentionDuration: 365,
    RetentionAction: 'Delete',
    RetentionType: 'ModificationAgeInDays',
    IsRecordLabel: true,
    IsRegulatoryLabel: false,
    WhenCreated: '2024-02-01T00:00:00Z',
    WhenChanged: null,
  },
  {
    Name: 'Legal Hold',
    Guid: 'guid-3',
    Comment: null,
    RetentionDuration: 730,
    RetentionAction: 'KeepAndDelete',
    RetentionType: 'TaggedAgeInDays',
    IsRecordLabel: false,
    IsRegulatoryLabel: false,
    WhenCreated: '2024-03-01T00:00:00Z',
    WhenChanged: null,
  },
  {
    Name: 'Unknown Action Label',
    Guid: 'guid-4',
    Comment: null,
    RetentionDuration: null,
    RetentionAction: 'CustomAction',
    RetentionType: null,
    IsRecordLabel: false,
    IsRegulatoryLabel: false,
    WhenCreated: '2024-04-01T00:00:00Z',
    WhenChanged: null,
  },
  {
    Name: 'No Action Label',
    Guid: 'guid-5',
    Comment: null,
    RetentionDuration: null,
    RetentionAction: null,
    RetentionType: null,
    IsRecordLabel: false,
    IsRegulatoryLabel: false,
    WhenCreated: '2024-05-01T00:00:00Z',
    WhenChanged: null,
  },
];

describe('RetentionLabelList', () => {
  const onOpenLabel = vi.fn();
  const onNewLabel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(
      <RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />,
    );
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('displays labels after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });
    expect(screen.getByText('HR Documents')).toBeInTheDocument();
    expect(screen.getByText('Legal Hold')).toBeInTheDocument();
    expect(screen.getByText('5 retention labels')).toBeInTheDocument();
  });

  it('shows singular "label" when there is exactly one', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockLabels[0]] });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('1 retention label')).toBeInTheDocument();
    });
  });

  it('renders correct action badges', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Keep')).toBeInTheDocument();
    });
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Keep then Delete')).toBeInTheDocument();
    expect(screen.getByText('CustomAction')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows retention duration in days', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('2555 days')).toBeInTheDocument();
    });
    expect(screen.getByText('365 days')).toBeInTheDocument();
    expect(screen.getByText('730 days')).toBeInTheDocument();
  });

  it('shows Record badge for record labels', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Record')).toBeInTheDocument();
    });
  });

  it('calls onOpenLabel when a label is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Financial Records 7yr'));
    expect(onOpenLabel).toHaveBeenCalledWith('Financial Records 7yr');
  });

  it('calls onNewLabel when New Retention Label button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('+ New Retention Label')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Retention Label'));
    expect(onNewLabel).toHaveBeenCalledTimes(1);
  });

  it('refreshes when Refresh button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: [mockLabels[0]] });
    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByText('1 retention label')).toBeInTheDocument();
    });
    // Initial call + refresh
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('filters labels by search input', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search retention labels...'), 'HR');

    expect(screen.getByText('HR Documents')).toBeInTheDocument();
    expect(screen.queryByText('Financial Records 7yr')).not.toBeInTheDocument();
    expect(screen.queryByText('Legal Hold')).not.toBeInTheDocument();
  });

  it('shows "No retention labels found" when search yields no results', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search retention labels...'), 'zzzzz');
    expect(screen.getByText('No retention labels found.')).toBeInTheDocument();
  });

  it('shows empty state when no labels exist', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('No retention labels found.')).toBeInTheDocument();
    });
    expect(screen.getByText('0 retention labels')).toBeInTheDocument();
  });

  it('displays error when fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection timeout' });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('displays fallback error when fetch fails without error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load retention labels')).toBeInTheDocument();
    });
  });

  it('displays error when fetch throws an exception', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays fallback error when fetch throws a non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('retries fetch when Retry button is clicked on error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Oops' });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Oops')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });
  });

  it('sends the correct PowerShell command', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLRetentionLabel');
    });
  });

  it('is case-insensitive when searching', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabels });
    const user = userEvent.setup();
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search retention labels...'), 'financial');
    expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
  });

  it('handles non-array success data as error', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not an array' });
    render(<RetentionLabelList onOpenLabel={onOpenLabel} onNewLabel={onNewLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load retention labels')).toBeInTheDocument();
    });
  });
});
