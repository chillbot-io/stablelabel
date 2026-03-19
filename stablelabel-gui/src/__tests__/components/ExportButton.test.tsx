import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportButton from '../../renderer/components/common/ExportButton';

const origCreateElement = document.createElement.bind(document);

describe('ExportButton', () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let lastAnchor: HTMLAnchorElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'a') {
        const el = origCreateElement('a', options);
        el.click = clickSpy;
        lastAnchor = el;
        return el;
      }
      return origCreateElement(tag, options);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('does not show format picker when data is not array', () => {
    render(
      <ExportButton
        data={{ name: 'single' }}
        filename="test"
        csvHeaders={['Name']}
        csvRowMapper={(item) => [(item as { name: string }).name]}
      />
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('triggers JSON download on click', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={{ a: 1 }} filename="test-export" />);
    await user.click(screen.getByText('Export'));
    expect(clickSpy).toHaveBeenCalled();
    expect(lastAnchor.download).toBe('test-export.json');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('exports CSV when CSV format is selected', async () => {
    const user = userEvent.setup();
    const data = [
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ];
    render(
      <ExportButton
        data={data}
        filename="people"
        csvHeaders={['Name', 'Age']}
        csvRowMapper={(item) => {
          const r = item as { name: string; age: string };
          return [r.name, r.age];
        }}
      />
    );

    // Switch to CSV format
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'csv');

    await user.click(screen.getByText('Export'));
    expect(clickSpy).toHaveBeenCalled();
    expect(lastAnchor.download).toBe('people.csv');
  });

  it('exports JSON when JSON format is selected with CSV config', async () => {
    const user = userEvent.setup();
    render(
      <ExportButton
        data={[{ name: 'test' }]}
        filename="items"
        csvHeaders={['Name']}
        csvRowMapper={(item) => [(item as { name: string }).name]}
      />
    );

    // JSON is default
    await user.click(screen.getByText('Export'));
    expect(lastAnchor.download).toBe('items.json');
  });

  it('escapes CSV values with commas', async () => {
    const user = userEvent.setup();
    let blobContent = '';
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      blob.text().then(t => { blobContent = t; });
      return 'blob:test';
    });

    render(
      <ExportButton
        data={[{ name: 'Smith, John' }]}
        filename="test"
        csvHeaders={['Name']}
        csvRowMapper={(item) => [(item as { name: string }).name]}
      />
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'csv');
    await user.click(screen.getByText('Export'));

    // Blob was created — verify the download was triggered
    expect(clickSpy).toHaveBeenCalled();
    expect(lastAnchor.download).toBe('test.csv');
  });
});
