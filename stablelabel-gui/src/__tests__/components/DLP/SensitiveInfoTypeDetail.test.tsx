import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SensitiveInfoTypeDetail from '../../../renderer/components/DLP/SensitiveInfoTypeDetail';
import { mockInvoke } from '../../setup';

const mockSit = {
  Name: 'U.S. Social Security Number',
  Id: 'a44669fe-0d48-4d00-a3b5-12345abcde',
  Description: 'Detects U.S. Social Security Numbers in content',
  Publisher: 'Microsoft Corporation',
  Type: 'BuiltIn',
  RecommendedConfidence: 85,
};

describe('SensitiveInfoTypeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<SensitiveInfoTypeDetail sitName="U.S. Social Security Number" />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(3);
  });

  it('fetches type with correct command', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSit });
    render(<SensitiveInfoTypeDetail sitName="U.S. Social Security Number" />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLSensitiveInfoType', { Identity: 'U.S. Social Security Number' });
    });
  });

  it('escapes single quotes in name', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSit });
    render(<SensitiveInfoTypeDetail sitName="It's a type" />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLSensitiveInfoType', { Identity: "It's a type" });
    });
  });

  it('displays type name and description', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSit });
    render(<SensitiveInfoTypeDetail sitName="U.S. Social Security Number" />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.getByText('Detects U.S. Social Security Numbers in content')).toBeInTheDocument();
  });

  it('displays ID, Publisher, RecommendedConfidence, and Type', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSit });
    render(<SensitiveInfoTypeDetail sitName="U.S. Social Security Number" />);
    await waitFor(() => {
      expect(screen.getByText('a44669fe-0d48-4d00-a3b5-12345abcde')).toBeInTheDocument();
    });
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
    expect(screen.getByText('Publisher')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Recommended Confidence')).toBeInTheDocument();
    expect(screen.getByText('BuiltIn')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('does not show Custom badge for Microsoft Corporation', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockSit });
    render(<SensitiveInfoTypeDetail sitName="U.S. Social Security Number" />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    // There should be no "Custom" badge in the header
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('shows Custom badge for non-Microsoft publisher', async () => {
    const customSit = { ...mockSit, Publisher: 'Contoso Inc.' };
    mockInvoke.mockResolvedValue({ success: true, data: customSit });
    render(<SensitiveInfoTypeDetail sitName="Custom Type" />);
    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });
  });

  it('does not show Custom badge when Publisher is null', async () => {
    const nullPub = { ...mockSit, Publisher: null };
    mockInvoke.mockResolvedValue({ success: true, data: nullPub });
    render(<SensitiveInfoTypeDetail sitName="No Publisher Type" />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('shows N/A for null publisher in card', async () => {
    const nullPub = { ...mockSit, Publisher: null };
    mockInvoke.mockResolvedValue({ success: true, data: nullPub });
    render(<SensitiveInfoTypeDetail sitName="No Publisher Type" />);
    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  it('hides RecommendedConfidence card when null', async () => {
    const noConf = { ...mockSit, RecommendedConfidence: null };
    mockInvoke.mockResolvedValue({ success: true, data: noConf });
    render(<SensitiveInfoTypeDetail sitName="Test" />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.queryByText('Recommended Confidence')).not.toBeInTheDocument();
  });

  it('hides Type card when null', async () => {
    const noType = { ...mockSit, Type: null };
    mockInvoke.mockResolvedValue({ success: true, data: noType });
    render(<SensitiveInfoTypeDetail sitName="Test" />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.queryByText('Type')).not.toBeInTheDocument();
  });

  it('hides description when null', async () => {
    const noDesc = { ...mockSit, Description: null };
    mockInvoke.mockResolvedValue({ success: true, data: noDesc });
    render(<SensitiveInfoTypeDetail sitName="Test" />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.queryByText('Detects U.S. Social Security Numbers in content')).not.toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Not found' });
    render(<SensitiveInfoTypeDetail sitName="Missing Type" />);
    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('renders "Not found" when fetch returns null without error', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<SensitiveInfoTypeDetail sitName="Missing Type" />);
    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('toggles raw JSON', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockSit });
    render(<SensitiveInfoTypeDetail sitName="U.S. Social Security Number" />);
    await waitFor(() => {
      expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Show raw JSON/));
    expect(screen.getByText(/Hide raw JSON/)).toBeInTheDocument();
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain('U.S. Social Security Number');

    await user.click(screen.getByText(/Hide raw JSON/));
    expect(screen.getByText(/Show raw JSON/)).toBeInTheDocument();
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });
});
