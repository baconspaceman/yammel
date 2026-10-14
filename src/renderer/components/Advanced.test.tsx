// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OptionSchema } from '../../schema/types';
import { NameListEditor } from './NameListEditor';
import { RawEditor } from './RawEditor';
import { WeightsEditor } from './WeightsEditor';

const base = { visibility: ['simple_ui'] as OptionSchema['visibility'], description: '', default: undefined, supportsWeighting: true };
const toggle: OptionSchema = { ...base, key: 'hard', kind: 'toggle', displayName: 'Hard', default: false };
const choice: OptionSchema = { ...base, key: 'mode', kind: 'choice', displayName: 'Mode', default: 'a', choices: [{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }, { key: 'c', label: 'Gamma' }] };
const range: OptionSchema = { ...base, key: 'lives', kind: 'range', displayName: 'Lives', default: 5, min: 1, max: 9 };

describe('WeightsEditor', () => {
  it('shows each value with its weight and its chance', () => {
    render(<WeightsEditor option={toggle} weights={{ true: 1, false: 3 }} onChange={vi.fn()} />);
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getByLabelText('25 percent')).toBeTruthy();
    expect(screen.getByLabelText('75 percent')).toBeTruthy();
  });

  it('changes one weight and keeps the others', async () => {
    const onChange = vi.fn();
    render(<WeightsEditor option={choice} weights={{ a: 50, b: 50 }} onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Mode: weight of Alpha' });
    await userEvent.clear(box);
    await userEvent.type(box, '75{Enter}');
    expect(onChange).toHaveBeenCalledWith({ a: 75, b: 50 });
  });

  it('adds a value from the list, removes one, and will not remove the last', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<WeightsEditor option={choice} weights={{ a: 50, b: 50 }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Add a value to Mode' }), 'c');
    expect(onChange).toHaveBeenLastCalledWith({ a: 50, b: 50, c: 50 });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Beta from Mode' }));
    expect(onChange).toHaveBeenLastCalledWith({ a: 50 });
    rerender(<WeightsEditor option={choice} weights={{ a: 50 }} onChange={onChange} />);
    expect((screen.getByRole('button', { name: 'Remove Alpha from Mode' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not remove the only value that has a weight above zero', async () => {
    const onChange = vi.fn();
    render(<WeightsEditor option={choice} weights={{ a: 0, b: 5 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Beta from Mode' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds a number inside the range only, and not one that is already there', async () => {
    const onChange = vi.fn();
    render(<WeightsEditor option={range} weights={{ '5': 50 }} onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Add a number to Lives' });
    await userEvent.type(box, '12{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('Must be between 1 and 9');
    await userEvent.clear(box);
    await userEvent.type(box, '5{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('already in the list');
    await userEvent.clear(box);
    await userEvent.type(box, '8{Enter}');
    expect(onChange).toHaveBeenCalledWith({ '5': 50, '8': 50 });
  });

  it('makes all weights equal', async () => {
    const onChange = vi.fn();
    render(<WeightsEditor option={choice} weights={{ a: 1, b: 9 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Make all equal' }));
    expect(onChange).toHaveBeenCalledWith({ a: 50, b: 50 });
  });

  it('says so when every weight is zero', () => {
    render(<WeightsEditor option={choice} weights={{ a: 0, b: 0 }} onChange={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('At least one weight must be above 0');
  });
});

describe('NameListEditor', () => {
  const pool = ['Bow', 'Silver Bow', 'Bombos', 'Hookshot'];
  const set: OptionSchema = { ...base, key: 'local_items', kind: 'set', displayName: 'Local Items', supportsWeighting: false };
  const counter: OptionSchema = { ...set, key: 'start_inventory', kind: 'counter', displayName: 'Start Inventory' };

  it('shows the default message when empty, and the chosen names otherwise', () => {
    const { rerender } = render(<NameListEditor option={set} pool={pool} entries={{ type: 'names', names: [] }} onChange={vi.fn()} />);
    expect(screen.getByText(/The game's default applies/)).toBeTruthy();
    rerender(<NameListEditor option={set} pool={pool} entries={{ type: 'names', names: ['Bow'] }} onChange={vi.fn()} />);
    expect(within(screen.getByRole('list', { name: 'Chosen for Local Items' })).getByText('Bow')).toBeTruthy();
    expect(screen.getByText('1 chosen')).toBeTruthy();
  });

  it('suggests matching names and adds the one clicked', async () => {
    const onChange = vi.fn();
    render(<NameListEditor option={set} pool={pool} entries={{ type: 'names', names: [] }} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to Local Items' }), 'bom');
    await userEvent.click(within(screen.getByRole('list', { name: 'Matching names for Local Items' })).getByRole('button', { name: 'Bombos' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'names', names: ['Bombos'] });
  });

  it('adds the only match on Enter, and refuses a name that is not in the game', async () => {
    const onChange = vi.fn();
    render(<NameListEditor option={set} pool={pool} entries={{ type: 'names', names: [] }} onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Add to Local Items' });
    await userEvent.type(box, 'hook{Enter}');
    expect(onChange).toHaveBeenCalledWith({ type: 'names', names: ['Hookshot'] });
    onChange.mockClear();
    await userEvent.clear(box);
    await userEvent.type(box, 'Banana{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('not a name in this game');
  });

  it('asks which one when several names match', async () => {
    const onChange = vi.fn();
    render(<NameListEditor option={set} pool={pool} entries={{ type: 'names', names: [] }} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to Local Items' }), 'bo');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('More than one name matches');
  });

  it('removes a name, and does not offer one that is already chosen', async () => {
    const onChange = vi.fn();
    render(<NameListEditor option={set} pool={pool} entries={{ type: 'names', names: ['Bow', 'Hookshot'] }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bow from Local Items' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'names', names: ['Hookshot'] });
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to Local Items' }), 'bow');
    expect(within(screen.getByRole('list', { name: 'Matching names for Local Items' })).queryByRole('button', { name: 'Bow' })).toBeNull();
  });

  it('counts: starts at 1, and edits a count', async () => {
    const onChange = vi.fn();
    render(<NameListEditor option={counter} pool={pool} entries={{ type: 'counts', counts: { Bow: 1 } }} onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Start Inventory: how many Bow' });
    await userEvent.clear(box);
    await userEvent.type(box, '3{Enter}');
    expect(onChange).toHaveBeenCalledWith({ type: 'counts', counts: { Bow: 3 } });
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to Start Inventory' }), 'hookshot{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'counts', counts: { Bow: 1, Hookshot: 1 } });
  });

  it('takes any text when the game has no name list', async () => {
    const onChange = vi.fn();
    render(<NameListEditor option={set} pool={null} entries={{ type: 'names', names: [] }} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to Local Items' }), 'Anything{Enter}');
    expect(onChange).toHaveBeenCalledWith({ type: 'names', names: ['Anything'] });
  });
});

describe('RawEditor', () => {
  const TEXT = 'name: P\ngame: G\nG:\n  a: 1\n';

  it('starts matching the editor, with Apply and Revert off', () => {
    render(<RawEditor text={TEXT} onApply={vi.fn(() => null)} />);
    expect(screen.getByText('Matches the editor')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Revert' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies changed text once, and reverts typing', async () => {
    const onApply = vi.fn(() => null);
    render(<RawEditor text={TEXT} onApply={onApply} />);
    const box = screen.getByRole('textbox', { name: 'Raw YAML text' });
    await userEvent.type(box, '# note');
    expect(screen.getByText('Not applied yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(`${TEXT}# note`);
    await userEvent.click(screen.getByRole('button', { name: 'Revert' }));
    expect((box as HTMLTextAreaElement).value).toBe(TEXT);
  });

  it('will not apply text that is not a readable YAML, and says where the problem is', async () => {
    const onApply = vi.fn(() => null);
    render(<RawEditor text={TEXT} onApply={onApply} />);
    const box = screen.getByRole('textbox', { name: 'Raw YAML text' });
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste('name: [unclosed');
    expect(within(screen.getByRole('list', { name: 'Problems in this text' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows the message when the app refuses the text', async () => {
    render(<RawEditor text={TEXT} onApply={() => 'That text could not be applied.'} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Raw YAML text' }), '# x');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert').textContent).toContain('could not be applied');
  });

  it('follows the YAML when it changes elsewhere, but keeps unapplied typing and says it is behind', async () => {
    const { rerender } = render(<RawEditor text={TEXT} onApply={() => null} />);
    rerender(<RawEditor text={`${TEXT}# changed\n`} onApply={() => null} />);
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Raw YAML text' }) as HTMLTextAreaElement).value).toBe(`${TEXT}# changed\n`));
    await userEvent.type(screen.getByRole('textbox', { name: 'Raw YAML text' }), '# mine');
    rerender(<RawEditor text={`${TEXT}# changed\n# again\n`} onApply={() => null} />);
    expect((screen.getByRole('textbox', { name: 'Raw YAML text' }) as HTMLTextAreaElement).value).toContain('# mine');
    expect(screen.getByText(/changed elsewhere while you were typing/)).toBeTruthy();
  });
});
