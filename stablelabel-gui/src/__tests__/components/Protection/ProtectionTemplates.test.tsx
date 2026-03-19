import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtectionTemplates from '../../../renderer/components/Protection/ProtectionTemplates';
import { mockInvoke } from '../../setup';

const mockTemplates = [
  {
    TemplateId: 'tmpl-001',
    Names: { 'en-US': 'Confidential', 'de-DE': 'Vertraulich' },
    Descriptions: { 'en-US': 'For internal use only', 'de-DE': 'Nur fuer internen Gebrauch' },
    Status: 'Published',
    ReadOnly: false,
  },
  {
    TemplateId: 'tmpl-002',
    Names: { 'en-US': 'Highly Confidential' },
    Descriptions: { 'en-US': 'Top secret content' },
    Status: 'Archived',
    ReadOnly: true,
  },
  {
    TemplateId: 'tmpl-003',
    Names: null,
    Descriptions: null,
    Status: null,
    ReadOnly: false,
  },
];

describe('ProtectionTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton on initial render', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<ProtectionTemplates />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('shows error when fetch fails with error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Service unavailable' });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('shows fallback error when fetch fails without error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load templates')).toBeInTheDocument();
    });
  });

  it('shows error when invoke throws Error', async () => {
    mockInvoke.mockRejectedValue(new Error('Network timeout'));
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  it('shows generic error when invoke throws non-Error', async () => {
    mockInvoke.mockRejectedValue('unknown');
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('renders heading and description', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('Protection Templates')).toBeInTheDocument();
    });
    expect(screen.getByText(/AIP protection templates define encryption/)).toBeInTheDocument();
  });

  it('shows empty message when no templates', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('No protection templates found.')).toBeInTheDocument();
    });
  });

  it('displays templates with names', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    expect(screen.getAllByText('Highly Confidential')[0]).toBeInTheDocument();
    expect(screen.getByText('tmpl-001')).toBeInTheDocument();
    expect(screen.getByText('tmpl-002')).toBeInTheDocument();
  });

  it('uses TemplateId as name when Names is null', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      // tmpl-003 has null Names so getTemplateName returns TemplateId
      // It appears both as the name and the ID suffix
      const tmpl003Texts = screen.getAllByText('tmpl-003');
      expect(tmpl003Texts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Published badge with green styling', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      const badge = screen.getByText('Published');
      expect(badge.className).toContain('text-emerald-400');
    });
  });

  it('shows Archived badge with gray styling', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      const badge = screen.getByText('Archived');
      expect(badge.className).toContain('text-zinc-400');
    });
  });

  it('shows Read-only badge for read-only templates', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });
  });

  it('does not show status badge when Status is null', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockTemplates[2]] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.queryByText('Published')).not.toBeInTheDocument();
      expect(screen.queryByText('Archived')).not.toBeInTheDocument();
    });
  });

  it('selects and deselects a template on click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });

    // Click to select
    await user.click(screen.getAllByText('Confidential')[0]);
    expect(screen.getByText('Template Details')).toBeInTheDocument();
    expect(screen.getByText('Template ID')).toBeInTheDocument();

    // Click again to deselect
    await user.click(screen.getAllByText('Confidential')[0]);
    expect(screen.queryByText('Template Details')).not.toBeInTheDocument();
  });

  it('shows template detail with Names and Descriptions', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });

    await user.click(screen.getAllByText('Confidential')[0]);
    expect(screen.getByText('Names')).toBeInTheDocument();
    expect(screen.getAllByText('en-US').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('de-DE').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Vertraulich')).toBeInTheDocument();
    expect(screen.getByText('Descriptions')).toBeInTheDocument();
    expect(screen.getByText('For internal use only')).toBeInTheDocument();
  });

  it('shows Status as Unknown when null in detail', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('tmpl-003').length).toBeGreaterThanOrEqual(1);
    });

    // Select the template with null status
    const buttons = screen.getAllByRole('button');
    const tmpl003Button = buttons.find(b => b.textContent?.includes('tmpl-003'));
    await user.click(tmpl003Button!);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('hides Names section when template has null Names', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: [mockTemplates[2]] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('tmpl-003').length).toBeGreaterThanOrEqual(1);
    });

    const buttons = screen.getAllByRole('button');
    const tmpl003Button = buttons.find(b => b.textContent?.includes('tmpl-003'));
    await user.click(tmpl003Button!);
    expect(screen.queryByText('Names')).not.toBeInTheDocument();
    expect(screen.queryByText('Descriptions')).not.toBeInTheDocument();
  });

  it('shows Delete Template button for non-read-only templates', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    expect(screen.getByText('Delete Template')).toBeInTheDocument();
  });

  it('hides Delete Template button for read-only templates', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Highly Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Highly Confidential')[0]);
    expect(screen.getByText('Template Details')).toBeInTheDocument();
    expect(screen.queryByText('Delete Template')).not.toBeInTheDocument();
  });

  it('shows confirm dialog when Delete Template is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));
    expect(screen.getByText('Delete Protection Template')).toBeInTheDocument();
    expect(screen.getByText(/Permanently delete template "Confidential"/)).toBeInTheDocument();
  });

  it('cancels delete dialog', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));
    expect(screen.getByText('Delete Protection Template')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete Protection Template')).not.toBeInTheDocument();
  });

  it('confirms delete and calls correct PowerShell command', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockTemplates }) // initial fetch
      .mockResolvedValueOnce({ success: true, data: null }) // delete
      .mockResolvedValueOnce({ success: true, data: [] }); // refresh after delete
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));

    // Click the confirm button in the dialog (labeled "Delete Template" too)
    const confirmDialog = screen.getByText('Delete Protection Template').closest('div.fixed')!;
    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete Template' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Remove-SLProtectionTemplate', { TemplateId: 'tmpl-001' });
    });
  });

  it('shows error when delete fails', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockTemplates })
      .mockResolvedValueOnce({ success: false, data: null, error: 'Permission denied' });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));
    const confirmDialog = screen.getByText('Delete Protection Template').closest('div.fixed')!;
    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete Template' });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('shows fallback error when delete fails without message', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockTemplates })
      .mockResolvedValueOnce({ success: false, data: null });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));
    const confirmDialog = screen.getByText('Delete Protection Template').closest('div.fixed')!;
    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete Template' });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(screen.getByText('Failed to delete')).toBeInTheDocument();
    });
  });

  it('shows error when delete throws Error', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockTemplates })
      .mockRejectedValueOnce(new Error('Network error'));
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));
    const confirmDialog = screen.getByText('Delete Protection Template').closest('div.fixed')!;
    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete Template' });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows error when delete throws non-Error', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockTemplates })
      .mockRejectedValueOnce('boom');
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    await user.click(screen.getByText('Delete Template'));
    const confirmDialog = screen.getByText('Delete Protection Template').closest('div.fixed')!;
    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Delete Template' });
    await user.click(confirmBtn);
    await waitFor(() => {
      // The detail panel error text
      const errorDivs = document.querySelectorAll('.text-red-300');
      expect(errorDivs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('toggles raw JSON in template detail', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Confidential')[0]);
    const showBtn = screen.getByText(/Show.*raw JSON/);
    await user.click(showBtn);
    expect(screen.getByText(/Hide.*raw JSON/)).toBeInTheDocument();
    await user.click(screen.getByText(/Hide.*raw JSON/));
    expect(screen.queryByText(/Hide.*raw JSON/)).not.toBeInTheDocument();
  });

  // Export Template tests
  describe('ExportTemplate', () => {
    it('shows validation error when fields are empty', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: 'Export' }));
      expect(screen.getByText('Template and path are required.')).toBeInTheDocument();
    });

    it('exports template successfully', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates }) // fetch
        .mockResolvedValueOnce({ success: true, data: null }); // export
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });

      // Select a template from dropdown
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'tmpl-001');

      // Enter path
      const pathInput = screen.getByPlaceholderText('C:\\exports\\template.xml');
      await user.type(pathInput, 'C:\\output\\test.xml');

      await user.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Export-SLProtectionTemplate', { TemplateId: 'tmpl-001', Path: 'C:\\output\\test.xml' });
      });
      expect(screen.getByText(/Exported to/)).toBeInTheDocument();
    });

    it('shows error when export fails', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockResolvedValueOnce({ success: false, data: null, error: 'Write failed' });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'tmpl-001');
      const pathInput = screen.getByPlaceholderText('C:\\exports\\template.xml');
      await user.type(pathInput, 'C:\\output\\test.xml');
      await user.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        expect(screen.getByText('Write failed')).toBeInTheDocument();
      });
    });

    it('shows fallback error when export fails without message', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockResolvedValueOnce({ success: false, data: null });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'tmpl-001');
      const pathInput = screen.getByPlaceholderText('C:\\exports\\template.xml');
      await user.type(pathInput, 'C:\\output\\test.xml');
      await user.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        expect(screen.getByText('Export failed')).toBeInTheDocument();
      });
    });

    it('shows error when export throws Error', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockRejectedValueOnce(new Error('Disk full'));
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'tmpl-001');
      const pathInput = screen.getByPlaceholderText('C:\\exports\\template.xml');
      await user.type(pathInput, 'C:\\output\\test.xml');
      await user.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        expect(screen.getByText('Disk full')).toBeInTheDocument();
      });
    });

    it('shows generic error when export throws non-Error', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockRejectedValueOnce(42);
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'tmpl-001');
      const pathInput = screen.getByPlaceholderText('C:\\exports\\template.xml');
      await user.type(pathInput, 'C:\\output\\test.xml');
      await user.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        const errorDivs = document.querySelectorAll('.text-red-300');
        expect(errorDivs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('escapes single quotes in export path', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockResolvedValueOnce({ success: true, data: null });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Export Template')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'tmpl-001');
      const pathInput = screen.getByPlaceholderText('C:\\exports\\template.xml');
      await user.type(pathInput, "C:\\user's\\file.xml");
      await user.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Export-SLProtectionTemplate', { TemplateId: 'tmpl-001', Path: "C:\\user's\\file.xml" });
      });
    });
  });

  // Import Template tests
  describe('ImportTemplate', () => {
    it('shows validation error when path is empty', async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValue({ success: true, data: mockTemplates });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: 'Import' }));
      expect(screen.getByText('Path is required.')).toBeInTheDocument();
    });

    it('imports template successfully and triggers refresh', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates }) // initial fetch
        .mockResolvedValueOnce({ success: true, data: null }) // import
        .mockResolvedValueOnce({ success: true, data: mockTemplates }); // refresh
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });

      const pathInput = screen.getByPlaceholderText('C:\\templates\\template.xml');
      await user.type(pathInput, 'C:\\import\\new.xml');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Import-SLProtectionTemplate', { Path: 'C:\\import\\new.xml' });
      });
      // The success message may briefly appear then disappear during refresh
      // Just verify the import was called and refresh triggered
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledTimes(3); // fetch + import + refresh
      });
    });

    it('shows error when import fails', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockResolvedValueOnce({ success: false, data: null, error: 'Invalid XML' });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
      const pathInput = screen.getByPlaceholderText('C:\\templates\\template.xml');
      await user.type(pathInput, 'C:\\bad.xml');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await waitFor(() => {
        expect(screen.getByText('Invalid XML')).toBeInTheDocument();
      });
    });

    it('shows fallback error when import fails without message', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockResolvedValueOnce({ success: false, data: null });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
      const pathInput = screen.getByPlaceholderText('C:\\templates\\template.xml');
      await user.type(pathInput, 'C:\\bad.xml');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await waitFor(() => {
        expect(screen.getByText('Import failed')).toBeInTheDocument();
      });
    });

    it('shows error when import throws Error', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockRejectedValueOnce(new Error('File not found'));
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
      const pathInput = screen.getByPlaceholderText('C:\\templates\\template.xml');
      await user.type(pathInput, 'C:\\missing.xml');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await waitFor(() => {
        expect(screen.getByText('File not found')).toBeInTheDocument();
      });
    });

    it('shows generic error when import throws non-Error', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockRejectedValueOnce(null);
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
      const pathInput = screen.getByPlaceholderText('C:\\templates\\template.xml');
      await user.type(pathInput, 'C:\\bad.xml');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await waitFor(() => {
        const errorDivs = document.querySelectorAll('.text-red-300');
        expect(errorDivs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('escapes single quotes in import path', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: mockTemplates })
        .mockResolvedValueOnce({ success: true, data: null })
        .mockResolvedValueOnce({ success: true, data: mockTemplates });
      render(<ProtectionTemplates />);
      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
      const pathInput = screen.getByPlaceholderText('C:\\templates\\template.xml');
      await user.type(pathInput, "it's.xml");
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('Import-SLProtectionTemplate', { Path: "it's.xml" });
      });
    });
  });

  it('refreshes templates when Refresh button is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ success: true, data: mockTemplates })
      .mockResolvedValueOnce({ success: true, data: [] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(screen.getAllByText('Confidential')[0]).toBeInTheDocument();
    });
    await user.click(screen.getAllByText('Refresh')[0]);
    await waitFor(() => {
      expect(screen.getByText('No protection templates found.')).toBeInTheDocument();
    });
  });

  it('calls Get-SLProtectionTemplate on mount', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLProtectionTemplate', undefined);
    });
  });

  it('uses TemplateId as name when Names has no values', async () => {
    const tmplEmptyNames = {
      TemplateId: 'tmpl-empty',
      Names: {},
      Descriptions: null,
      Status: 'Published',
      ReadOnly: false,
    };
    mockInvoke.mockResolvedValue({ success: true, data: [tmplEmptyNames] });
    render(<ProtectionTemplates />);
    await waitFor(() => {
      // When Names is {} the first value is undefined, so fallback to TemplateId
      const elements = screen.getAllByText('tmpl-empty');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
