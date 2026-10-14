// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NudgeResult } from '../../assistant/nudge';
import type { Rating } from '../../difficulty/types';
import { DifficultyGauge, type AimControl } from './DifficultyGauge';

const RATING: Rating = { source: 'rated', status: 'drafted', score: 4.4, label: 'Moderate', contributions: [], approximated: [], note: 'A draft.' };

function setup(suggest: (target: number) => NudgeResult, rating: Rating = RATING) {
  const apply = vi.fn();
  const aim: AimControl = { suggest: vi.fn(suggest), apply };
  render(<DifficultyGauge rating={rating} aim={aim} />);
  return { aim, apply };
}

describe('Aim for a difficulty', () => {
  it('is offered for a rated game, and not for a rough estimate or without the control', () => {
    setup(() => ({ ok: false, message: 'x' }));
    expect(screen.getByRole('button', { name: 'Aim for a difficulty' })).toBeTruthy();
  });

  it('is not offered for an estimated rating', () => {
    setup(() => ({ ok: false, message: 'x' }), { ...RATING, source: 'estimated', status: null });
    expect(screen.queryByRole('button', { name: 'Aim for a difficulty' })).toBeNull();
  });

  it('is not offered when no control is passed', () => {
    render(<DifficultyGauge rating={RATING} />);
    expect(screen.queryByRole('button', { name: 'Aim for a difficulty' })).toBeNull();
  });

  it('starts the slider at the current difficulty, shows its word, and shows the changes before anything is applied', async () => {
    const { aim, apply } = setup(() => ({
      ok: true,
      nudge: { edits: [{ op: 'set', game: 'G', option: 'x', value: 1 }], changes: ['Turn on Swordless'], before: 4.4, after: 7.1 },
    }));
    await userEvent.click(screen.getByRole('button', { name: 'Aim for a difficulty' }));
    const slider = screen.getByRole('slider', { name: 'Drag to the difficulty you want' }) as HTMLInputElement;
    expect(slider.value).toBe('4.5');
    fireEvent.change(slider, { target: { value: '7' } });
    expect(screen.getByText(/7\.0 · /)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show the changes' }));
    expect(aim.suggest).toHaveBeenCalledWith(7);
    expect(screen.getByText('Turn on Swordless')).toBeTruthy();
    expect(screen.getByText(/from 4\.4 to about 7\.1/)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Apply these changes' }));
    expect(apply).toHaveBeenCalledWith([{ op: 'set', game: 'G', option: 'x', value: 1 }]);
    expect(screen.queryByRole('region', { name: 'Aim for a difficulty' })).toBeNull();
  });

  it('drops a suggestion when the YAML changes underneath it, so an old suggestion cannot be applied', async () => {
    const apply = vi.fn();
    const make = (): AimControl => ({ suggest: () => ({ ok: true, nudge: { edits: [{ op: 'set', game: 'G', option: 'x', value: 1 }], changes: ['Turn on Swordless'], before: 4.4, after: 7 } }), apply });
    const { rerender } = render(<DifficultyGauge rating={RATING} aim={make()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Aim for a difficulty' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show the changes' }));
    // (the slider is at the current value here, so use a moved one)
    fireEvent.change(screen.getByRole('slider', { name: 'Drag to the difficulty you want' }), { target: { value: '7' } });
    await userEvent.click(screen.getByRole('button', { name: 'Show the changes' }));
    expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy();
    rerender(<DifficultyGauge rating={{ ...RATING, score: 3.1 }} aim={make()} />);
    expect(screen.queryByRole('button', { name: 'Apply these changes' })).toBeNull();
    expect((screen.getByRole('slider', { name: 'Drag to the difficulty you want' }) as HTMLInputElement).value).toBe('3');
    expect(apply).not.toHaveBeenCalled();
  });

  it('shows a plain message when nothing can be suggested, and moving the slider clears an old suggestion', async () => {
    setup((target) => (target > 8 ? { ok: false, message: 'It is already about as hard as this game can be.' } : { ok: true, nudge: { edits: [], changes: ['Change a'], before: 4.4, after: 6 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Aim for a difficulty' }));
    const slider = screen.getByRole('slider', { name: 'Drag to the difficulty you want' });
    fireEvent.change(slider, { target: { value: '9' } });
    await userEvent.click(screen.getByRole('button', { name: 'Show the changes' }));
    expect(screen.getByTestId('aim-result').textContent).toContain('already about as hard');
    fireEvent.change(slider, { target: { value: '6' } });
    expect(screen.queryByTestId('aim-result')).toBeNull();
  });
});
