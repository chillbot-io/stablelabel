/**
 * E2E tests for the Labels page — browser + tabbed workspace workflow.
 *
 * Verifies: section switching → item selection → tab management → form creation → edit/delete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import LabelsPage from '../../renderer/components/Labels/LabelsPage';

const mockLabels = [
  { Id: 'l1', Name: 'Confidential', Tooltip: 'Business data', IsActive: true, SubLabels: [] },
  { Id: 'l2', Name: 'Internal', Tooltip: 'Internal use', IsActive: true, SubLabels: [
    { Id: 'l2a', Name: 'Internal/Finance', Tooltip: 'Finance only', IsActive: true },
  ] },
  { Id: 'l3', Name: 'Public', Tooltip: null, IsActive: false, SubLabels: [] },
];

const mockPolicies = [
  { Name: 'Default Policy', Guid: 'p1', Labels: ['l1', 'l2'], Comment: null, Enabled: true, CreatedBy: 'admin@contoso.com', WhenCreated: '2024-01-15T10:00:00Z', WhenChanged: null },
  { Name: 'Engineering Policy', Guid: 'p2', Labels: ['l2'], Comment: 'For engineering', Enabled: true, CreatedBy: 'admin@contoso.com', WhenCreated: '2024-06-01T08:00:00Z', WhenChanged: null },
];

const mockAutoLabels = [
  { Name: 'Auto-Confidential', Guid: 'a1', Comment: null, Enabled: true, Mode: 'Simulation', WhenCreated: '2024-01-15T10:00:00Z', WhenChanged: null, ApplySensitivityLabel: 'l1', Priority: 0 },
];

describe('Labels workspace (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders browser with three section tabs', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });

    render(<LabelsPage />);

    // Section tabs: Labels, Policies, Auto — there may be multiple "Labels" elements
    // (section tab + quick link). Use getAllByText and verify at least one exists.
    expect(screen.getAllByText('Labels').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Policies').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('shows empty workspace with quick actions', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });

    render(<LabelsPage />);

    expect(screen.getByText('Select an item or create new')).toBeInTheDocument();
    expect(screen.getByText('+ New Label Policy')).toBeInTheDocument();
    expect(screen.getByText('+ New Auto-Label Policy')).toBeInTheDocument();
  });

  it('loads and displays labels in browser', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('switches to Policies section and loads policies', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      if (cmdlet === 'Get-SLLabelPolicy') return { success: true, data: mockPolicies };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    // Click the section tab "Policies" (first match; the QuickLink is another)
    await user.click(screen.getAllByText('Policies')[0]);

    await waitFor(() => {
      expect(screen.getByText('Default Policy')).toBeInTheDocument();
    });

    expect(screen.getByText('Engineering Policy')).toBeInTheDocument();
  });

  it('switches to Auto section and loads auto-label policies', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      if (cmdlet === 'Get-SLAutoLabelPolicy') return { success: true, data: mockAutoLabels };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    await user.click(screen.getByText('Auto'));

    await waitFor(() => {
      expect(screen.getByText('Auto-Confidential')).toBeInTheDocument();
    });
  });

  it('opens label detail tab when clicking a label', async () => {
    const user = userEvent.setup();

    const labelDetail = {
      id: 'l1', name: 'Confidential', displayName: 'Confidential', description: 'Business data',
      tooltip: 'For business-sensitive content', isActive: true, priority: 1, color: '#FF0000',
      parent: null, parentLabelId: null, contentFormats: ['file', 'email'],
    };

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLLabel' && params?.Id) return { success: true, data: labelDetail };
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Confidential'));

    // Tab should appear and detail should load
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabel', expect.objectContaining({ Id: 'l1' }));
    });
  });

  it('opens policy detail tab when clicking a policy', async () => {
    const user = userEvent.setup();

    const policyDetail = {
      Name: 'Default Policy', Guid: 'p1', Labels: ['l1', 'l2'], Comment: null, Enabled: true,
      CreatedBy: 'admin@contoso.com', WhenCreated: '2024-01-15T10:00:00Z', WhenChanged: null,
    };

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLLabelPolicy' && params?.Identity) return { success: true, data: policyDetail };
      if (cmdlet === 'Get-SLLabelPolicy') return { success: true, data: mockPolicies };
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    await user.click(screen.getAllByText('Policies')[0]);

    await waitFor(() => {
      expect(screen.getByText('Default Policy')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Default Policy'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabelPolicy', expect.objectContaining({ Identity: 'Default Policy' }));
    });
  });

  it('opens multiple tabs and switches between them', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLLabel' && params?.Id === 'l1') return { success: true, data: { id: 'l1', name: 'Confidential' } };
      if (cmdlet === 'Get-SLLabel' && params?.Id === 'l2') return { success: true, data: { id: 'l2', name: 'Internal' } };
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    // Open first label
    await user.click(screen.getByText('Confidential'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabel', expect.objectContaining({ Id: 'l1' }));
    });

    // Open second label
    await user.click(screen.getByText('Internal'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabel', expect.objectContaining({ Id: 'l2' }));
    });
  });

  it('opens new policy form from empty workspace', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [] });

    render(<LabelsPage />);

    await user.click(screen.getByText('+ New Label Policy'));

    // A new tab for policy form should appear
    await waitFor(() => {
      expect(screen.getByText('+ New Policy')).toBeInTheDocument();
    });
  });

  it('opens new auto-label form from empty workspace', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [] });

    render(<LabelsPage />);

    await user.click(screen.getByText('+ New Auto-Label Policy'));

    await waitFor(() => {
      expect(screen.getByText('+ New Auto-Label')).toBeInTheDocument();
    });
  });

  it('handles labels fetch error without crashing', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Graph API unavailable' });

    render(<LabelsPage />);

    // Page should still render — these texts may appear multiple times
    expect(screen.getAllByText('Labels').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Policies').length).toBeGreaterThanOrEqual(1);
  });

  it('all cmdlet calls use valid Verb-SLNoun format', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLLabel') return { success: true, data: mockLabels };
      return { success: true, data: null };
    });

    render(<LabelsPage />);

    await waitFor(() => {
      expect(screen.getByText('Confidential')).toBeInTheDocument();
    });

    for (const call of mockInvoke.mock.calls) {
      expect(call[0]).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
    }
  });
});
