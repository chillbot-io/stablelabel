import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabelList from '../../../renderer/components/Labels/LabelList';
import { mockInvoke } from '../../setup';

const mockTreeData = [
  {
    Id: 'id-1',
    Name: 'Confidential',
    Tooltip: 'Confidential tooltip',
    IsActive: true,
    SubLabels: [
      { Id: 'id-1a', Name: 'All Employees', Tooltip: 'Sub tooltip', IsActive: true },
      { Id: 'id-1b', Name: 'Finance Only', Tooltip: null, IsActive: false },
    ],
  },
  {
    Id: 'id-2',
    Name: 'Public',
    Tooltip: null,
    IsActive: false,
    SubLabels: [],
  },
  {
    Id: 'id-3',
    Name: 'Internal',
    Tooltip: 'Internal use',
    IsActive: true,
    SubLabels: [],
  },
];

describe('LabelList', () => {
  const onOpenLabel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    // Never resolve so it stays loading
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<LabelList onOpenLabel={onOpenLabel} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(5);
  });

  it('renders label tree after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();

    // Count display
    expect(screen.getByText(/3 labels/)).toBeInTheDocument();
    expect(screen.getByText(/2 sublabels/)).toBeInTheDocument();

    // Calls correct command
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabel -Tree', undefined);
  });

  it('shows inactive badge for inactive labels', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Public')).toBeInTheDocument();
    });

    // Public is inactive, should show 'inactive' badge
    const inactiveBadges = screen.getAllByText('inactive');
    expect(inactiveBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-expands parents with sublabels', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    // Sublabels should be visible because parent is auto-expanded
    expect(screen.getByText('All Employees')).toBeInTheDocument();
    expect(screen.getByText('Finance Only')).toBeInTheDocument();
  });

  it('toggles expand/collapse on parent click', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('All Employees')).toBeInTheDocument();
    });

    // Click the collapse toggle (the ▾ button)
    const collapseButton = screen.getByText('▾');
    await user.click(collapseButton);

    // Sublabels should be hidden
    expect(screen.queryByText('All Employees')).not.toBeInTheDocument();

    // Click again to expand
    const expandButton = screen.getByText('▸');
    await user.click(expandButton);

    expect(screen.getByText('All Employees')).toBeInTheDocument();
  });

  it('calls onOpenLabel when clicking a parent label', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Confidential'));
    expect(onOpenLabel).toHaveBeenCalledWith('id-1', 'Confidential');
  });

  it('calls onOpenLabel with composite name when clicking a sublabel', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('All Employees')).toBeInTheDocument();
    });

    await user.click(screen.getByText('All Employees'));
    expect(onOpenLabel).toHaveBeenCalledWith('id-1a', 'Confidential / All Employees');
  });

  it('shows error state and Retry button on fetch failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows default error message when no error string returned', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load labels')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an exception', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load labels')).toBeInTheDocument();
    });
  });

  it('retries fetch when Retry button is clicked', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Fail' });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Fail')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockTreeData });
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });
  });

  it('refreshes labels when Refresh Labels button is clicked', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    const updatedTree = [{ Id: 'id-4', Name: 'New Label', Tooltip: null, IsActive: true, SubLabels: [] }];
    mockInvoke.mockResolvedValueOnce({ success: true, data: updatedTree });
    await user.click(screen.getByText('Refresh Labels'));

    await waitFor(() => {
      expect(screen.getByText('New Label')).toBeInTheDocument();
    });
  });

  it('filters labels by search query', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search labels...');
    await user.type(searchInput, 'Public');

    // Only Public should remain
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
  });

  it('filters by sublabel name and shows parent', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search labels...');
    await user.type(searchInput, 'Finance');

    // Confidential parent should show since it has matching sublabel
    expect(screen.getByText('Confidential')).toBeInTheDocument();
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
  });

  it('shows "No labels found" when filter matches nothing', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search labels...');
    await user.type(searchInput, 'zzzznonexistent');

    expect(screen.getByText('No labels found.')).toBeInTheDocument();
  });

  it('highlights matching search text', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    const user = userEvent.setup();
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search labels...');
    await user.type(searchInput, 'conf');

    // The highlight span should exist with 'Conf' text
    const highlight = document.querySelector('.bg-yellow-500\\/30');
    expect(highlight).toBeInTheDocument();
    expect(highlight?.textContent).toBe('Conf');
  });

  it('shows sublabel count on parent items', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTreeData });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    // Confidential has 2 sublabels
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows empty tree when data is empty array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('No labels found.')).toBeInTheDocument();
    });

    expect(screen.getByText(/0 labels/)).toBeInTheDocument();
  });

  it('handles result.data being non-array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not an array' });
    render(<LabelList onOpenLabel={onOpenLabel} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load labels')).toBeInTheDocument();
    });
  });
});
