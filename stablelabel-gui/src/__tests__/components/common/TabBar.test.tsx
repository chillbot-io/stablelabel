import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TabBar from '../../../renderer/components/common/TabBar';
import type { Tab } from '../../../renderer/components/common/TabBar';

const mockTabs: Tab[] = [
  { id: 'tab-1', label: 'Confidential', kind: 'label', dirty: false },
  { id: 'tab-2', label: 'DLP Policy A', kind: 'policy', dirty: true },
  { id: 'tab-3', label: 'Auto Label Rule', kind: 'autolabel', dirty: false },
];

describe('TabBar', () => {
  const defaultProps = {
    tabs: mockTabs,
    activeTabId: 'tab-1',
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when tabs is empty', () => {
    const { container } = render(<TabBar {...defaultProps} tabs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all tab labels', () => {
    render(<TabBar {...defaultProps} />);
    expect(screen.getByText('Confidential')).toBeInTheDocument();
    expect(screen.getByText('DLP Policy A')).toBeInTheDocument();
    expect(screen.getByText('Auto Label Rule')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(<TabBar {...defaultProps} />);
    const activeTab = screen.getByText('Confidential').closest('div');
    expect(activeTab?.className).toContain('bg-white/[0.04]');
  });

  it('applies inactive styling to non-active tabs', () => {
    render(<TabBar {...defaultProps} />);
    const inactiveTab = screen.getByText('DLP Policy A').closest('div');
    expect(inactiveTab?.className).not.toContain('bg-white/[0.04]');
  });

  it('shows dirty indicator for dirty tabs', () => {
    const { container } = render(<TabBar {...defaultProps} />);
    // Dirty tab (tab-2) should have a white dot
    const dirtyDots = container.querySelectorAll('.bg-white');
    expect(dirtyDots.length).toBe(1);
  });

  it('does not show dirty indicator for clean tabs', () => {
    render(<TabBar {...defaultProps} tabs={[{ id: 'tab-1', label: 'Clean Tab', kind: 'label', dirty: false }]} />);
    const { container } = render(<TabBar {...defaultProps} tabs={[{ id: 'tab-1', label: 'Clean Tab', kind: 'label' }]} />);
    // No dirty indicator
    const whiteDots = container.querySelectorAll('.bg-white');
    expect(whiteDots.length).toBe(0);
  });

  it('calls onSelect when tab is clicked', async () => {
    const user = userEvent.setup();
    render(<TabBar {...defaultProps} />);
    await user.click(screen.getByText('DLP Policy A'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith('tab-2');
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<TabBar {...defaultProps} />);
    const closeButtons = screen.getAllByTitle('Close tab');
    await user.click(closeButtons[1]); // Close second tab
    expect(defaultProps.onClose).toHaveBeenCalledWith('tab-2');
  });

  it('does not call onSelect when close button is clicked (stopPropagation)', async () => {
    const user = userEvent.setup();
    render(<TabBar {...defaultProps} />);
    const closeButtons = screen.getAllByTitle('Close tab');
    await user.click(closeButtons[0]);
    expect(defaultProps.onClose).toHaveBeenCalledWith('tab-1');
    expect(defaultProps.onSelect).not.toHaveBeenCalled();
  });

  it('renders color dot for each tab kind', () => {
    const { container } = render(<TabBar {...defaultProps} />);
    const blueDots = container.querySelectorAll('.bg-blue-400');
    const violetDots = container.querySelectorAll('.bg-violet-400');
    const tealDots = container.querySelectorAll('.bg-teal-400');
    expect(blueDots.length).toBe(1); // label
    expect(violetDots.length).toBe(1); // policy
    expect(tealDots.length).toBe(1); // autolabel
  });

  it('renders gray dot for unknown kind', () => {
    const tabs: Tab[] = [{ id: 'unknown', label: 'Unknown', kind: 'unknown' }];
    const { container } = render(<TabBar {...defaultProps} tabs={tabs} />);
    const grayDots = container.querySelectorAll('.bg-zinc-500');
    expect(grayDots.length).toBe(1);
  });

  it('renders all known kind colors', () => {
    const allKinds: Tab[] = [
      { id: '1', label: 'Label', kind: 'label' },
      { id: '2', label: 'Policy', kind: 'policy' },
      { id: '3', label: 'AutoLabel', kind: 'autolabel' },
      { id: '4', label: 'Retention', kind: 'retention' },
      { id: '5', label: 'DLP', kind: 'dlp' },
      { id: '6', label: 'Rule', kind: 'rule' },
      { id: '7', label: 'SIT', kind: 'sit' },
    ];
    const { container } = render(<TabBar {...defaultProps} tabs={allKinds} />);
    expect(container.querySelectorAll('.bg-blue-400').length).toBe(1);
    expect(container.querySelectorAll('.bg-violet-400').length).toBe(1);
    expect(container.querySelectorAll('.bg-teal-400').length).toBe(1);
    expect(container.querySelectorAll('.bg-amber-400').length).toBe(1);
    expect(container.querySelectorAll('.bg-red-400').length).toBe(1);
    expect(container.querySelectorAll('.bg-orange-400').length).toBe(1);
    expect(container.querySelectorAll('.bg-yellow-400').length).toBe(1);
  });

  it('handles null activeTabId', () => {
    render(<TabBar {...defaultProps} activeTabId={null} />);
    // All tabs should be inactive
    const tab1 = screen.getByText('Confidential').closest('div');
    expect(tab1?.className).not.toContain('bg-white/[0.04]');
  });
});
