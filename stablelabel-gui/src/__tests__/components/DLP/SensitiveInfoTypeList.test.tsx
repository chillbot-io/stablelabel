import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SensitiveInfoTypeList from '../../../renderer/components/DLP/SensitiveInfoTypeList';
import { mockInvoke } from '../../setup';

const mockTypes = [
  {
    Name: 'U.S. Social Security Number',
    Id: 'sit-1',
    Description: 'Detects SSN patterns',
    Publisher: 'Microsoft Corporation',
    Type: 'BuiltIn',
    RecommendedConfidence: 85,
  },
  {
    Name: 'Credit Card Number',
    Id: 'sit-2',
    Description: 'Detects credit card patterns',
    Publisher: 'Microsoft Corporation',
    Type: 'BuiltIn',
    RecommendedConfidence: 75,
  },
  {
    Name: 'Custom Employee ID',
    Id: 'sit-3',
    Description: 'Custom employee ID pattern',
    Publisher: 'Contoso Inc.',
    Type: 'Custom',
    RecommendedConfidence: 90,
  },
];

describe('SensitiveInfoTypeList', () => {
  const onOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    const pulses = document.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(5);
  });

  it('fetches and displays sensitive info types', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.getByText('Credit Card Number')).toBeInTheDocument();
    expect(screen.getByText('Custom Employee ID')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLSensitiveInfoType');
  });

  it('displays count of types', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('3 of 3 types')).toBeInTheDocument();
    });
  });

  it('shows Custom badge for non-Microsoft publishers', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });
  });

  it('does not show Custom badge for Microsoft Corporation types', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [mockTypes[0]] });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('does not show Custom badge when Publisher is null', async () => {
    const typeNullPublisher = { ...mockTypes[0], Publisher: null };
    mockInvoke.mockResolvedValue({ success: true, data: [typeNullPublisher] });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('renders error state with retry', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null, error: 'Connection failed' });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows generic error when no error message', async () => {
    mockInvoke.mockResolvedValue({ success: false, data: null });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('handles invoke exception', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'));
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockInvoke.mockRejectedValue('string error');
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('retries fetch on Retry click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Error' });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    mockInvoke.mockResolvedValueOnce({ success: true, data: mockTypes });
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
  });

  it('calls onOpen when a type is clicked', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    await user.click(screen.getByText('U.S. Social Security Number'));
    expect(onOpen).toHaveBeenCalledWith('U.S. Social Security Number');
  });

  it('filters types by search text', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search info types...'), 'Credit');
    expect(screen.getByText('Credit Card Number')).toBeInTheDocument();
    expect(screen.queryByText('U.S. Social Security Number')).not.toBeInTheDocument();
  });

  it('updates filtered count when searching', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('3 of 3 types')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search info types...'), 'Credit');
    expect(screen.getByText('1 of 3 types')).toBeInTheDocument();
  });

  it('shows empty message when search has no results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search info types...'), 'ZZZNOEXIST');
    expect(screen.getByText('No sensitive info types found.')).toBeInTheDocument();
  });

  it('toggles custom only filter', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });

    // Click to toggle custom only
    mockInvoke.mockResolvedValue({ success: true, data: [mockTypes[2]] });
    await user.click(screen.getByText('All Types'));
    await waitFor(() => {
      expect(screen.getByText('Custom Only')).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLSensitiveInfoType -CustomOnly');
  });

  it('toggles back from custom only to all types', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });

    // Toggle to custom only
    mockInvoke.mockResolvedValue({ success: true, data: [mockTypes[2]] });
    await user.click(screen.getByText('All Types'));
    await waitFor(() => {
      expect(screen.getByText('Custom Only')).toBeInTheDocument();
    });

    // Toggle back to all
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    await user.click(screen.getByText('Custom Only'));
    await waitFor(() => {
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith('Get-SLSensitiveInfoType');
  });

  it('shows empty message when API returns empty array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: [] });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('No sensitive info types found.')).toBeInTheDocument();
    });
  });

  it('refreshes on Refresh click', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ success: true, data: mockTypes });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('U.S. Social Security Number')).toBeInTheDocument();
    });
    mockInvoke.mockResolvedValue({ success: true, data: [mockTypes[1]] });
    await user.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(screen.getByText('Credit Card Number')).toBeInTheDocument();
    });
  });

  it('renders error when data is not array', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: 'not-array' });
    render(<SensitiveInfoTypeList onOpen={onOpen} />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });
});
