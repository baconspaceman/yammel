// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAdvancedView } from '../state/viewMode';
import { TEST_GAME } from '../../difficulty/testGame';
import type { OptionSchema } from '../../schema/types';
import { OptionCard } from './OptionCard';

const O = TEST_GAME.options as Record<string, OptionSchema>;
const toggle = O['death_link']!;
const choice = O['mode']!;
const lives = O['lives']!; // range 1..9

function show(option: OptionSchema, raw: unknown, extra: { locked?: boolean; onToggleLock?: (key: string) => void } = {}) {
  const onEdit = vi.fn(() => true);
  const onToggleLock = extra.onToggleLock ?? vi.fn();
  render(
    <OptionCard
      game="G"
      option={option}
      raw={raw}
      rawJson={JSON.stringify(raw) ?? ''}
      onEdit={onEdit}
      locked={extra.locked ?? false}
      onToggleLock={onToggleLock}
    />,
  );
  return { onEdit, onToggleLock };
}

afterEach(() => vi.restoreAllMocks());

describe('OptionCard random controls', () => {
  // These are the Advanced view's controls (Roll now, Lock, chances); the Simple view has its own tests.
  beforeEach(() => setAdvancedView(true));
  afterEach(() => setAdvancedView(false));

  it('offers Roll now, a way to decide the value, and a lock on options that can be random', () => {
    show(toggle, undefined);
    expect(screen.getByRole('button', { name: 'Roll now: Death Link' })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'How Death Link is decided' }) as HTMLSelectElement).value).toBe('fixed');
    expect(screen.getByRole('button', { name: 'Lock Death Link' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('offers nothing of the kind on free text', () => {
    show(O['notes']!, undefined);
    expect(screen.queryByRole('button', { name: /^Roll/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('Roll now writes a real value of the right kind', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const t = show(toggle, undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Roll now: Death Link' }));
    expect(t.onEdit).toHaveBeenCalledWith([{ op: 'set', game: 'G', option: 'death_link', value: true }]);
  });

  it('Roll now writes a number inside the range', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = show(lives, undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Roll now: Lives' }));
    expect(r.onEdit).toHaveBeenCalledWith([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
  });

  it('choosing Random writes Archipelago text; the leaning modes are only on numbers', async () => {
    const c = show(choice, undefined);
    const decide = screen.getByRole('combobox', { name: 'How Mode is decided' });
    expect(within(decide).getAllByRole('option').map((o) => o.textContent)).toEqual(['Fixed value', 'Random', 'Weighted values']);
    await userEvent.selectOptions(decide, 'random');
    expect(c.onEdit).toHaveBeenCalledWith([{ op: 'set', game: 'G', option: 'mode', value: 'random' }]);
  });

  it('numbers offer leaning and range modes', async () => {
    const r = show(lives, undefined);
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual([
      'fixed',
      'random',
      'random-low',
      'random-middle',
      'random-high',
      'range',
      'weighted',
    ]);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'random-high');
    expect(r.onEdit).toHaveBeenLastCalledWith([{ op: 'set', game: 'G', option: 'lives', value: 'random-high' }]);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'range');
    expect(r.onEdit).toHaveBeenLastCalledWith([{ op: 'set', game: 'G', option: 'lives', value: 'random-range-1-9' }]);
  });

  it('shows a random value as a plain sentence, with no switch or note about Advanced mode', () => {
    show(toggle, 'random');
    expect(screen.getByText('Random: on or off, decided when the seed is generated.')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/edited in Advanced mode/)).toBeNull();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('random');
  });

  it('going back to a fixed value resets the option to its default', async () => {
    const c = show(lives, 'random-low');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('random-low');
    await userEvent.selectOptions(screen.getByRole('combobox'), 'fixed');
    expect(c.onEdit).toHaveBeenCalledWith([{ op: 'reset', game: 'G', option: 'lives' }]);
  });

  it('edits the two ends of a random range', async () => {
    const c = show(lives, 'random-range-2-5');
    const to = screen.getByRole('textbox', { name: 'Lives: random to' });
    await userEvent.clear(to);
    await userEvent.type(to, '8{Enter}');
    expect(c.onEdit).toHaveBeenCalledWith([{ op: 'set', game: 'G', option: 'lives', value: 'random-range-2-8' }]);
    const from = screen.getByRole('textbox', { name: 'Lives: random from' });
    await userEvent.clear(from);
    await userEvent.type(from, '3{Enter}');
    expect(c.onEdit).toHaveBeenLastCalledWith([{ op: 'set', game: 'G', option: 'lives', value: 'random-range-3-5' }]);
  });

  it('refuses a range end outside the option', async () => {
    const c = show(lives, 'random-range-2-5');
    const to = screen.getByRole('textbox', { name: 'Lives: random to' });
    await userEvent.clear(to);
    await userEvent.type(to, '12{Enter}');
    expect(c.onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Must be between/);
  });

  it('shows weighted values as weights, not as a fixed value', () => {
    show(lives, { 3: 50, 5: 50 });
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('weighted');
    expect(screen.getByRole('group', { name: 'Weighted values for Lives' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Other/ })).toBeNull();
  });

  it('keeps an unusual random form read-only with its old note', () => {
    show(lives, 'random-range-low-1-5');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('custom');
    expect(screen.getByText(/Edit that form in the Raw tab/)).toBeTruthy();
  });

  it('a real choice that starts with "random" is still a choice', () => {
    const odd: OptionSchema = {
      ...choice,
      key: 'pick',
      displayName: 'Pick',
      default: 'random_balanced',
      choices: [
        { key: 'random_balanced', label: 'Balanced' },
        { key: 'fixed', label: 'Fixed' },
      ],
    };
    show(odd, 'random_balanced');
    expect(screen.queryByText(/Random: any of the choices/)).toBeNull();
    expect((screen.getByRole('combobox', { name: 'How Pick is decided' }) as HTMLSelectElement).value).toBe('fixed');
  });

  it('the buttons are named with their visible words first, for voice control', () => {
    show(toggle, undefined);
    expect(screen.getByRole('button', { name: 'Roll now: Death Link' }).textContent).toBe('Roll now');
    expect(screen.getByRole('button', { name: 'Lock Death Link' }).textContent).toBe('Lock');
  });

  it('cannot Roll now on an option that has nothing to roll', () => {
    const empty: OptionSchema = { ...choice, key: 'empty', displayName: 'Empty', choices: [] };
    show(empty, undefined);
    expect((screen.getByRole('button', { name: 'Roll now: Empty' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the lock reflects its state and reports a click', async () => {
    const onToggleLock = vi.fn();
    show(toggle, undefined, { locked: true, onToggleLock });
    const button = screen.getByRole('button', { name: 'Lock Death Link' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('Lock'); // the visible word stays the same so the button's name always contains it
    await userEvent.click(button);
    expect(onToggleLock).toHaveBeenCalledWith('death_link');
  });
});
