import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TextField,
  TextArea,
  SelectField,
  NumberField,
  ToggleField,
  TagInput,
  FormActions,
} from '../../../renderer/components/common/FormFields';

describe('TextField', () => {
  const defaultProps = {
    label: 'Name',
    value: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label', () => {
    render(<TextField {...defaultProps} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders input with value', () => {
    render(<TextField {...defaultProps} value="hello" />);
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
  });

  it('renders placeholder', () => {
    render(<TextField {...defaultProps} placeholder="Enter name" />);
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument();
  });

  it('renders required indicator', () => {
    render(<TextField {...defaultProps} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not render required indicator when not required', () => {
    render(<TextField {...defaultProps} />);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('calls onChange when typing', async () => {
    const user = userEvent.setup();
    render(<TextField {...defaultProps} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'a');
    expect(defaultProps.onChange).toHaveBeenCalledWith('a');
  });

  it('renders disabled state', () => {
    render(<TextField {...defaultProps} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders mono style', () => {
    render(<TextField {...defaultProps} mono />);
    expect(screen.getByRole('textbox').className).toContain('font-mono');
  });

  it('renders help text', () => {
    render(<TextField {...defaultProps} helpText="This is help" />);
    expect(screen.getByText('This is help')).toBeInTheDocument();
  });

  it('does not render help text when not provided', () => {
    const { container } = render(<TextField {...defaultProps} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('TextArea', () => {
  const defaultProps = {
    label: 'Description',
    value: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label', () => {
    render(<TextArea {...defaultProps} />);
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('renders textarea with value', () => {
    render(<TextArea {...defaultProps} value="some text" />);
    expect(screen.getByDisplayValue('some text')).toBeInTheDocument();
  });

  it('renders with default rows', () => {
    render(<TextArea {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('rows', '3');
  });

  it('renders with custom rows', () => {
    render(<TextArea {...defaultProps} rows={5} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('rows', '5');
  });

  it('calls onChange when typing', async () => {
    const user = userEvent.setup();
    render(<TextArea {...defaultProps} />);
    await user.type(screen.getByRole('textbox'), 'x');
    expect(defaultProps.onChange).toHaveBeenCalledWith('x');
  });

  it('renders disabled state', () => {
    render(<TextArea {...defaultProps} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders placeholder', () => {
    render(<TextArea {...defaultProps} placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('renders help text', () => {
    render(<TextArea {...defaultProps} helpText="Help msg" />);
    expect(screen.getByText('Help msg')).toBeInTheDocument();
  });

  it('does not render help text when not provided', () => {
    const { container } = render(<TextArea {...defaultProps} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('SelectField', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ];

  const defaultProps = {
    label: 'Category',
    value: '',
    onChange: vi.fn(),
    options,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label', () => {
    render(<SelectField {...defaultProps} />);
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('renders options including default Select...', () => {
    render(<SelectField {...defaultProps} />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('renders required indicator', () => {
    render(<SelectField {...defaultProps} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('calls onChange when selecting', async () => {
    const user = userEvent.setup();
    render(<SelectField {...defaultProps} />);
    await user.selectOptions(screen.getByRole('combobox'), 'a');
    expect(defaultProps.onChange).toHaveBeenCalledWith('a');
  });

  it('renders disabled state', () => {
    render(<SelectField {...defaultProps} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders help text', () => {
    render(<SelectField {...defaultProps} helpText="Select one" />);
    expect(screen.getByText('Select one')).toBeInTheDocument();
  });

  it('does not render help text when not provided', () => {
    const { container } = render(<SelectField {...defaultProps} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('NumberField', () => {
  const defaultProps = {
    label: 'Count',
    value: '' as number | '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label', () => {
    render(<NumberField {...defaultProps} />);
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  it('renders input with numeric value', () => {
    render(<NumberField {...defaultProps} value={42} />);
    expect(screen.getByDisplayValue('42')).toBeInTheDocument();
  });

  it('renders required indicator', () => {
    render(<NumberField {...defaultProps} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('calls onChange with number on input', async () => {
    const user = userEvent.setup();
    render(<NumberField {...defaultProps} />);
    await user.type(screen.getByRole('spinbutton'), '5');
    expect(defaultProps.onChange).toHaveBeenCalledWith(5);
  });

  it('calls onChange with empty string when cleared', async () => {
    const user = userEvent.setup();
    render(<NumberField {...defaultProps} value={5} />);
    await user.clear(screen.getByRole('spinbutton'));
    expect(defaultProps.onChange).toHaveBeenCalledWith('');
  });

  it('renders disabled state', () => {
    render(<NumberField {...defaultProps} disabled />);
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });

  it('renders min and max attributes', () => {
    render(<NumberField {...defaultProps} min={0} max={100} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });

  it('renders placeholder', () => {
    render(<NumberField {...defaultProps} placeholder="Enter count" />);
    expect(screen.getByPlaceholderText('Enter count')).toBeInTheDocument();
  });

  it('renders help text', () => {
    render(<NumberField {...defaultProps} helpText="Max 100" />);
    expect(screen.getByText('Max 100')).toBeInTheDocument();
  });

  it('does not render help text when not provided', () => {
    const { container } = render(<NumberField {...defaultProps} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

describe('ToggleField', () => {
  const defaultProps = {
    label: 'Enable Feature',
    checked: false,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label', () => {
    render(<ToggleField {...defaultProps} />);
    expect(screen.getByText('Enable Feature')).toBeInTheDocument();
  });

  it('renders switch with unchecked state', () => {
    render(<ToggleField {...defaultProps} />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('renders switch with checked state', () => {
    render(<ToggleField {...defaultProps} checked />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup();
    render(<ToggleField {...defaultProps} />);
    await user.click(screen.getByRole('switch'));
    expect(defaultProps.onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when checked is true', async () => {
    const user = userEvent.setup();
    render(<ToggleField {...defaultProps} checked />);
    await user.click(screen.getByRole('switch'));
    expect(defaultProps.onChange).toHaveBeenCalledWith(false);
  });

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup();
    render(<ToggleField {...defaultProps} disabled />);
    await user.click(screen.getByRole('switch'));
    expect(defaultProps.onChange).not.toHaveBeenCalled();
  });

  it('renders help text', () => {
    render(<ToggleField {...defaultProps} helpText="Toggle this" />);
    expect(screen.getByText('Toggle this')).toBeInTheDocument();
  });

  it('does not render help text when not provided', () => {
    const { container } = render(<ToggleField {...defaultProps} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('applies checked styling', () => {
    render(<ToggleField {...defaultProps} checked />);
    const sw = screen.getByRole('switch');
    expect(sw.className).toContain('bg-blue-600');
  });

  it('applies unchecked styling', () => {
    render(<ToggleField {...defaultProps} />);
    const sw = screen.getByRole('switch');
    expect(sw.className).toContain('bg-zinc-700');
  });
});

describe('TagInput', () => {
  const defaultProps = {
    label: 'Tags',
    values: [] as string[],
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label', () => {
    render(<TagInput {...defaultProps} />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('renders existing tags', () => {
    render(<TagInput {...defaultProps} values={['tag1', 'tag2']} />);
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
  });

  it('renders placeholder when no values', () => {
    render(<TagInput {...defaultProps} placeholder="Add tags" />);
    expect(screen.getByPlaceholderText('Add tags')).toBeInTheDocument();
  });

  it('renders "Add more..." placeholder when has values', () => {
    render(<TagInput {...defaultProps} values={['tag1']} placeholder="Add tags" />);
    expect(screen.getByPlaceholderText('Add more...')).toBeInTheDocument();
  });

  it('adds tag on Enter key', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'newtag{Enter}');
    expect(defaultProps.onChange).toHaveBeenCalledWith(['newtag']);
  });

  it('adds tag on comma key', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'newtag,');
    expect(defaultProps.onChange).toHaveBeenCalledWith(['newtag']);
  });

  it('adds tag on blur', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'blurtag');
    await user.tab(); // blur
    expect(defaultProps.onChange).toHaveBeenCalledWith(['blurtag']);
  });

  it('does not add duplicate tags', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} values={['existing']} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'existing{Enter}');
    // onChange should not be called with duplicate - it just clears input
    // The trimmed value equals existing, so onChange is not called
    expect(defaultProps.onChange).not.toHaveBeenCalledWith(['existing', 'existing']);
  });

  it('does not add empty tags', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('textbox');
    await user.type(input, '{Enter}');
    // Should not add empty tag
    expect(defaultProps.onChange).not.toHaveBeenCalledWith(['']);
  });

  it('removes tag on x click', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} values={['tag1', 'tag2']} />);
    const removeButtons = screen.getAllByText('x');
    await user.click(removeButtons[0]);
    expect(defaultProps.onChange).toHaveBeenCalledWith(['tag2']);
  });

  it('removes last tag on Backspace when input is empty', async () => {
    const user = userEvent.setup();
    render(<TagInput {...defaultProps} values={['tag1', 'tag2']} />);
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(defaultProps.onChange).toHaveBeenCalledWith(['tag1']);
  });

  it('does not render remove buttons when disabled', () => {
    render(<TagInput {...defaultProps} values={['tag1']} disabled />);
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('does not render input when disabled', () => {
    render(<TagInput {...defaultProps} disabled />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders help text', () => {
    render(<TagInput {...defaultProps} helpText="Comma separated" />);
    expect(screen.getByText('Comma separated')).toBeInTheDocument();
  });

  it('does not render help text when not provided', () => {
    const { container } = render(<TagInput {...defaultProps} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });
});

describe('FormActions', () => {
  const defaultProps = {
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Save and Cancel buttons', () => {
    render(<FormActions {...defaultProps} />);
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom save label', () => {
    render(<FormActions {...defaultProps} saveLabel="Create" />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('shows Saving... when saving', () => {
    render(<FormActions {...defaultProps} saving />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('disables buttons when saving', () => {
    render(<FormActions {...defaultProps} saving />);
    expect(screen.getByText('Saving...')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('calls onSave when Save is clicked', async () => {
    const user = userEvent.setup();
    render(<FormActions {...defaultProps} />);
    await user.click(screen.getByText('Save'));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<FormActions {...defaultProps} />);
    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('renders Delete button when onDelete is provided and not new', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<FormActions {...defaultProps} onDelete={onDelete} />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
    await user.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('does not render Delete button when isNew', () => {
    render(<FormActions {...defaultProps} onDelete={vi.fn()} isNew />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('does not render Delete button when onDelete is not provided', () => {
    render(<FormActions {...defaultProps} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});
