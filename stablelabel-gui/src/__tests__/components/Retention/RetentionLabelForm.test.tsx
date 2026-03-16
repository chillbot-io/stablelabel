import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionLabelForm from '../../../renderer/components/Retention/RetentionLabelForm';
import { mockInvoke } from '../../setup';

const existingLabel = {
  Name: 'Financial Records 7yr',
  Guid: 'abc-123-def',
  Comment: 'Financial retention',
  RetentionDuration: 2555,
  RetentionAction: 'KeepAndDelete',
  RetentionType: 'CreationAgeInDays',
  IsRecordLabel: false,
  IsRegulatoryLabel: false,
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: null,
};

describe('RetentionLabelForm', () => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New label mode', () => {
    it('renders new label form with correct title', () => {
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('New Retention Label')).toBeInTheDocument();
      expect(screen.getByText('Define how long content should be retained and what happens after.')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Label Name')).toBeInTheDocument();
      expect(screen.getByText('Comment')).toBeInTheDocument();
      expect(screen.getByText('Duration (days)')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
      expect(screen.getByText('Based On')).toBeInTheDocument();
    });

    it('shows Create Label button for new labels', () => {
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Create Label')).toBeInTheDocument();
    });

    it('does not show Delete button for new labels', () => {
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Create Label'));
      expect(screen.getByText('Label name is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('submits new label with only name', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), 'Test Label');
      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "New-SLRetentionLabel -Name 'Test Label' -Confirm:$false",
        );
      });
      expect(onSaved).toHaveBeenCalledWith('Test Label');
    });

    it('submits new label with all fields', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), 'My Label');
      await user.type(screen.getByPlaceholderText('Describe the retention requirement...'), 'A comment');
      await user.type(screen.getByPlaceholderText('e.g., 2555'), '365');
      // There are two "Select..." dropdowns: Action and Based On
      const selects = screen.getAllByDisplayValue('Select...');
      await user.selectOptions(selects[0], 'Keep');
      await user.selectOptions(selects[1], 'CreationAgeInDays');

      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled();
      });
      const call = mockInvoke.mock.calls[0][0] as string;
      expect(call).toContain("New-SLRetentionLabel -Name 'My Label'");
      expect(call).toContain("-Comment 'A comment'");
      expect(call).toContain('-RetentionDuration 365');
      expect(call).toContain("-Confirm:$false");
    });

    it('handles save failure with error message', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Name already exists' });
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), 'Test Label');
      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(screen.getByText('Name already exists')).toBeInTheDocument();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('handles save failure without error message', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null });
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), 'Test Label');
      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('handles save exception with Error object', async () => {
      mockInvoke.mockRejectedValue(new Error('Network down'));
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), 'Test Label');
      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(screen.getByText('Network down')).toBeInTheDocument();
      });
    });

    it('handles save exception with non-Error', async () => {
      mockInvoke.mockRejectedValue('some string');
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), 'Test Label');
      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('escapes single quotes in name', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<RetentionLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Financial Records - 7 Year'), "O'Brien's Label");
      await user.click(screen.getByText('Create Label'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          expect.stringContaining("O''Brien''s Label"),
        );
      });
    });
  });

  describe('Edit label mode', () => {
    it('renders edit form with correct title', () => {
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText('Edit: Financial Records 7yr')).toBeInTheDocument();
      expect(screen.getByText('Modify this retention label.')).toBeInTheDocument();
    });

    it('pre-fills form with existing data', () => {
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByDisplayValue('Financial Records 7yr')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Financial retention')).toBeInTheDocument();
    });

    it('shows Save Changes button for existing labels', () => {
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('shows Delete button for existing labels', () => {
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows note about unchangeable fields', () => {
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText(/cannot be changed after creation/)).toBeInTheDocument();
    });

    it('submits edit with changed comment', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      const commentField = screen.getByDisplayValue('Financial retention');
      await user.clear(commentField);
      await user.type(commentField, 'Updated comment');
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "Set-SLRetentionLabel -Identity 'Financial Records 7yr' -Comment 'Updated comment' -Confirm:$false",
        );
      });
      expect(onSaved).toHaveBeenCalledWith('Financial Records 7yr');
    });

    it('submits edit with no changes (minimal command)', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "Set-SLRetentionLabel -Identity 'Financial Records 7yr' -Confirm:$false",
        );
      });
    });

    describe('Delete flow', () => {
      it('shows confirm dialog when Delete is clicked', async () => {
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        expect(screen.getByText('Delete Retention Label')).toBeInTheDocument();
        expect(screen.getByText(/Permanently delete "Financial Records 7yr"/)).toBeInTheDocument();
        expect(screen.getByText('Delete Label')).toBeInTheDocument();
      });

      it('cancels delete when cancel is clicked in confirm dialog', async () => {
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        expect(screen.getByText('Delete Retention Label')).toBeInTheDocument();

        // The ConfirmDialog has a Cancel button
        const cancelButtons = screen.getAllByText('Cancel');
        // Click the dialog cancel (last one)
        await user.click(cancelButtons[cancelButtons.length - 1]);

        expect(screen.queryByText('Delete Retention Label')).not.toBeInTheDocument();
      });

      it('deletes label when confirmed', async () => {
        mockInvoke.mockResolvedValue({ success: true, data: null });
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Label'));

        await waitFor(() => {
          expect(mockInvoke).toHaveBeenCalledWith(
            "Remove-SLRetentionLabel -Identity 'Financial Records 7yr' -Confirm:$false",
          );
        });
        expect(onDeleted).toHaveBeenCalledTimes(1);
      });

      it('shows error when delete fails with error message', async () => {
        mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Label in use' });
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Label'));

        await waitFor(() => {
          expect(screen.getByText('Label in use')).toBeInTheDocument();
        });
        expect(onDeleted).not.toHaveBeenCalled();
      });

      it('shows fallback error when delete fails without error message', async () => {
        mockInvoke.mockResolvedValue({ success: false, data: null });
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Label'));

        await waitFor(() => {
          expect(screen.getByText('Delete failed')).toBeInTheDocument();
        });
      });

      it('handles delete exception with Error object', async () => {
        mockInvoke.mockRejectedValue(new Error('Permission denied'));
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Label'));

        await waitFor(() => {
          expect(screen.getByText('Permission denied')).toBeInTheDocument();
        });
      });

      it('handles delete exception with non-Error', async () => {
        mockInvoke.mockRejectedValue('some string');
        const user = userEvent.setup();
        render(
          <RetentionLabelForm existing={existingLabel} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Label'));

        await waitFor(() => {
          expect(screen.getByText('Delete failed')).toBeInTheDocument();
        });
      });
    });
  });

  describe('with null existing label', () => {
    it('treats null existing as new label', () => {
      render(
        <RetentionLabelForm existing={null} onSaved={onSaved} onCancel={onCancel} />,
      );
      expect(screen.getByText('New Retention Label')).toBeInTheDocument();
    });
  });
});
