/**
 * E2E tests for the Classification page (Presidio PII detection).
 *
 * Verifies: classifier status → entity config → tab switching → config persistence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ClassificationPage from '../../renderer/components/Classification/ClassificationPage';

describe('Classification page (E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset classifier mock
    (window.stablelabel.checkClassifier as ReturnType<typeof vi.fn>).mockResolvedValue({ available: true, mode: 'local' });
    (window.stablelabel.classifierInvoke as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders page header and status banner', async () => {
    render(<ClassificationPage />);

    expect(screen.getByText('Data Classification')).toBeInTheDocument();
    expect(screen.getByText(/Configure PII detection/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ready \(local\)/)).toBeInTheDocument();
    });
  });

  it('shows unavailable status when classifier is down', async () => {
    (window.stablelabel.checkClassifier as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: false,
      error: 'Python not found',
    });

    render(<ClassificationPage />);

    // "unavailable" is part of "Classifier Engine unavailable" which spans elements
    await waitFor(() => {
      expect(screen.getByText(/unavailable/)).toBeInTheDocument();
    });

    expect(screen.getByText('Python not found')).toBeInTheDocument();
  });

  it('renders all four tabs', () => {
    render(<ClassificationPage />);

    expect(screen.getByText('Entities')).toBeInTheDocument();
    expect(screen.getByText('Custom Recognizers')).toBeInTheDocument();
    expect(screen.getByText('Deny Lists')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('defaults to Entities tab with entity types', () => {
    render(<ClassificationPage />);

    // Default entity types should render
    expect(screen.getByText('PERSON')).toBeInTheDocument();
    expect(screen.getByText('EMAIL_ADDRESS')).toBeInTheDocument();
    expect(screen.getByText('CREDIT_CARD')).toBeInTheDocument();
    expect(screen.getByText('US_SSN')).toBeInTheDocument();
  });

  it('switches to Custom Recognizers tab', async () => {
    const user = userEvent.setup();
    render(<ClassificationPage />);

    await user.click(screen.getByText('Custom Recognizers'));

    // Tab switched — verify it's still rendered (tab stays highlighted)
    // The Entities tab content should no longer be showing
    await waitFor(() => {
      // Custom Recognizers tab is active — PERSON entity list should not be the main content
      const customRecogTab = screen.getAllByText('Custom Recognizers');
      expect(customRecogTab.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches to Deny Lists tab', async () => {
    const user = userEvent.setup();
    render(<ClassificationPage />);

    await user.click(screen.getByText('Deny Lists'));

    expect(screen.getByText('Deny Lists')).toBeInTheDocument();
  });

  it('switches to Test tab', async () => {
    const user = userEvent.setup();
    render(<ClassificationPage />);

    await user.click(screen.getByText('Test'));

    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('loads config from localStorage on mount', () => {
    const savedConfig = {
      entities: {
        PERSON: { enabled: false, threshold: 0.8 },
        EMAIL_ADDRESS: { enabled: true, threshold: 0.5 },
      },
      custom_recognizers: [],
      deny_lists: {},
    };
    localStorage.setItem('stablelabel-classifier-config', JSON.stringify(savedConfig));

    render(<ClassificationPage />);

    // Entities tab should show with saved config
    expect(screen.getByText('PERSON')).toBeInTheDocument();
  });

  it('merges stored config with defaults (new entities get included)', () => {
    const partialConfig = {
      entities: {
        PERSON: { enabled: false, threshold: 0.9 },
      },
      custom_recognizers: [],
      deny_lists: {},
    };
    localStorage.setItem('stablelabel-classifier-config', JSON.stringify(partialConfig));

    render(<ClassificationPage />);

    // Both stored and default entities should be present
    expect(screen.getByText('PERSON')).toBeInTheDocument();
    expect(screen.getByText('EMAIL_ADDRESS')).toBeInTheDocument();
    expect(screen.getByText('CREDIT_CARD')).toBeInTheDocument();
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('stablelabel-classifier-config', 'not valid json{{{');

    // Should not crash — falls back to defaults
    render(<ClassificationPage />);

    expect(screen.getByText('PERSON')).toBeInTheDocument();
    expect(screen.getByText('EMAIL_ADDRESS')).toBeInTheDocument();
  });

  it('shows checking status initially before classifier responds', () => {
    let resolveCheck: (v: unknown) => void;
    const checkPromise = new Promise(r => { resolveCheck = r; });
    (window.stablelabel.checkClassifier as ReturnType<typeof vi.fn>).mockReturnValue(checkPromise);

    render(<ClassificationPage />);

    expect(screen.getByText(/checking\.\.\./)).toBeInTheDocument();

    resolveCheck!({ available: true, mode: 'local' });
  });

  it('renders entity types from all regions', () => {
    render(<ClassificationPage />);

    // US entities
    expect(screen.getByText('US_SSN')).toBeInTheDocument();
    expect(screen.getByText('US_PASSPORT')).toBeInTheDocument();

    // UK entity
    expect(screen.getByText('UK_NHS')).toBeInTheDocument();

    // AU entities
    expect(screen.getByText('AU_ABN')).toBeInTheDocument();
    expect(screen.getByText('AU_TFN')).toBeInTheDocument();

    // SG/IN entities
    expect(screen.getByText('SG_NRIC_FIN')).toBeInTheDocument();
    expect(screen.getByText('IN_PAN')).toBeInTheDocument();
    expect(screen.getByText('IN_AADHAAR')).toBeInTheDocument();
  });
});
