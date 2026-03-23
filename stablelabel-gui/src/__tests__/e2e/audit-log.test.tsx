/**
 * E2E tests for the Audit Log page.
 *
 * Verifies: log fetching → count selector → refresh → export → result badges.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import AuditLogPage from '../../renderer/components/AuditLog/AuditLogPage';

const mockEntries = [
  { Timestamp: '2024-06-15T10:30:00Z', Action: 'Set-SLDocumentLabel', Target: 'doc-01.docx', Result: 'success', User: 'admin@contoso.com', Parameters: '{LabelName: "Confidential"}' },
  { Timestamp: '2024-06-15T10:25:00Z', Action: 'New-SLSnapshot', Target: 'baseline', Result: 'success', User: 'admin@contoso.com', Parameters: '{Scope: "All"}' },
  { Timestamp: '2024-06-15T10:20:00Z', Action: 'Remove-SLDocumentLabel', Target: 'doc-02.xlsx', Result: 'failed', User: 'admin@contoso.com', Parameters: '' },
  { Timestamp: '2024-06-15T10:15:00Z', Action: 'Set-SLDocumentLabelBulk', Target: '5 documents', Result: 'dry-run', User: 'admin@contoso.com', Parameters: '{DryRun: true}' },
  { Timestamp: '2024-06-15T10:10:00Z', Action: 'Remove-SLDocumentLabelBulk', Target: '3 documents', Result: 'partial', User: 'admin@contoso.com', Parameters: '' },
];

describe('Audit Log (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders page header and fetches log on mount', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Full history of operations executed through StableLabel.')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLAuditLog', { Last: 50 });
    });
  });

  it('displays all audit entries in table', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Set-SLDocumentLabel')).toBeInTheDocument();
    });

    expect(screen.getByText('New-SLSnapshot')).toBeInTheDocument();
    expect(screen.getByText('Remove-SLDocumentLabel')).toBeInTheDocument();
    expect(screen.getByText('Set-SLDocumentLabelBulk')).toBeInTheDocument();
    expect(screen.getByText('Remove-SLDocumentLabelBulk')).toBeInTheDocument();
  });

  it('shows result badges with correct labels', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getAllByText('success')).toHaveLength(2);
    });

    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('dry-run')).toBeInTheDocument();
    expect(screen.getByText('partial')).toBeInTheDocument();
  });

  it('displays target names', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('doc-01.docx')).toBeInTheDocument();
    });

    expect(screen.getByText('doc-02.xlsx')).toBeInTheDocument();
    expect(screen.getByText('5 documents')).toBeInTheDocument();
  });

  it('shows empty state when no entries', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('No audit entries found.')).toBeInTheDocument();
    });
  });

  it('count selector changes the fetch parameter', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLAuditLog', { Last: 50 });
    });

    // Change to 100 — find the select by its "Last 50" option text
    const select = screen.getByDisplayValue('Last 50');
    await user.selectOptions(select, '100');

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLAuditLog', { Last: 100 });
    });
  });

  it('refresh button re-fetches the log', async () => {
    const user = userEvent.setup();
    let callCount = 0;

    mockInvoke.mockImplementation(async () => {
      callCount++;
      return { success: true, data: mockEntries };
    });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    const initial = callCount;

    await user.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(initial);
    });
  });

  it('shows export button when entries exist', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Set-SLDocumentLabel')).toBeInTheDocument();
    });

    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('hides export button when no entries', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('No audit entries found.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Export')).not.toBeInTheDocument();
  });

  it('table shows all column headers', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
    });

    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
  });

  it('handles fetch error without crashing', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));

    render(<AuditLogPage />);

    // Page should still render header
    await waitFor(() => {
      expect(screen.getByText('Audit Log')).toBeInTheDocument();
    });
  });

  it('all cmdlet calls use valid Verb-SLNoun format', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockEntries });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(0);
    });

    for (const call of mockInvoke.mock.calls) {
      expect(call[0]).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
    }
  });
});
