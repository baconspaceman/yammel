// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OptionSchema } from '../../../schema/types';
import { describeOption } from '../../state/options';
import { ChoiceControl } from './ChoiceControl';
import { NamedRangeControl } from './NamedRangeControl';
import { NumberField } from './NumberField';
import { OptionControl } from './OptionControl';
import { RangeControl } from './RangeControl';
import { TextControl } from './TextControl';
import { ToggleControl } from './ToggleControl';

describe('ToggleControl', () => {
  it('shows its state and flips it on click', async () => {
    const onCommit = vi.fn();
    render(<ToggleControl id="t" label="Hard Mode" value={false} onCommit={onCommit} />);
    const sw = screen.getByRole('switch', { name: 'Hard Mode' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toBe('Off');
    await userEvent.click(sw);
    expect(onCommit).toHaveBeenCalledWith(true);
  });
});

describe('ChoiceControl', () => {
  it('lists the choices and reports the chosen key', async () => {
    const onCommit = vi.fn();
    render(
      <ChoiceControl
        id="c"
        label="Difficulty"
        value="easy"
        choices={[
          { key: 'easy', label: 'Easy' },
          { key: 'hard', label: 'Hard' },
        ]}
        onCommit={onCommit}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Difficulty' }) as HTMLSelectElement;
    expect(select.value).toBe('easy');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Easy', 'Hard']);
    await userEvent.selectOptions(select, 'hard');
    expect(onCommit).toHaveBeenCalledWith('hard');
  });
});

describe('NumberField', () => {
  const setup = (value = 5) => {
    const onCommit = vi.fn();
    render(<NumberField id="n" label="Lives" value={value} min={1} max={10} onCommit={onCommit} />);
    return { onCommit, input: screen.getByRole('textbox', { name: 'Lives' }) as HTMLInputElement };
  };

  it('writes a valid number on Enter', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '8{Enter}');
    expect(onCommit).toHaveBeenCalledWith(8);
  });

  it('writes a valid number when focus leaves', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '3');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(3);
  });

  it('shows an error instead of writing an invalid number', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '99{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Must be between 1 and 10.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not write when nothing changed, and Escape restores the old value', async () => {
    const { onCommit, input } = setup();
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.type(input, '7{Escape}');
    expect(input.value).toBe('5');
  });
});

