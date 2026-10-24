// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_GAME } from '../../difficulty/testGame';
import type { OptionSchema } from '../../schema/types';
import { setAdvancedView } from '../state/viewMode';
import { OptionCard } from './OptionCard';

const O = TEST_GAME.options as Record<string, OptionSchema>;
const toggle = O['death_link']!;
const choice = O['mode']!;
const lives = O['lives']!; // range 1..9

function card(option: OptionSchema, raw: unknown, onEdit = vi.fn(() => true)) {
  render(<OptionCard game="G" option={option} raw={raw} rawJson={JSON.stringify(raw ?? null)} onEdit={onEdit} locked={false} onToggleLock={() => undefined} />);
  const article = screen.getByRole('article');
  return { onEdit, article, status: () => article.querySelector('.option__status')?.textContent ?? null };
}

describe('OptionCard in the Simple view (the default)', () => {
  beforeEach(() => setAdvancedView(false));
  afterEach(() => setAdvancedView(false));

  it('says in plain words what state each option is in', () => {
    expect(card(toggle, undefined).status()).toBe('Default');
  });

  it('shows Changed when the file holds a different value', () => {
    const { status, article } = card(toggle, true);
    expect(status()).toBe('Changed');
    expect(article.getAttribute('data-status')).toBe('changed');
  });

  it('shows Random for a random value', () => {
    const { status, article } = card(lives, 'random');
    expect(status()).toBe('Random');
    expect(article.getAttribute('data-status')).toBe('random');
  });

  it('shows Chances set for weighted values', () => {
    const { status } = card(choice, { easy: 50, hard: 50 });
    expect(status()).toBe('Chances set');
  });

  it('has no Roll now, no Lock and no Remove buttons', () => {
    card(choice, 'easy');
    expect(screen.queryByRole('button', { name: /^Roll now/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Lock/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('still lets a person choose a fixed value or random, in one choice', () => {
    card(choice, 'easy');
    const how = screen.getByRole('combobox', { name: 'How Mode is decided' });
    expect(within(how).getAllByRole('option').map((o) => o.textContent)).toEqual(['Fixed value', 'Random']);
  });

  it('offers the leaning and range choices on a number', () => {
    card(lives, 5);
    const how = screen.getByRole('combobox', { name: 'How Lives is decided' });
    expect(within(how).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Fixed value',
      'Random',
      'Random, leaning low',
      'Random, leaning middle',
      'Random, leaning high',
      'Random between two numbers',
    ]);
  });

  it('gives a plain control to pick a value with', async () => {
    const { onEdit } = card(choice, 'easy');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mode' }), 'hard');
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('describes chances that are in the file, in words, without showing the editor', () => {
    card(choice, { easy: 50, hard: 50 });
    expect(screen.getByText(/The file has chances set for this option/)).toBeTruthy();
    expect(screen.getByText(/Easy 50%, Hard 50%/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Weighted values for/ })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('shows a weighted value with only one value above 0 as that value, since Archipelago always picks it', () => {
    const { status } = card(choice, { easy: 0, normal: 0, hard: 50 });
    expect((screen.getByRole('combobox', { name: 'Mode' }) as HTMLSelectElement).value).toBe('hard');
    expect(status()).toBe('Changed');
    expect(screen.queryByText(/The file has chances set/)).toBeNull();
  });

  it('names only the values that can be picked in the chances note', () => {
    card(choice, { easy: 50, hard: 50, off: 0 });
    expect(screen.getByText(/Easy 50%, Hard 50%/)).toBeTruthy();
    expect(screen.queryByText(/Off/)).toBeNull();
  });

  it('leaves the chances in the file alone, even though it cannot show them', () => {
    const onEdit = vi.fn(() => true);
    card(choice, { easy: 50, hard: 50 }, onEdit);
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe('OptionCard in the Advanced view', () => {
  beforeEach(() => setAdvancedView(true));
  afterEach(() => setAdvancedView(false));

  it('shows the chances editor, not the plain note', () => {
    card(choice, { easy: 50, hard: 50 });
    expect(screen.getByRole('group', { name: 'Weighted values for Mode' })).toBeTruthy();
    expect(screen.queryByText(/The file has chances set/)).toBeNull();
  });

  it('shows Roll now and Lock again', () => {
    card(lives, 'random');
    expect(screen.getByRole('button', { name: 'Roll now: Lives' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lock Lives' })).toBeTruthy();
  });
});
