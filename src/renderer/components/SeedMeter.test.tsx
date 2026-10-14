// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Rating } from '../../difficulty/types';
import type { CountOk } from '../../shared/api';
import type { CounterState } from '../state/checkCounter';
import { SeedMeter } from './SeedMeter';

const ok = (checks: number, extra: Partial<CountOk> = {}): CountOk => ({
  ok: true,
  checks,
  items: checks,
  unresolved: [],
  invalid: [],
  ms: 1,
  ...extra,
});

const RATING: Rating = {
  source: 'rated',
  status: 'drafted',
  score: 4.5,
  label: 'Moderate',
  contributions: [],
  approximated: [],
  note: 'A draft rating.',
};

function show(state: CounterState, rating: Rating | null = null) {
  render(<SeedMeter state={state} rating={rating} />);
  return screen.getByRole('region', { name: 'Seed statistics' });
}

describe('SeedMeter', () => {
  it('shows the difficulty next to the checks, and a dash when there is nothing to rate', () => {
    const empty = show({ status: 'idle' });
    expect(within(empty).getByText('Difficulty')).toBeTruthy();
    expect(within(empty).queryByRole('meter')).toBeNull();
    cleanup();
    const region = show({ status: 'idle' }, RATING);
    expect(within(region).getByTestId('difficulty-value').textContent).toBe('4.5');
    expect(within(region).getByRole('meter', { name: 'Difficulty' })).toBeTruthy();
  });

  it('shows a dash when nothing has been counted yet', () => {
    const region = show({ status: 'idle' });
    expect(within(region).getByTestId('checks-value').textContent).toBe('—');
  });

  it('says "Calculating" before the first number exists', () => {
    const region = show({ status: 'calculating', last: null });
    expect(within(region).getByTestId('checks-value').textContent).toBe('Calculating…');
  });

  it('keeps the previous number (marked as out of date) while updating', () => {
    const region = show({ status: 'calculating', last: ok(223) });
    const value = within(region).getByTestId('checks-value');
    expect(value.textContent).toBe('223');
    expect(value.getAttribute('data-stale')).toBe('true');
    expect(within(region).getByText('updating…')).toBeTruthy();
  });

  it('shows the count and, when it differs, the default with the difference', () => {
    const region = show({ status: 'ready', result: ok(195), baseline: ok(223) });
    expect(within(region).getByTestId('checks-value').textContent).toBe('195');
    expect(within(region).getByTestId('checks-value').getAttribute('data-stale')).toBe('false');
    expect(within(region).getByText('default 223 (−28)')).toBeTruthy();
  });

  it('shows a plus sign when there are more checks than the default', () => {
    const region = show({ status: 'ready', result: ok(7), baseline: ok(6) });
    expect(within(region).getByText('default 6 (+1)')).toBeTruthy();
  });

  it('says nothing about the default when it matches or is not known yet', () => {
    const same = show({ status: 'ready', result: ok(6), baseline: ok(6) });
    expect(within(same).queryByText(/default/)).toBeNull();
  });

  it('explains random, weighted and invalid options that were not counted', () => {
    const region = show({
      status: 'ready',
      baseline: null,
      result: ok(6, { unresolved: ['goal', 'mode'], invalid: [{ key: 'hard_mode', message: 'bad value' }] }),
    });
    expect(within(region).getByText('Random or weighted settings are counted at their defaults: goal, mode.')).toBeTruthy();
    expect(within(region).getByText('Not counted because they are not valid for this game: hard_mode.')).toBeTruthy();
  });

  it('shows unavailable with the reason, never a number', () => {
    const region = show({ status: 'unavailable', message: 'No Archipelago source folder was found.' });
    expect(within(region).getByTestId('checks-value').textContent).toBe('Unavailable');
    expect(within(region).getByText('No Archipelago source folder was found.')).toBeTruthy();
  });

  it('shows an error with the reason and keeps the last good number marked as out of date', () => {
    const region = show({ status: 'error', message: 'Counting the checks took too long.', last: ok(11) });
    const value = within(region).getByTestId('checks-value');
    expect(value.textContent).toBe('11');
    expect(value.getAttribute('data-stale')).toBe('true');
    expect(within(region).getByText('Counting the checks took too long.')).toBeTruthy();
  });

  it('announces changes politely to screen readers', () => {
    const region = show({ status: 'ready', result: ok(5), baseline: null });
    expect(region.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
