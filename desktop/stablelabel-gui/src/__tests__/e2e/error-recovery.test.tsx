/**
 * E2E tests for error handling and recovery across the application.
 *
 * Verifies: API failures → error boundaries → graceful degradation → retry patterns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke, mockCheckPwsh, mockGetStatus } from '../setup';

import App from '../../renderer/App';
import DocumentsPage from '../../renderer/components/Documents/DocumentsPage';
import ManualLabelPage from '../../renderer/components/ManualLabel/ManualLabelPage';

describe('Error recovery (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPwsh.mockResolvedValue({ available: true, path: '/usr/bin/pwsh' });
    mockGetStatus.mockResolvedValue({ initialized: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('App-level error handling', () => {
    it('app survives connection status failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Network timeout'));

      render(<App />);

      // App should still render sidebar
      expect(screen.getByText('StableLabel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    });

    it('app survives when invoke returns unexpected shape', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: 'unexpected string' });

      render(<App />);

      expect(screen.getByText('StableLabel')).toBeInTheDocument();
    });

    it('app navigates even when current page errors', async () => {
      const user = userEvent.setup();

      mockInvoke.mockImplementation(async (cmdlet: string) => {
        if (cmdlet === 'Get-SLConnectionStatus') {
          return {
            success: true,
            data: { GraphConnected: true, ComplianceConnected: true, ProtectionConnected: false, UserPrincipalName: 'user@contoso.com', TenantId: 't1' },
          };
        }
        // All other cmdlets fail
        return { success: false, data: null, error: 'Service unavailable' };
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
      });

      // Navigate to Settings — should work even if dashboard had errors
      await user.click(screen.getByRole('button', { name: 'Settings' }));

      await waitFor(() => {
        expect(screen.getByText('Application preferences and diagnostics')).toBeInTheDocument();
      });
    });
  });

  describe('Document page error recovery', () => {
    it('shows error on lookup failure, allows retry', async () => {
      const user = userEvent.setup();
      let callCount = 0;

      mockInvoke.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { success: false, data: null, error: 'Temporary failure' };
        return { success: true, data: { labels: [{ sensitivityLabelId: 'l1', name: 'Confidential', description: null, color: null, assignmentMethod: null }] } };
      });

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!d');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'i1');

      // First attempt fails
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('Temporary failure')).toBeInTheDocument();
      });

      // Retry succeeds
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('Confidential')).toBeInTheDocument();
      });
    });

    it('error clears on new attempt', async () => {
      const user = userEvent.setup();

      mockInvoke
        .mockResolvedValueOnce({ success: false, data: null, error: 'First error' })
        .mockResolvedValueOnce({ success: false, data: null, error: 'Second error' });

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!d');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'i1');

      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('Second error')).toBeInTheDocument();
      });

      expect(screen.queryByText('First error')).not.toBeInTheDocument();
    });
  });

  describe('Manual Label error recovery', () => {
    it('parse error does not block re-attempt', async () => {
      const user = userEvent.setup();

      mockInvoke
        .mockResolvedValueOnce({ success: false, data: null, error: 'Invalid CSV format' })
        .mockResolvedValueOnce({
          success: true,
          data: {
            Action: 'Import-SLLabelCsv', TotalRows: 1, ValidCount: 1, InvalidCount: 0,
            ValidRows: [{ Row: 1, DriveId: 'd', ItemId: 'i', LabelName: 'L', LabelId: null, Valid: true, Errors: null }],
            InvalidRows: [],
          },
        });

      render(<ManualLabelPage />);

      await user.type(screen.getByRole('textbox'), 'bad csv');
      await user.click(screen.getByText('Validate CSV'));

      await waitFor(() => {
        expect(screen.getByText('Invalid CSV format')).toBeInTheDocument();
      });

      // Clear and retry with good data
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'DriveId,ItemId,LabelName\nd,i,L');
      await user.click(screen.getByText('Validate CSV'));

      // Preview phase should show — verify by checking for the preview grid
      await waitFor(() => {
        expect(screen.getByText('Total Rows')).toBeInTheDocument();
      });
    });

    it('apply error stays on preview phase', async () => {
      const user = userEvent.setup();

      const preview = {
        Action: 'Import-SLLabelCsv', TotalRows: 1, ValidCount: 1, InvalidCount: 0,
        ValidRows: [{ Row: 1, DriveId: 'd', ItemId: 'i', LabelName: 'Conf', LabelId: null, Valid: true, Errors: null }],
        InvalidRows: [],
      };

      mockInvoke
        .mockResolvedValueOnce({ success: true, data: preview })       // CSV parse
        .mockResolvedValueOnce({ success: false, data: null, error: 'Permission denied' });  // bulk apply

      render(<ManualLabelPage />);

      await user.type(screen.getByRole('textbox'), 'csv data');
      await user.click(screen.getByText('Validate CSV'));

      await waitFor(() => {
        expect(screen.getByText('Dry Run — Apply to 1 files')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Dry Run — Apply to 1 files'));

      await waitFor(() => {
        expect(screen.getByText('Permission denied')).toBeInTheDocument();
      });

      // Should still be on preview phase (not done phase)
      expect(screen.getByText('Start Over')).toBeInTheDocument();
    });
  });

  describe('Invoke exception handling', () => {
    it('handles thrown exceptions from invoke', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue(new Error('IPC channel closed'));

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!d');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'i1');
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('IPC channel closed')).toBeInTheDocument();
      });
    });

    it('handles non-Error thrown objects', async () => {
      const user = userEvent.setup();
      mockInvoke.mockRejectedValue('string error');

      render(<DocumentsPage />);

      await user.type(screen.getByPlaceholderText('b!abc123...'), 'b!d');
      await user.type(screen.getByPlaceholderText('01ABC123DEF...'), 'i1');
      await user.click(screen.getByText('Look Up Label'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });
  });

  describe('PowerShell bridge status errors', () => {
    it('settings page handles pwsh unavailable', async () => {
      mockCheckPwsh.mockResolvedValue({ available: false });
      mockGetStatus.mockResolvedValue({ initialized: false });

      // Navigate to settings via App
      mockInvoke.mockImplementation(async (cmdlet: string) => {
        if (cmdlet === 'Get-SLConnectionStatus') {
          return { success: true, data: { GraphConnected: false, ComplianceConnected: false, ProtectionConnected: false, UserPrincipalName: null, TenantId: null } };
        }
        return { success: true, data: null };
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Settings' }));

      await waitFor(() => {
        expect(screen.getByText('Application preferences and diagnostics')).toBeInTheDocument();
      });

      // Should show "No" for PowerShell
      await waitFor(() => {
        const noElements = screen.getAllByText('No');
        expect(noElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
