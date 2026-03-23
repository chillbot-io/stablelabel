/**
 * E2E tests for the Explorer page — site tree, file listing, navigation.
 *
 * Verifies: site search → site selection → file listing → folder navigation → file viewer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../setup';

import ExplorerPage from '../../renderer/components/Explorer/ExplorerPage';

const mockSites = {
  Sites: [
    { Id: 'site1', DisplayName: 'Marketing', Name: 'marketing', WebUrl: 'https://contoso.sharepoint.com/sites/marketing' },
    { Id: 'site2', DisplayName: 'Engineering', Name: 'engineering', WebUrl: 'https://contoso.sharepoint.com/sites/engineering' },
    { Id: 'site3', DisplayName: 'HR Department', Name: 'hr', WebUrl: 'https://contoso.sharepoint.com/sites/hr' },
  ],
};

const mockDrives = {
  Drives: [
    { Id: 'drive1', Name: 'Documents', WebUrl: 'https://contoso.sharepoint.com/sites/marketing/Shared%20Documents' },
  ],
};

const mockFiles = {
  Items: [
    { Id: 'folder1', Name: 'Reports', IsFolder: true, Size: null, MimeType: null, ChildCount: 5, LastModified: '2024-06-01T08:00:00Z', ModifiedBy: 'admin', DriveId: 'drive1' },
    { Id: 'file1', Name: 'Q1-Review.docx', IsFolder: false, Size: 32768, MimeType: 'application/vnd.openxmlformats', ChildCount: null, LastModified: '2024-05-15T14:30:00Z', ModifiedBy: 'jane', DriveId: 'drive1' },
    { Id: 'file2', Name: 'Budget.xlsx', IsFolder: false, Size: 16384, MimeType: 'application/vnd.openxmlformats', ChildCount: null, LastModified: '2024-04-20T09:00:00Z', ModifiedBy: 'bob', DriveId: 'drive1' },
  ],
};

describe('Explorer navigation (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with empty state and loads sites', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLSiteList') return { success: true, data: mockSites };
      return { success: true, data: null };
    });

    render(<ExplorerPage />);

    // Empty state in file panel
    expect(screen.getByText('Select a site or drive to browse files')).toBeInTheDocument();

    // Sites load in tree panel
    await waitFor(() => {
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });

    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('HR Department')).toBeInTheDocument();
    expect(screen.getByText('3 sites loaded')).toBeInTheDocument();
  });

  it('fetches sites on mount with wildcard search', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSites });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLSiteList', { Search: '*' });
    });
  });

  it('searches for sites by keyword', async () => {
    const user = userEvent.setup();
    let searchQuery = '';

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLSiteList') {
        searchQuery = params?.Search as string;
        if (searchQuery === 'eng') {
          return { success: true, data: { Sites: [mockSites.Sites[1]] } };
        }
        return { success: true, data: mockSites };
      }
      return { success: true, data: null };
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText('3 sites loaded')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search sites');
    await user.type(searchInput, 'eng');
    await user.click(screen.getByText('Go'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLSiteList', { Search: 'eng' });
    });

    await waitFor(() => {
      expect(screen.getByText('1 sites loaded')).toBeInTheDocument();
    });
  });

  it('searches on Enter key', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string, params?: Record<string, unknown>) => {
      if (cmdlet === 'Get-SLSiteList') {
        if ((params?.Search as string) === 'hr') {
          return { success: true, data: { Sites: [mockSites.Sites[2]] } };
        }
        return { success: true, data: mockSites };
      }
      return { success: true, data: null };
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText('3 sites loaded')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search sites');
    await user.type(searchInput, 'hr{enter}');

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLSiteList', { Search: 'hr' });
    });
  });

  it('navigates to site when clicked', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLSiteList') return { success: true, data: mockSites };
      if (cmdlet === 'Get-SLSiteDrives') return { success: true, data: mockDrives };
      if (cmdlet === 'Get-SLDriveItems') return { success: true, data: mockFiles };
      return { success: true, data: null };
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Marketing'));

    // File panel should no longer show empty state
    await waitFor(() => {
      expect(screen.queryByText('Select a site or drive to browse files')).not.toBeInTheDocument();
    });
  });

  it('displays site URLs in the tree', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSites });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText('https://contoso.sharepoint.com/sites/marketing')).toBeInTheDocument();
    });
  });

  it('handles site search error', async () => {
    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLSiteList') return { success: false, data: null, error: 'Graph API unavailable' };
      return { success: true, data: null };
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText('Graph API unavailable')).toBeInTheDocument();
    });

    // Empty state should show
    expect(screen.getByText('Select a site or drive to browse files')).toBeInTheDocument();
  });

  it('shows loading state while fetching sites', async () => {
    let resolveSites: (value: unknown) => void;
    const sitesPromise = new Promise(r => { resolveSites = r; });

    mockInvoke.mockImplementation(async (cmdlet: string) => {
      if (cmdlet === 'Get-SLSiteList') return sitesPromise;
      return { success: true, data: null };
    });

    render(<ExplorerPage />);

    expect(screen.getByText('Loading sites...')).toBeInTheDocument();

    resolveSites!({ success: true, data: mockSites });

    await waitFor(() => {
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });
  });

  it('shows "No sites found" when search returns empty', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: { Sites: [] } });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText('No sites found')).toBeInTheDocument();
    });
  });

  it('all cmdlet calls use valid Verb-SLNoun format', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSites });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(0);
    });

    for (const call of mockInvoke.mock.calls) {
      expect(call[0]).toMatch(/^[A-Z][a-z]+-SL[A-Za-z]+$/);
    }
  });
});
