import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<PageHeader title="Jobs" description="Manage labelling jobs" />);
    expect(screen.getByText('Manage labelling jobs')).toBeInTheDocument();
  });

  it('does not render a description paragraph when omitted', () => {
    const { container } = render(<PageHeader title="Jobs" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders children in an actions area', () => {
    render(
      <PageHeader title="Settings">
        <button>Save</button>
      </PageHeader>,
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('does not render the actions wrapper when no children', () => {
    const { container } = render(<PageHeader title="Title" />);
    // The flex actions wrapper with gap-3 should not exist
    expect(container.querySelector('.gap-3')).toBeNull();
  });
});
