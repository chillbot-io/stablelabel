import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpPolicyForm from '../../../renderer/components/DLP/DlpPolicyForm';
import { mockInvoke } from '../../setup';

const mockExisting = {
  Name: 'PII Protection',
  Guid: 'guid-1',
  Comment: 'Protects PII',
  Mode: 'Enable',
  Enabled: true,
  WhenCreated: '2024-01-01T00:00:00Z',
  WhenChanged: null,
  ExchangeLocation: ['All'],
  SharePointLocation: ['https://contoso.sharepoint.com'],
  OneDriveLocation: null,
  TeamsLocation: null,
};

describe('DlpPolicyForm', () => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New policy mode', () => {
    it('renders form title for new policy', () => {
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('New DLP Policy')).toBeInTheDocument();
      expect(screen.getByText('Create a Data Loss Prevention policy to protect sensitive information.')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Policy Name')).toBeInTheDocument();
      expect(screen.getByText('Comment')).toBeInTheDocument();
      expect(screen.getByText('Mode')).toBeInTheDocument();
      expect(screen.getByText('Create Policy')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      await user.click(screen.getByText('Create Policy'));
      expect(screen.getByText('Policy name is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('submits new policy with correct PowerShell command', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'My New Policy');
      await user.type(screen.getByPlaceholderText('Describe what this policy protects against...'), 'A test comment');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("New-SLDlpPolicy -Name 'My New Policy'"));
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("-Comment 'A test comment'"));
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("-Mode 'TestWithoutNotifications'"));
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('-Confirm:$false'));
      });
      expect(onSaved).toHaveBeenCalledWith('My New Policy');
    });

    it('handles save error from invoke', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Duplicate name' });
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'My Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Duplicate name')).toBeInTheDocument();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('handles save error without error message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null });
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'My Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('handles exception during save', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('Network error'));
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'My Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('handles non-Error exception during save', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue('string error');
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'My Policy');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('calls onCancel when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('does not show Delete button for new policy', () => {
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('includes mode selection with default TestWithoutNotifications', () => {
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      const modeSelect = screen.getByDisplayValue('Test (silent)');
      expect(modeSelect).toBeInTheDocument();
    });

    it('shows location fields as enabled for new policy', () => {
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Exchange')).toBeInTheDocument();
      expect(screen.getByText('SharePoint')).toBeInTheDocument();
      expect(screen.getByText('OneDrive')).toBeInTheDocument();
      expect(screen.getByText('Teams')).toBeInTheDocument();
    });
  });

  describe('Edit policy mode', () => {
    it('renders form title for existing policy', () => {
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText('Edit: PII Protection')).toBeInTheDocument();
      expect(screen.getByText('Modify this DLP policy.')).toBeInTheDocument();
    });

    it('pre-fills form fields with existing data', () => {
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByDisplayValue('PII Protection')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Protects PII')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Enforcing')).toBeInTheDocument();
    });

    it('shows Save Changes button', () => {
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('submits edit with Set-SLDlpPolicy command', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      // Change the comment
      const commentArea = screen.getByDisplayValue('Protects PII');
      await user.clear(commentArea);
      await user.type(commentArea, 'Updated comment');

      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("Set-SLDlpPolicy -Identity 'PII Protection'"));
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("-Comment 'Updated comment'"));
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('-Confirm:$false'));
      });
      expect(onSaved).toHaveBeenCalledWith('PII Protection');
    });

    it('shows location scoping notice for existing policies', () => {
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText(/Location scoping is set during creation/)).toBeInTheDocument();
    });

    it('shows Delete button for existing policy', () => {
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows confirm dialog and deletes policy', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete DLP Policy')).toBeInTheDocument();
      expect(screen.getByText(/Permanently delete "PII Protection"/)).toBeInTheDocument();

      await user.click(screen.getByText('Delete Policy'));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("Remove-SLDlpPolicy -Identity 'PII Protection'"));
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('-Confirm:$false'));
      });
      expect(onDeleted).toHaveBeenCalled();
    });

    it('cancels delete dialog', async () => {
      const user = userEvent.setup();
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete DLP Policy')).toBeInTheDocument();

      // Click Cancel in dialog
      const cancelButtons = screen.getAllByText('Cancel');
      // The dialog cancel button
      await user.click(cancelButtons[cancelButtons.length - 1]);
      expect(screen.queryByText('Delete DLP Policy')).not.toBeInTheDocument();
    });

    it('handles delete error', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Cannot delete' });
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));
      await waitFor(() => {
        expect(screen.getByText('Cannot delete')).toBeInTheDocument();
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('handles delete error without error message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null });
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));
      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });

    it('handles delete exception', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('Delete network error'));
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));
      await waitFor(() => {
        expect(screen.getByText('Delete network error')).toBeInTheDocument();
      });
    });

    it('handles delete non-Error exception', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue('string error');
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('does not attempt delete when existing is null', async () => {
      // This tests the guard: if (!existing) return;
      // We render without existing and ensure no delete button
      render(<DlpPolicyForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });
  });

  describe('Mode change in command', () => {
    it('includes mode when changed from existing', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} />);

      const modeSelect = screen.getByDisplayValue('Enforcing');
      await user.selectOptions(modeSelect, 'TestWithoutNotifications');
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining("-Mode 'TestWithoutNotifications'"));
      });
    });

    it('does not include mode when unchanged', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpPolicyForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} />);

      // Only change comment
      const commentArea = screen.getByDisplayValue('Protects PII');
      await user.clear(commentArea);
      await user.type(commentArea, 'New comment');
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled();
        const cmd = mockInvoke.mock.calls[0][0];
        expect(cmd).not.toContain('-Mode');
      });
    });
  });
});
