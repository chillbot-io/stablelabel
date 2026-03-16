import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LabelDetail from '../../../renderer/components/Labels/LabelDetail';
import { mockInvoke } from '../../setup';

const mockLabel = {
  id: 'label-guid-123',
  name: 'InternalName',
  displayName: 'Confidential Display',
  description: 'For confidential content',
  tooltip: 'Apply this to confidential documents',
  isActive: true,
  priority: 2,
  color: '#FF0000',
  parent: { id: 'parent-guid-456' },
  parentLabelId: 'parent-guid-456',
  contentFormats: ['File', 'Email'],
  autoLabeling: null,
};

const mockPolicies = [
  { Name: 'Global Policy', Labels: ['label-guid-123', 'other-label'] },
  { Name: 'Finance Policy', Labels: ['other-label-only'] },
  { Name: 'HR Policy', Labels: ['InternalName'] },
];

describe('LabelDetail', () => {
  const onOpenPolicy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('renders label details after successful fetch', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: mockPolicies });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    expect(screen.getByText('For confidential content')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('label-guid-123')).toBeInTheDocument();
    expect(screen.getByText('File, Email')).toBeInTheDocument();
    expect(screen.getByText('#FF0000')).toBeInTheDocument();

    // Verify commands
    expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("Get-SLLabel -Id 'label-guid-123'"));
    expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('Get-SLLabelPolicy'));
  });

  it('shows inactive badge for inactive labels', async () => {
    const inactiveLabel = { ...mockLabel, isActive: false };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: inactiveLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });

  it('shows tooltip section when tooltip exists', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Apply this to confidential documents')).toBeInTheDocument();
    });

    expect(screen.getByText('Tooltip (shown to users)')).toBeInTheDocument();
  });

  it('hides tooltip section when tooltip is null', async () => {
    const noTooltipLabel = { ...mockLabel, tooltip: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: noTooltipLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    expect(screen.queryByText('Tooltip (shown to users)')).not.toBeInTheDocument();
  });

  it('shows policies containing this label', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: mockPolicies });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    expect(screen.getByText('HR Policy')).toBeInTheDocument();
  });

  it('calls onOpenPolicy when clicking a policy button', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: mockPolicies });

    const user = userEvent.setup();
    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Global Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Global Policy'));
    expect(onOpenPolicy).toHaveBeenCalledWith('Global Policy');
  });

  it('shows "not found in any policies" when no matching policies', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [{ Name: 'Other', Labels: ['unrelated'] }] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText(/Not found in any label policies/)).toBeInTheDocument();
    });
  });

  it('shows error state when label fetch fails', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: false, data: null, error: 'Not authorized' })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Not authorized')).toBeInTheDocument();
    });
  });

  it('shows default error when no error string returned', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: false, data: null })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Label not found')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing an exception', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });
  });

  it('handles invoke throwing a non-Error', async () => {
    mockInvoke
      .mockRejectedValueOnce('string error')
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load label')).toBeInTheDocument();
    });
  });

  it('shows displayName over name when available', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });
  });

  it('shows name when displayName is null', async () => {
    const labelNoDisplay = { ...mockLabel, displayName: null, name: 'FallbackName' };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: labelNoDisplay })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      // The heading should show the name field as fallback
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('FallbackName');
    });
  });

  it('hides description when null', async () => {
    const noDescLabel = { ...mockLabel, description: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: noDescLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    expect(screen.queryByText('For confidential content')).not.toBeInTheDocument();
  });

  it('shows parent label field when parent exists', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Parent Label')).toBeInTheDocument();
    });

    expect(screen.getByText('parent-guid-456')).toBeInTheDocument();
  });

  it('hides parent label field when parent is null', async () => {
    const noParentLabel = { ...mockLabel, parent: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: noParentLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    expect(screen.queryByText('Parent Label')).not.toBeInTheDocument();
  });

  it('shows "All" when contentFormats is null', async () => {
    const noFormatsLabel = { ...mockLabel, contentFormats: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: noFormatsLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });
  });

  it('shows "None" when color is null', async () => {
    const noColorLabel = { ...mockLabel, color: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: noColorLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('None')).toBeInTheDocument();
    });
  });

  it('shows color swatch when color exists', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('#FF0000')).toBeInTheDocument();
    });

    const swatch = document.querySelector('[style*="background-color"]');
    expect(swatch).toBeInTheDocument();
  });

  it('shows priority value', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('toggles raw JSON section', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    const user = userEvent.setup();
    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    // Initially collapsed
    expect(screen.getByText(/▸ Show/)).toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText(/▸ Show/));
    expect(screen.getByText(/▾ Hide/)).toBeInTheDocument();

    const preElement = document.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.textContent).toContain('label-guid-123');

    // Click to collapse
    await user.click(screen.getByText(/▾ Hide/));
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });

  it('gracefully handles policy fetch failure (non-critical)', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockLabel })
      .mockRejectedValueOnce(new Error('Policy fetch failed'));

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    // Should still render the label, policies section shows empty
    expect(screen.getByText(/Not found in any label policies/)).toBeInTheDocument();
  });

  it('shows "N/A" for priority when null', async () => {
    const noPriorityLabel = { ...mockLabel, priority: null };
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: noPriorityLabel })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<LabelDetail labelId="label-guid-123" onOpenPolicy={onOpenPolicy} />);

    await waitFor(() => {
      expect(screen.getByText('Confidential Display')).toBeInTheDocument();
    });

    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThanOrEqual(1);
  });
});