describe('RangeControl', () => {
  it('writes once when a slider change ends, not on every step', () => {
    const onCommit = vi.fn();
    render(<RangeControl id="r" label="Lives" value={5} min={1} max={10} onCommit={onCommit} />);
    const slider = screen.getByRole('slider', { name: 'Lives' });
    fireEvent.change(slider, { target: { value: '6' } });
    fireEvent.change(slider, { target: { value: '7' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyUp(slider);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it('does not write when a shortcut key such as Ctrl+Z is released on the slider', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<RangeControl id="r" label="Lives" value={5} min={1} max={10} onCommit={onCommit} />);
    const slider = screen.getByRole('slider', { name: 'Lives' });
    fireEvent.change(slider, { target: { value: '6' } });
    // the shortcut handler undid the change elsewhere; the value is still 5 here when the keys come up
    fireEvent.keyUp(slider, { key: 'z', ctrlKey: true });
    fireEvent.keyUp(slider, { key: 'Control' });
    expect(onCommit).not.toHaveBeenCalled();
    rerender(<RangeControl id="r" label="Lives" value={5} min={1} max={10} onCommit={onCommit} />);
  });

  it('has a number box that also writes', async () => {
    const onCommit = vi.fn();
    render(<RangeControl id="r" label="Lives" value={5} min={1} max={10} onCommit={onCommit} />);
    const box = screen.getByRole('textbox', { name: 'Lives (number)' });
    await userEvent.clear(box);
    await userEvent.type(box, '2{Enter}');
    expect(onCommit).toHaveBeenCalledWith(2);
  });
});

describe('NamedRangeControl', () => {
  const props = { id: 'n', label: 'Amount', min: 0, max: 100, names: { none: 0, all: 100 }, customStart: 50 };

  it('picks a special name', async () => {
    const onCommit = vi.fn();
    render(<NamedRangeControl {...props} value={50} onCommit={onCommit} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Amount' }), 'all');
    expect(onCommit).toHaveBeenCalledWith('all');
  });

  it('shows a number box for a number and hides it for a name', () => {
    const { rerender } = render(<NamedRangeControl {...props} value={42} onCommit={() => undefined} />);
    expect((screen.getByRole('textbox', { name: 'Amount (number)' }) as HTMLInputElement).value).toBe('42');
    rerender(<NamedRangeControl {...props} value="none" onCommit={() => undefined} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('switching from a name to Custom number starts from the default number', async () => {
    const onCommit = vi.fn();
    render(<NamedRangeControl {...props} value="none" onCommit={onCommit} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Amount' }), '__custom__');
    expect(onCommit).toHaveBeenCalledWith(50);
  });
});

describe('TextControl', () => {
  it('writes on Enter and on blur but only when changed', async () => {
    const onCommit = vi.fn();
    render(<TextControl id="x" label="Note" value="hi" onCommit={onCommit} />);
    const box = screen.getByRole('textbox', { name: 'Note' });
    await userEvent.click(box);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.type(box, '!{Enter}');
    expect(onCommit).toHaveBeenCalledWith('hi!');
  });

  it('offers suggestions without limiting the text', () => {
    render(
      <TextControl id="x" label="Pick" value="a" suggestions={[{ key: 'a', label: 'Apple' }]} onCommit={() => undefined} />,
    );
    expect(document.querySelectorAll('datalist option')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Pick' })).toBeTruthy();
  });
});

describe('OptionControl', () => {
  const base: OptionSchema = {
    key: 'thing',
    kind: 'toggle',
    displayName: 'Thing',
    description: '',
    default: false,
    visibility: ['simple_ui'],
    supportsWeighting: true,
  };

  it('renders the right control for each editable kind', () => {
    const cases: [OptionSchema, unknown, string][] = [
      [base, false, 'switch'],
      [{ ...base, kind: 'choice', default: 'a', choices: [{ key: 'a', label: 'A' }] }, 'a', 'combobox'],
      [{ ...base, kind: 'range', default: 1, min: 0, max: 5 }, 1, 'slider'],
      [{ ...base, kind: 'named_range', default: 1, min: 0, max: 5, specialNames: { none: 0 } }, 1, 'combobox'],
      [{ ...base, kind: 'free_text', default: '' }, 'x', 'textbox'],
    ];
    for (const [option, raw, role] of cases) {
      const { unmount } = render(
        <OptionControl id="o" option={option} state={describeOption(option, raw)} onCommit={() => undefined} />,
      );
      expect(screen.getAllByRole(role).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('starts a named range at its minimum when the default is a special value outside the range', async () => {
    const option: OptionSchema = {
      ...base,
      kind: 'named_range',
      default: -1,
      min: 5,
      max: 99,
      specialNames: { default: -1 },
    };
    const onCommit = vi.fn();
    render(<OptionControl id="o" option={option} state={describeOption(option, undefined)} onCommit={onCommit} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('default');
    await userEvent.selectOptions(select, '__custom__');
    expect(onCommit).toHaveBeenCalledWith(5);
  });

  it('starts a named range at its default when that is a number inside the range', async () => {
    const option: OptionSchema = { ...base, kind: 'named_range', default: 46, min: 1, max: 46, specialNames: { all: -1 } };
    const onCommit = vi.fn();
    render(<OptionControl id="o" option={option} state={describeOption(option, -1)} onCommit={onCommit} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), '__custom__');
    expect(onCommit).toHaveBeenCalledWith(46);
  });

  it('renders nothing for a kind Simple mode cannot edit', () => {
    const option: OptionSchema = { ...base, kind: 'set', default: [] };
    const { container } = render(
      <OptionControl id="o" option={option} state={describeOption(option, undefined)} onCommit={() => undefined} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
