import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DataTable from '../DataTable';
import type { Column } from '../DataTable';

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: Column<TestRow>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'value', header: 'Value', render: (r) => r.value },
];

const sampleData: TestRow[] = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={sampleData} keyFn={(r) => r.id} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={columns} data={sampleData} keyFn={(r) => r.id} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows default empty message when data is empty', () => {
    render(<DataTable columns={columns} data={[]} keyFn={(r) => r.id} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('shows custom empty message when provided', () => {
    render(
      <DataTable columns={columns} data={[]} keyFn={(r) => r.id} emptyMessage="Nothing here" />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('does not render a table element when data is empty', () => {
    const { container } = render(<DataTable columns={columns} data={[]} keyFn={(r) => r.id} />);
    expect(container.querySelector('table')).toBeNull();
  });
});
