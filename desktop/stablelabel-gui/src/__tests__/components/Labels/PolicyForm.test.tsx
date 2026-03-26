import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyForm from '../../../renderer/components/Labels/PolicyForm';
import { mockInvoke } from '../../setup';

const mockExisting = {
  Name: 'Global Policy',
  Guid: 'guid-abc-123',
  Labels: ['Confidential', 'Public'],
  Comment: 'Default org policy',
  Enabled: true,
  CreatedBy: 'admin@contoso.com',
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: null,
  Mode: null,
  Type: null,
  ExchangeLocation: null,
  SharePointLocation: null,
  OneDriveLocation: null,
};

describe('PolicyForm', () => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New Policy mode', () => {
    it('renders create form with correct title', () => {
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      expect(screen.getByText('New Label Policy')).toBeInTheDocument();
      expect(screen.getByText('Create a new sensitivity label publishing policy.')).toBeInTheDocument();
      expect(screen.getByText('Create Policy')).toBeInTheDocument();
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Create Policy'));

      expect(screen.getByText('Policy name is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('creates policy with name only', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLLabelPolicy',
          expect.objectContaining({ Name: 'Test Policy' }),
        );
      });

      expect(onSaved).toHaveBeenCalledWith('Test Policy');
    });

    it('creates policy with comment', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');
      await user.type(
        screen.getByPlaceholderText('Describe the purpose of this policy...'),
        'A test comment',
      );
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLLabelPolicy',
          expect.objectContaining({ Comment: 'A test comment' }),
        );
      });
    });

    it('creates policy with labels', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');

      // Add a label via TagInput
      const tagInput = screen.getByPlaceholderText('Type a label name and press Enter...');
      await user.type(tagInput, 'Confidential{Enter}');

      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLLabelPolicy',
          expect.objectContaining({ Labels: ['Confidential'] }),
        );
      });
    });

    it('shows error on save failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Duplicate name' });
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Duplicate name')).toBeInTheDocument();
      });

      expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows default error when no error string', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null });
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('handles invoke throwing during save', async () => {
      mockInvoke.mockRejectedValue(new Error('Connection lost'));
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Connection lost')).toBeInTheDocument();
      });
    });

    it('handles invoke throwing a non-Error during save', async () => {
      mockInvoke.mockRejectedValue('string error');
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('does not show delete button in new mode', () => {
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('policy name field is enabled in new mode', () => {
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);
      const nameInput = screen.getByPlaceholderText('e.g., Finance Policy');
      expect(nameInput).not.toBeDisabled();
    });
  });

  describe('Edit Policy mode', () => {
    it('renders edit form with correct title and pre-filled values', () => {
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText('Edit: Global Policy')).toBeInTheDocument();
      expect(screen.getByText('Modify this label policy. Changes take effect after saving.')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('disables policy name field in edit mode', () => {
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      const nameInput = screen.getByDisplayValue('Global Policy');
      expect(nameInput).toBeDisabled();
    });

    it('shows help text about name being immutable', () => {
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText('Policy names cannot be changed after creation.')).toBeInTheDocument();
    });

    it('pre-fills comment and labels', () => {
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByDisplayValue('Default org policy')).toBeInTheDocument();
      expect(screen.getByText('Confidential')).toBeInTheDocument();
      expect(screen.getByText('Public')).toBeInTheDocument();
    });

    it('saves changes with Set-SLLabelPolicy command', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      // Change comment
      const commentField = screen.getByDisplayValue('Default org policy');
      await user.clear(commentField);
      await user.type(commentField, 'Updated comment');

      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Set-SLLabelPolicy',
          expect.objectContaining({ Identity: 'Global Policy', Comment: 'Updated comment' }),
        );
      });

      expect(onSaved).toHaveBeenCalledWith('Global Policy');
    });

    it('shows Delete button in edit mode', () => {
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows delete confirmation dialog', async () => {
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));

      expect(screen.getByText('Delete Label Policy')).toBeInTheDocument();
      expect(screen.getByText(/Permanently delete "Global Policy"/)).toBeInTheDocument();
      expect(screen.getByText(/This will unpublish all labels/)).toBeInTheDocument();
    });

    it('confirms delete and calls onDeleted', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Remove-SLLabelPolicy',
          expect.objectContaining({ Identity: 'Global Policy' }),
        );
      });

      expect(onDeleted).toHaveBeenCalledOnce();
    });

    it('cancels delete dialog', async () => {
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete Label Policy')).toBeInTheDocument();

      // Click Cancel in the dialog (there are two Cancel buttons, the dialog one)
      const cancelButtons = screen.getAllByText('Cancel');
      const dialogCancel = cancelButtons[cancelButtons.length - 1];
      await user.click(dialogCancel);

      expect(screen.queryByText('Delete Label Policy')).not.toBeInTheDocument();
    });

    it('shows error on delete failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Cannot delete' });
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));

      await waitFor(() => {
        expect(screen.getByText('Cannot delete')).toBeInTheDocument();
      });

      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('shows default error on delete failure without error string', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null });
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));

      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });

    it('handles delete invoke throwing', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('handles delete invoke throwing a non-Error', async () => {
      mockInvoke.mockRejectedValue('string error');
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));

      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel', () => {
    it('calls onCancel when Cancel button clicked', async () => {
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  describe('Edge cases', () => {
    it('passes raw single quotes in policy name', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<PolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Finance Policy'), "O'Brien Policy");
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLLabelPolicy',
          expect.objectContaining({ Name: "O'Brien Policy" }),
        );
      });
    });

    it('does not include unchanged comment in Set command', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <PolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      // Don't change anything, just save
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled();
      });

      expect(mockInvoke.mock.calls[0][1]).not.toHaveProperty('Comment');
    });
  });
});
