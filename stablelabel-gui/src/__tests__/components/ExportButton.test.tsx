import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportButton from '../../renderer/components/common/ExportButton';

describe('ExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders the export button', () => {
    render(<ExportButton data={{ a: 1 }} filename="test" />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<ExportButton data={{ a: 1 }} filename="test" label="Download" />);
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('shows format picker when CSV config is provided with array data', () => {
    render(
      <ExportButton
        data={[{ name: 'test' }]}
        filename="test"
        csvHeaders={['Name']}
        csvRowMapper={(item) => [(item as { name: string }).name]}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not show format picker without CSV config', () => {
    render(<ExportButton data={{ a: 1 }} filename="test" />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('triggers download on click', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'a') {
        const el = origCreateElement('a', options);
        el.click = clickSpy;
        return el;
      }
      return origCreateElement(tag, options);
    });

    render(<ExportButton data={{ a: 1 }} filename="test" />);
    await user.click(screen.getByText('Export'));
    expect(clickSpy).toHaveBeenCalled();
  });
});
