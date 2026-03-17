import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetentionPolicyForm from '../../../renderer/components/Retention/RetentionPolicyForm';
import { mockInvoke } from '../../setup';

const existingPolicy = {
  Name: 'Exchange 7yr Retention',
  Guid: 'pol-guid-123',
  Comment: 'Retain exchange content',
  Enabled: true,
  Mode: 'Enforce',
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: null,
  ExchangeLocation: ['All'],
  SharePointLocation: null,
  OneDriveLocation: null,
  ModernGroupLocation: null,
  SkypeLocation: null,
  PublicFolderLocation: null,
};

describe('RetentionPolicyForm', () => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New policy mode', () => {
    it('renders new policy form with correct title', () => {
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('New Retention Policy')).toBeInTheDocument();
      expect(screen.getByText('Create a policy that applies retention settings to locations.')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Policy Name')).toBeInTheDocument();
      expect(screen.getByText('Comment')).toBeInTheDocument();
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Exchange')).toBeInTheDocument();
      expect(screen.getByText('SharePoint')).toBeInTheDocument();
      expect(screen.getByText('OneDrive')).toBeInTheDocument();
      expect(screen.getByText('M365 Groups')).toBeInTheDocument();
    });

    it('shows Create Policy button for new policies', () => {
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Create Policy')).toBeInTheDocument();
    });

    it('does not show Delete button for new policies', () => {
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('has Enabled toggle on by default', () => {
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Create Policy'));
      expect(screen.getByText('Policy name is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('submits new policy with only name (enabled by default)', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLRetentionPolicy',
          expect.objectContaining({ Name: 'Test Policy', Enabled: true }),
        );
      });
      expect(onSaved).toHaveBeenCalledWith('Test Policy');
    });

    it('submits new policy with comment and disabled', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), 'My Policy');
      await user.type(screen.getByPlaceholderText('Describe the retention requirement...'), 'A description');

      // Toggle enabled off
      await user.click(screen.getByRole('switch'));

      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled();
      });
      expect(mockInvoke).toHaveBeenCalledWith(
        'New-SLRetentionPolicy',
        expect.objectContaining({
          Name: 'My Policy',
          Comment: 'A description',
          Enabled: false,
        }),
      );
    });

    it('handles save failure with error message', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Policy name taken' });
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), 'Test');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Policy name taken')).toBeInTheDocument();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('handles save failure without error message', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null });
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), 'Test');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('handles save exception with Error object', async () => {
      mockInvoke.mockRejectedValue(new Error('Network down'));
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), 'Test');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Network down')).toBeInTheDocument();
      });
    });

    it('handles save exception with non-Error', async () => {
      mockInvoke.mockRejectedValue('string error');
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), 'Test');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('passes raw single quotes in name', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<RetentionPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Exchange 7-Year Retention'), "O'Brien's Policy");
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLRetentionPolicy',
          expect.objectContaining({ Name: "O'Brien's Policy" }),
        );
      });
    });
  });

  describe('Edit policy mode', () => {
    it('renders edit form with correct title', () => {
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText('Edit: Exchange 7yr Retention')).toBeInTheDocument();
      expect(screen.getByText('Modify this retention policy.')).toBeInTheDocument();
    });

    it('pre-fills form with existing data', () => {
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByDisplayValue('Exchange 7yr Retention')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Retain exchange content')).toBeInTheDocument();
    });

    it('shows Save Changes button for existing policies', () => {
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('shows Delete button for existing policies', () => {
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows note about unchangeable location scoping', () => {
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );
      expect(screen.getByText(/Location scoping can only be set during creation/)).toBeInTheDocument();
    });

    it('submits edit with changed comment', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      const commentField = screen.getByDisplayValue('Retain exchange content');
      await user.clear(commentField);
      await user.type(commentField, 'Updated comment');
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Set-SLRetentionPolicy',
          expect.objectContaining({ Identity: 'Exchange 7yr Retention', Comment: 'Updated comment' }),
        );
      });
      expect(onSaved).toHaveBeenCalledWith('Exchange 7yr Retention');
    });

    it('submits edit with changed enabled status', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      // Toggle enabled off (was true)
      await user.click(screen.getByRole('switch'));
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Set-SLRetentionPolicy',
          expect.objectContaining({ Identity: 'Exchange 7yr Retention', Enabled: false }),
        );
      });
    });

    it('submits edit with no changes (minimal command)', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Set-SLRetentionPolicy',
          expect.objectContaining({ Identity: 'Exchange 7yr Retention' }),
        );
      });
    });

    describe('Delete flow', () => {
      it('shows confirm dialog when Delete is clicked', async () => {
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        expect(screen.getByText('Delete Retention Policy')).toBeInTheDocument();
        expect(screen.getByText(/Permanently delete "Exchange 7yr Retention"/)).toBeInTheDocument();
        expect(screen.getByText('Delete Policy')).toBeInTheDocument();
      });

      it('cancels delete when cancel is clicked in confirm dialog', async () => {
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        expect(screen.getByText('Delete Retention Policy')).toBeInTheDocument();

        const cancelButtons = screen.getAllByText('Cancel');
        await user.click(cancelButtons[cancelButtons.length - 1]);

        expect(screen.queryByText('Delete Retention Policy')).not.toBeInTheDocument();
      });

      it('deletes policy when confirmed', async () => {
        mockInvoke.mockResolvedValue({ success: true, data: null });
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Policy'));

        await waitFor(() => {
          expect(mockInvoke).toHaveBeenCalledWith(
            'Remove-SLRetentionPolicy',
            expect.objectContaining({ Identity: 'Exchange 7yr Retention' }),
          );
        });
        expect(onDeleted).toHaveBeenCalledTimes(1);
      });

      it('shows error when delete fails with error message', async () => {
        mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Policy in use' });
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Policy'));

        await waitFor(() => {
          expect(screen.getByText('Policy in use')).toBeInTheDocument();
        });
        expect(onDeleted).not.toHaveBeenCalled();
      });

      it('shows fallback error when delete fails without error message', async () => {
        mockInvoke.mockResolvedValue({ success: false, data: null });
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Policy'));

        await waitFor(() => {
          expect(screen.getByText('Delete failed')).toBeInTheDocument();
        });
      });

      it('handles delete exception with Error object', async () => {
        mockInvoke.mockRejectedValue(new Error('Permission denied'));
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Policy'));

        await waitFor(() => {
          expect(screen.getByText('Permission denied')).toBeInTheDocument();
        });
      });

      it('handles delete exception with non-Error', async () => {
        mockInvoke.mockRejectedValue('some string');
        const user = userEvent.setup();
        render(
          <RetentionPolicyForm existing={existingPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
        );

        await user.click(screen.getByText('Delete'));
        await user.click(screen.getByText('Delete Policy'));

        await waitFor(() => {
          expect(screen.getByText('Delete failed')).toBeInTheDocument();
        });
      });
    });
  });

  describe('with null existing policy', () => {
    it('treats null existing as new policy', () => {
      render(
        <RetentionPolicyForm existing={null} onSaved={onSaved} onCancel={onCancel} />,
      );
      expect(screen.getByText('New Retention Policy')).toBeInTheDocument();
    });
  });

  describe('existing policy with null locations', () => {
    it('handles null location arrays in existing policy', () => {
      render(
        <RetentionPolicyForm
          existing={{
            ...existingPolicy,
            ExchangeLocation: null,
            SharePointLocation: null,
            OneDriveLocation: null,
            ModernGroupLocation: null,
          }}
          onSaved={onSaved}
          onCancel={onCancel}
          onDeleted={onDeleted}
        />,
      );
      expect(screen.getByText('Edit: Exchange 7yr Retention')).toBeInTheDocument();
    });
  });

  describe('existing policy with null comment', () => {
    it('handles null comment in existing policy', () => {
      render(
        <RetentionPolicyForm
          existing={{ ...existingPolicy, Comment: null }}
          onSaved={onSaved}
          onCancel={onCancel}
          onDeleted={onDeleted}
        />,
      );
      expect(screen.getByText('Edit: Exchange 7yr Retention')).toBeInTheDocument();
    });
  });
});
