// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Rating } from '../../difficulty/types';
import { RandomizePanel, type RandomizeOutcome } from './RandomizePanel';

const RATED: Rating = {
  source: 'rated',
  status: 'drafted',
  score: 4.5,
  label: 'Moderate',
  contributions: [],
  approximated: [],
  note: 'A draft.',
};
const NONE: Rating = { source: 'none', status: null, score: null, label: null, contributions: [], approximated: [], note: 'None.' };

function show(
  props: { rating?: Rating | null; randomizable?: number; locked?: number; weighted?: number; outcome?: RandomizeOutcome } = {},
) {
  const onRandomize = vi.fn(() => props.outcome ?? { ok: true, message: 'Randomized 5 options.' });
  const onLockSet = vi.fn();
  const onClearLocks = vi.fn();
  render(
    <RandomizePanel
      id="p"
      randomizable={props.randomizable ?? 10}
      locked={props.locked ?? 0}
      weighted={props.weighted ?? 0}
      rating={props.rating === undefined ? RATED : props.rating}
      onRandomize={onRandomize}
      onLockSet={onLockSet}
      onClearLocks={onClearLocks}
    />,
  );
  return { onRandomize, onLockSet, onClearLocks };
}

describe('RandomizePanel', () => {
  it('says how many options will be re-rolled and how many are locked', () => {
    show({ randomizable: 10, locked: 3 });
    expect(screen.getByText(/Re-rolls 7 of 10 options in one step/)).toBeTruthy();
    expect(screen.getByText(/3 locked options stay as they are\./)).toBeTruthy();
  });

  it('counts weighted options as left alone', () => {
    show({ randomizable: 10, locked: 2, weighted: 3 });
    expect(screen.getByText(/Re-rolls 5 of 10 options/)).toBeTruthy();
    expect(screen.getByText(/3 weighted options are left alone too\./)).toBeTruthy();
  });

  it('says nothing is locked, and reads well for one option', () => {
    show({ randomizable: 1, locked: 1 });
    expect(screen.getByText(/Re-rolls 0 of 1 option in one step/)).toBeTruthy();
    expect(screen.getByText(/1 locked option stays as it is\./)).toBeTruthy();
  });

  it('randomizes with no band by default and shows the outcome as a status', async () => {
    const p = show();
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    expect(p.onRandomize).toHaveBeenCalledWith(null);
    expect(screen.getByRole('status').textContent).toBe('Randomized 5 options.');
  });

  it('keeps the band inputs off until asked, then passes the band', async () => {
    const p = show();
    const low = screen.getByRole('spinbutton', { name: 'Lowest difficulty' }) as HTMLInputElement;
    expect(low.disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /Keep the difficulty between/ }));
    expect(low.disabled).toBe(false);
    await userEvent.clear(low);
    await userEvent.type(low, '2.5');
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    expect(p.onRandomize).toHaveBeenCalledWith({ min: 2.5, max: 7 });
  });

  it('refuses a band that makes no sense without randomizing anything', async () => {
    const p = show();
    await userEvent.click(screen.getByRole('checkbox', { name: /Keep the difficulty between/ }));
    const high = screen.getByRole('spinbutton', { name: 'Highest difficulty' });
    await userEvent.clear(high);
    await userEvent.type(high, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    expect(p.onRandomize).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/low end of the band must not be higher/);

    await userEvent.clear(high);
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    expect(screen.getByRole('status').textContent).toMatch(/Enter a number from 0 to 10/);

    await userEvent.type(high, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    expect(screen.getByRole('status').textContent).toMatch(/between 0 and 10/);
    expect(p.onRandomize).not.toHaveBeenCalled();
  });

  it('turns the band off for a game with no difficulty rating, and says why', async () => {
    const p = show({ rating: NONE });
    expect((screen.getByRole('checkbox', { name: /Keep the difficulty between/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('This game has no difficulty rating, so there is no band to keep.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    expect(p.onRandomize).toHaveBeenCalledWith(null);
  });

  it('also has no band when there is no rating at all', () => {
    show({ rating: null });
    expect((screen.getByRole('checkbox', { name: /Keep the difficulty between/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it('shows the current difficulty and what an estimate means', () => {
    show({ rating: { ...RATED, source: 'estimated', status: 'estimated' } });
    expect(screen.getByText(/Difficulty now: 4.5 \(Moderate, estimated\)/)).toBeTruthy();
  });

  it('shows a failure in the same place, in the failure style', async () => {
    show({ outcome: { ok: false, message: 'Nothing fit.' } });
    await userEvent.click(screen.getByRole('button', { name: 'Randomize everything' }));
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Nothing fit.');
    expect(status.className).toContain('randompanel__message--bad');
  });

  it('locks the options already set, and clears locks only when there are some', async () => {
    const none = show({ locked: 0 });
    expect((screen.getByRole('button', { name: 'Clear all locks' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Lock the options I have set' }));
    expect(none.onLockSet).toHaveBeenCalledTimes(1);
  });

  it('clears locks when asked', async () => {
    const some = show({ locked: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Clear all locks' }));
    expect(some.onClearLocks).toHaveBeenCalledTimes(1);
  });
});
