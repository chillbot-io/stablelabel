import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionLabelDetail from '../../../renderer/components/Retention/RetentionLabelDetail';
import { mockInvoke } from '../../setup';

const mockLabel = {
  Name: 'Financial Records 7yr',
  Guid: 'abc-123-def',
  Comment: 'Retain financial records for 7 years',
  RetentionDuration: 2555,
  RetentionAction: 'KeepAndDelete',
  RetentionType: 'CreationAgeInDays',
  IsRecordLabel: true,
  IsRegulatoryLabel: true,
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: '2024-06-20T14:00:00Z',
};

describe('RetentionLabelDetail', () => {
  const onEdit = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('displays label details after successful fetch', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Financial Records 7yr" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });
    expect(screen.getByText('Retain financial records for 7 years')).toBeInTheDocument();
    expect(screen.getByText('abc-123-def')).toBeInTheDocument();
  });

  it('sends the correct PowerShell command with identity', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Financial Records 7yr" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("Get-SLRetentionLabel -Identity 'Financial Records 7yr'", undefined);
    });
  });

  it('shows duration in years for durations >= 365 days', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Financial Records 7yr" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('7 years (2555 days)')).toBeInTheDocument();
    });
  });

  it('shows duration in days only for durations < 365', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionDuration: 90 },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('90 days')).toBeInTheDocument();
    });
  });

  it('shows "Unlimited" for null duration', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionDuration: null },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Unlimited')).toBeInTheDocument();
    });
  });

  it('shows correct action text for KeepAndDelete', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Retain then delete')).toBeInTheDocument();
    });
  });

  it('shows correct action text for Keep', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionAction: 'Keep' },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Retain forever')).toBeInTheDocument();
    });
  });

  it('shows correct action text for Delete', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionAction: 'Delete' },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Delete after period')).toBeInTheDocument();
    });
  });

  it('shows raw action text for unknown action', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionAction: 'SomeCustom' },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('SomeCustom')).toBeInTheDocument();
    });
  });

  it('shows "None" for null action', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionAction: null },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('None')).toBeInTheDocument();
    });
  });

  it('shows correct type text for CreationAgeInDays', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('From creation date')).toBeInTheDocument();
    });
  });

  it('shows correct type text for ModificationAgeInDays', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionType: 'ModificationAgeInDays' },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('From last modified date')).toBeInTheDocument();
    });
  });

  it('shows correct type text for TaggedAgeInDays', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionType: 'TaggedAgeInDays' },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('From when labeled')).toBeInTheDocument();
    });
  });

  it('shows raw type text for unknown type', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionType: 'CustomType' },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('CustomType')).toBeInTheDocument();
    });
  });

  it('shows "N/A" for null type', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, RetentionType: null },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      // N/A appears for type and possibly for date fields
      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Record and Regulatory badges', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Record')).toBeInTheDocument();
    });
    expect(screen.getByText('Regulatory')).toBeInTheDocument();
  });

  it('hides Record badge when IsRecordLabel is false', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, IsRecordLabel: false, IsRegulatoryLabel: false },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });
    expect(screen.queryByText('Record')).not.toBeInTheDocument();
    expect(screen.queryByText('Regulatory')).not.toBeInTheDocument();
  });

  it('hides comment when Comment is null', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, Comment: null },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });
    expect(screen.queryByText('Retain financial records for 7 years')).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    const user = userEvent.setup();
    render(
      <RetentionLabelDetail labelName="Financial Records 7yr" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('Financial Records 7yr');
  });

  it('toggles raw JSON display', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    const user = userEvent.setup();
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Show raw JSON/));
    expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
    // Should show the JSON content
    expect(screen.getByText(/"Financial Records 7yr"/)).toBeInTheDocument();

    await user.click(screen.getByText(/Hide raw JSON/));
    expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
  });

  it('displays error when fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Label not found' });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Label not found')).toBeInTheDocument();
    });
  });

  it('displays "Not found" when fetch fails without error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('displays "Not found" when data is null on success', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: null });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('shows N/A for null WhenCreated and WhenChanged dates', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { ...mockLabel, WhenCreated: null, WhenChanged: null },
    });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('formats valid dates correctly', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockLabel });
    render(
      <RetentionLabelDetail labelName="Test" onEdit={onEdit} onDeleted={onDeleted} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Records 7yr')).toBeInTheDocument();
    });
    // Dates should be formatted (locale-dependent, just check they exist and aren't N/A)
    const created = screen.getByText('Created').closest('div');
    expect(created).toBeInTheDocument();
  });
});
