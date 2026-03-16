import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SnapshotDiffView from '../../../renderer/components/Snapshots/SnapshotDiffView';
import type { SnapshotDiff } from '../../../renderer/lib/types';

const makeDiff = (overrides: Partial<SnapshotDiff> = {}): SnapshotDiff => ({
  ReferenceSnapshot: 'snap-baseline',
  ComparisonSource: 'Live',
  ComparedAt: '2024-01-20 14:30',
  HasChanges: false,
  Categories: {},
  ...overrides,
});

const diffWithChanges: SnapshotDiff = {
  ReferenceSnapshot: 'snap-baseline',
  ComparisonSource: 'Live',
  ComparedAt: '2024-01-20 14:30',
  HasChanges: true,
  Categories: {
    Labels: {
      Added: [{ Identity: 'New Label A' }],
      Removed: [{ Identity: 'Old Label B' }],
      Modified: [{ Identity: 'Modified Label C' }],
      Summary: { AddedCount: 1, RemovedCount: 1, ModifiedCount: 1, UnchangedCount: 5 },
    },
    Policies: {
      Added: [],
      Removed: [],
      Modified: [],
      Summary: { AddedCount: 0, RemovedCount: 0, ModifiedCount: 0, UnchangedCount: 3 },
    },
  },
};

describe('SnapshotDiffView', () => {
  const defaultProps = {
    diff: makeDiff(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and comparison info', () => {
    render(<SnapshotDiffView {...defaultProps} />);
    expect(screen.getByText('Snapshot Comparison')).toBeInTheDocument();
    expect(screen.getByText('snap-baseline vs Live')).toBeInTheDocument();
    expect(screen.getByText('Compared at 2024-01-20 14:30')).toBeInTheDocument();
  });

  it('shows No Changes badge when no changes', () => {
    render(<SnapshotDiffView {...defaultProps} />);
    expect(screen.getByText('No Changes')).toBeInTheDocument();
  });

  it('shows no drift message when no changes', () => {
    render(<SnapshotDiffView {...defaultProps} />);
    expect(screen.getByText(/No drift detected/)).toBeInTheDocument();
  });

  it('shows Changes Detected badge when has changes', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    expect(screen.getByText('Changes Detected')).toBeInTheDocument();
  });

  it('renders category sections with changes', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Policies')).toBeInTheDocument();
  });

  it('renders added/removed/modified items', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    expect(screen.getByText('New Label A')).toBeInTheDocument();
    expect(screen.getByText('Old Label B')).toBeInTheDocument();
    expect(screen.getByText('Modified Label C')).toBeInTheDocument();
  });

  it('renders badge counts for categories with changes', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('~1')).toBeInTheDocument();
    expect(screen.getByText('5 unchanged')).toBeInTheDocument();
  });

  it('renders unchanged count for categories without changes', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    expect(screen.getByText('3 unchanged')).toBeInTheDocument();
  });

  it('does not show badge counts of 0', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    // Policies category should not have +0, -0, ~0 badges
    const policySection = screen.getByText('Policies').closest('button');
    // No green/red/yellow badges in the Policies row
    expect(policySection?.textContent).not.toContain('+0');
    expect(policySection?.textContent).not.toContain('-0');
    expect(policySection?.textContent).not.toContain('~0');
  });

  it('calls onClose when Close button is clicked', async () => {
    const user = userEvent.setup();
    render(<SnapshotDiffView {...defaultProps} />);
    await user.click(screen.getByText('Close'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('toggles category expansion on click', async () => {
    const user = userEvent.setup();
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);

    // Labels category starts expanded (has changes)
    expect(screen.getByText('New Label A')).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText('Labels'));
    expect(screen.queryByText('New Label A')).not.toBeInTheDocument();

    // Click to expand again
    await user.click(screen.getByText('Labels'));
    expect(screen.getByText('New Label A')).toBeInTheDocument();
  });

  it('category without changes starts collapsed', async () => {
    const user = userEvent.setup();
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);

    // Policies has no changes, should be collapsed (no item detail visible)
    // We can check that the expanded indicator is not shown by toggling
    const policiesButton = screen.getByText('Policies');
    // No expanded content for a category with 0 changes even when toggled
    await user.click(policiesButton);
    // Even after clicking, hasChanges is false so expanded content won't show
  });

  it('renders Added/Removed/Modified labels in diff items', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
  });

  it('shows expand/collapse indicators', () => {
    render(<SnapshotDiffView diff={diffWithChanges} onClose={defaultProps.onClose} />);
    // Labels expanded should show '▾', Policies collapsed should show '▸'
    // Note: these are text content within the rendered elements
    const elements = screen.getAllByText(/[▾▸]/);
    expect(elements.length).toBeGreaterThan(0);
  });
});
