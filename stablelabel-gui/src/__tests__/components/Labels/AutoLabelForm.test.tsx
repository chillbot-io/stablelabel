import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutoLabelForm from '../../../renderer/components/Labels/AutoLabelForm';
import { mockInvoke } from '../../setup';

const mockExisting = {
  Name: 'PII Auto-Label',
  Guid: 'guid-auto-1',
  Comment: 'Detects PII',
  Enabled: true,
  Mode: 'TestWithoutNotifications',
  WhenCreated: '2024-01-15T10:30:00Z',
  WhenChanged: null,
  ApplySensitivityLabel: 'Confidential',
  ExchangeLocation: ['All'],
  SharePointLocation: ['https://contoso.sharepoint.com/sites/hr'],
  OneDriveLocation: null,
  Priority: 2,
};

describe('AutoLabelForm', () => {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New Policy mode', () => {
    it('renders create form with correct title', () => {
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      expect(screen.getByText('New Auto-Label Policy')).toBeInTheDocument();
      expect(
        screen.getByText('Create a policy that automatically applies sensitivity labels to matching content.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Create Policy')).toBeInTheDocument();
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Create Policy'));

      expect(screen.getByText('Policy name is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('shows validation error when sensitivity label is empty', async () => {
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test Policy');
      await user.click(screen.getByText('Create Policy'));

      expect(screen.getByText('A sensitivity label to apply is required.')).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('creates policy with minimum required fields', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test Policy');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Highly Confidential');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLAutoLabelPolicy',
          expect.objectContaining({
            Name: 'Test Policy',
            ApplySensitivityLabel: 'Highly Confidential',
            Mode: expect.any(String),
          }),
        );
      });

      expect(onSaved).toHaveBeenCalledWith('Test Policy');
    });

    it('creates policy with exchange location', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test Policy');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');

      // Add exchange location
      const exchangeInput = screen.getByPlaceholderText("'All' or specific addresses...");
      await user.type(exchangeInput, 'All{Enter}');

      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLAutoLabelPolicy',
          expect.objectContaining({ ExchangeLocation: ['All'] }),
        );
      });
    });

    it('creates policy with sharepoint location', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test Policy');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');

      // Add SharePoint location - first "'All' or site URLs..." is SharePoint
      const spInputs = screen.getAllByPlaceholderText("'All' or site URLs...");
      await user.type(spInputs[0], 'https://contoso.sharepoint.com{Enter}');

      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLAutoLabelPolicy',
          expect.objectContaining({ SharePointLocation: expect.any(Array) }),
        );
      });
    });

    it('creates policy with onedrive location', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test Policy');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');

      // Add OneDrive location - the third tag input with "'All' or site URLs..."
      // OneDrive placeholder is also "'All' or site URLs..." -- find by looking at the parent label
      const oneDriveInputs = screen.getAllByPlaceholderText("'All' or site URLs...");
      const oneDriveInput = oneDriveInputs[oneDriveInputs.length - 1];
      await user.type(oneDriveInput, 'All{Enter}');

      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLAutoLabelPolicy',
          expect.objectContaining({ OneDriveLocation: expect.any(Array) }),
        );
      });
    });

    it('shows error on save failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Duplicate name' });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test Policy');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Confidential');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Duplicate name')).toBeInTheDocument();
      });

      expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows default error when no error string', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Label');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('handles invoke throwing during save', async () => {
      mockInvoke.mockRejectedValue(new Error('Connection lost'));
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Label');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Connection lost')).toBeInTheDocument();
      });
    });

    it('handles invoke throwing a non-Error during save', async () => {
      mockInvoke.mockRejectedValue('string error');
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), 'Test');
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Label');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(screen.getByText('Operation failed')).toBeInTheDocument();
      });
    });

    it('does not show delete button in new mode', () => {
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />);
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('does not show Comment field in new mode', () => {
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.queryByPlaceholderText('Describe the purpose of this policy...')).not.toBeInTheDocument();
    });

    it('has mode selector defaulting to TestWithoutNotifications', () => {
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);
      const modeSelect = screen.getByDisplayValue('Simulation (silent)');
      expect(modeSelect).toBeInTheDocument();
    });

    it('name and label fields are enabled in new mode', () => {
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByPlaceholderText('e.g., PII Auto-Label')).not.toBeDisabled();
      expect(screen.getByPlaceholderText('e.g., Confidential')).not.toBeDisabled();
    });

    it('shows scope location help text', () => {
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);
      expect(screen.getByText('Scope Locations')).toBeInTheDocument();
    });
  });

  describe('Edit Policy mode', () => {
    it('renders edit form with correct title and pre-filled values', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText('Edit: PII Auto-Label')).toBeInTheDocument();
      expect(screen.getByText('Modify this auto-labeling policy.')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('disables name and label fields in edit mode', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByDisplayValue('PII Auto-Label')).toBeDisabled();
      expect(screen.getByDisplayValue('Confidential')).toBeDisabled();
    });

    it('pre-fills mode selector', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByDisplayValue('Simulation (silent)')).toBeInTheDocument();
    });

    it('shows Comment field in edit mode', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByDisplayValue('Detects PII')).toBeInTheDocument();
    });

    it('shows location scoping note in edit mode', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText(/Location scoping can only be set during creation/)).toBeInTheDocument();
    });

    it('pre-fills exchange and sharepoint locations', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('https://contoso.sharepoint.com/sites/hr')).toBeInTheDocument();
    });

    it('saves changes with Set-SLAutoLabelPolicy command', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      // Change mode
      const modeSelect = screen.getByDisplayValue('Simulation (silent)');
      await user.selectOptions(modeSelect, 'Enable');

      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Set-SLAutoLabelPolicy',
          expect.objectContaining({ Identity: 'PII Auto-Label', Mode: 'Enable' }),
        );
      });

      expect(onSaved).toHaveBeenCalledWith('PII Auto-Label');
    });

    it('does not include mode if unchanged', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      // Don't change mode, just save
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled();
      });

      expect(mockInvoke.mock.calls[0][1]).not.toHaveProperty('Mode');
    });

    it('shows Delete button in edit mode', () => {
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows delete confirmation dialog', async () => {
      const user = userEvent.setup();
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));

      expect(screen.getByText('Delete Auto-Label Policy')).toBeInTheDocument();
      expect(screen.getByText(/Permanently delete/)).toBeInTheDocument();
      expect(screen.getByText(/Content previously labeled/)).toBeInTheDocument();
    });

    it('confirms delete and calls onDeleted', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      await user.click(screen.getByText('Delete Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'Remove-SLAutoLabelPolicy',
          expect.objectContaining({ Identity: 'PII Auto-Label' }),
        );
      });

      expect(onDeleted).toHaveBeenCalledOnce();
    });

    it('cancels delete dialog', async () => {
      const user = userEvent.setup();
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      await user.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete Auto-Label Policy')).toBeInTheDocument();

      const cancelButtons = screen.getAllByText('Cancel');
      const dialogCancel = cancelButtons[cancelButtons.length - 1];
      await user.click(dialogCancel);

      expect(screen.queryByText('Delete Auto-Label Policy')).not.toBeInTheDocument();
    });

    it('shows error on delete failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Cannot delete' });
      const user = userEvent.setup();
      render(
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
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
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
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
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
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
        <AutoLabelForm existing={mockExisting} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
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
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  describe('Edge cases', () => {
    it('passes raw single quotes in policy name', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null });
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      await user.type(screen.getByPlaceholderText('e.g., PII Auto-Label'), "O'Brien Policy");
      await user.type(screen.getByPlaceholderText('e.g., Confidential'), 'Label');
      await user.click(screen.getByText('Create Policy'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          'New-SLAutoLabelPolicy',
          expect.objectContaining({ Name: "O'Brien Policy" }),
        );
      });
    });

    it('handles existing policy with null ExchangeLocation', () => {
      const noLocPolicy = { ...mockExisting, ExchangeLocation: null, SharePointLocation: null, OneDriveLocation: null };
      render(
        <AutoLabelForm existing={noLocPolicy} onSaved={onSaved} onCancel={onCancel} onDeleted={onDeleted} />,
      );

      // Should render without errors
      expect(screen.getByText('Edit: PII Auto-Label')).toBeInTheDocument();
    });

    it('changes mode selector value', async () => {
      const user = userEvent.setup();
      render(<AutoLabelForm onSaved={onSaved} onCancel={onCancel} />);

      const modeSelect = screen.getByDisplayValue('Simulation (silent)');
      await user.selectOptions(modeSelect, 'TestWithNotifications');

      expect(screen.getByDisplayValue('Simulation + Notifications')).toBeInTheDocument();
    });
  });
});
