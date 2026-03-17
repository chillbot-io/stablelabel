import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DlpRuleForm from '../../../renderer/components/DLP/DlpRuleForm';
import { mockInvoke } from '../../setup';

const mockExisting = {
  Name: 'Block SSN Sharing',
  Guid: 'rule-guid-1',
  Policy: 'PII Protection',
  Comment: 'Blocks SSN in emails',
  BlockAccess: true,
  NotifyUser: ['admin@contoso.com'],
  GenerateAlert: ['alert@contoso.com'],
  ContentContainsSensitiveInformation: null,
  Disabled: false,
  Priority: 0,
};

describe('DlpRuleForm', () => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New rule mode', () => {
    it('renders form title for new rule', () => {
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('New DLP Rule')).toBeInTheDocument();
      expect(screen.getByText('Define what sensitive content to detect and what action to take.')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Rule Name')).toBeInTheDocument();
      expect(screen.getByText('Parent Policy')).toBeInTheDocument();
      expect(screen.getByText('Comment')).toBeInTheDocument();
      expect(screen.getByText('Block Access')).toBeInTheDocument();
      expect(screen.getByText('Notify Users')).toBeInTheDocument();
      expect(screen.getByText('Generate Alert')).toBeInTheDocument();
      expect(screen.getByText('Create Rule')).toBeInTheDocument();
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);
      await user.click(screen.getByText('Create Rule'));
      expect(screen.getByText('Rule name is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('shows validation error when policy is empty', async () => {
      const user = userEvent.setup();
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);
      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'My Rule');
      await user.click(screen.getByText('Create Rule'));
      expect(screen.getByText('Parent policy is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('submits new rule with correct PowerShell command', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'My New Rule');
      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'PII Policy');
      await user.type(screen.getByPlaceholderText('Describe what this rule detects...'), 'A comment');
      await user.click(screen.getByText('Create Rule'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('New-SLDlpRule', expect.objectContaining({
          Name: 'My New Rule',
          Policy: 'PII Policy',
          Comment: 'A comment',
          BlockAccess: false,
        }));
      });
      expect(onSaved).toHaveBeenCalledWith('My New Rule');
    });

    it('includes BlockAccess true when toggled', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'My Rule');
      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'Policy');

      // Toggle block access
      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await user.click(screen.getByText('Create Rule'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('New-SLDlpRule', expect.objectContaining({ BlockAccess: true }));
      });
    });

    it('handles save error from invoke', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Already exists' });
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'My Rule');
      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'Policy');
      await user.click(screen.getByText('Create Rule'));

      await waitFor(() => {
        expect(screen.getByText('Already exists')).toBeInTheDocument();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('handles save error without error message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null });
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'Rule');
      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'Policy');
      await user.click(screen.getByText('Create Rule'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('handles exception during save', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('Connection lost'));
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'Rule');
      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'Policy');
      await user.click(screen.getByText('Create Rule'));

      await waitFor(() => {
        expect(screen.getByText('Connection lost')).toBeInTheDocument();
      });
    });

    it('handles non-Error exception during save', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue('string error');
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., Block Credit Card Sharing'), 'Rule');
      await user.type(screen.getByPlaceholderText('e.g., PII Protection Policy'), 'Policy');
      await user.click(screen.getByText('Create Rule'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('calls onCancel when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} />);
      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('does not show Delete button for new rule', () => {
      render(<DlpRuleForm onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });
  });

  describe('Edit rule mode', () => {
    it('renders form title for existing rule', () => {
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText('Edit: Block SSN Sharing')).toBeInTheDocument();
      expect(screen.getByText('Modify this DLP rule.')).toBeInTheDocument();
    });

    it('pre-fills form fields with existing data', () => {
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByDisplayValue('Block SSN Sharing')).toBeInTheDocument();
      expect(screen.getByDisplayValue('PII Protection')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Blocks SSN in emails')).toBeInTheDocument();
    });

    it('shows Save Changes button', () => {
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('submits edit with Set-SLDlpRule command', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      const commentArea = screen.getByDisplayValue('Blocks SSN in emails');
      await user.clear(commentArea);
      await user.type(commentArea, 'Updated comment');
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Set-SLDlpRule', expect.objectContaining({
          Identity: 'Block SSN Sharing',
          Comment: 'Updated comment',
        }));
      });
      expect(onSaved).toHaveBeenCalledWith('Block SSN Sharing');
    });

    it('includes BlockAccess when changed', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      // Toggle block access off (was true)
      const toggle = screen.getByRole('switch');
      await user.click(toggle);
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Set-SLDlpRule', expect.objectContaining({ BlockAccess: false }));
      });
    });

    it('shows Delete button for existing rule', () => {
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows confirm dialog and deletes rule', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: null });
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete DLP Rule')).toBeInTheDocument();
      expect(screen.getByText(/Permanently delete "Block SSN Sharing"/)).toBeInTheDocument();

      await user.click(screen.getByText('Delete Rule'));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Remove-SLDlpRule', expect.objectContaining({ Identity: 'Block SSN Sharing' }));
      });
      expect(onDeleted).toHaveBeenCalled();
    });

    it('cancels delete dialog', async () => {
      const user = userEvent.setup();
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete DLP Rule')).toBeInTheDocument();

      const cancelButtons = screen.getAllByText('Cancel');
      await user.click(cancelButtons[cancelButtons.length - 1]);
      expect(screen.queryByText('Delete DLP Rule')).not.toBeInTheDocument();
    });

    it('handles delete error', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Cannot delete' });
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Rule'));
      await waitFor(() => {
        expect(screen.getByText('Cannot delete')).toBeInTheDocument();
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('handles delete error without error message', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: false, data: null });
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Rule'));
      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });

    it('handles delete exception', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('Delete error'));
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Rule'));
      await waitFor(() => {
        expect(screen.getByText('Delete error')).toBeInTheDocument();
      });
    });

    it('handles delete non-Error exception', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue('string error');
      render(<DlpRuleForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Rule'));
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });
  });

  describe('Existing with null fields', () => {
    it('handles existing rule with null NotifyUser and GenerateAlert', () => {
      const ruleNullFields = { ...mockExisting, NotifyUser: null, GenerateAlert: null, Comment: null };
      render(<DlpRuleForm existing={ruleNullFields} onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Edit: Block SSN Sharing')).toBeInTheDocument();
    });
  });
});
