// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_STATE, parseRecommenderState, type RecommenderState } from '../../recommend/state';
import { game } from '../../recommend/testGames';
import type { GameInfo } from '../../recommend/types';
import type { ApiResult } from '../../shared/api';
import { seededRandom } from '../../roulette/random';
import { RecommenderScreen, type RecommenderApi } from './RecommenderScreen';

const GENRES = ['platformer', 'rpg', 'shooter', 'puzzle', 'sim', 'strategy'];
const GAMES: GameInfo[] = Array.from({ length: 16 }, (_, i) =>
  game(`Game ${String(i).padStart(2, '0')}`, {
    feel: { genre: GENRES[i % 6]!, pace: 1 + (i % 5), length: 1 + ((i * 3) % 5), tones: [['cozy', 'dark', 'funny'][i % 3]!], activities: [`a${i % 4}`, `b${i % 7}`], era: (['classic', 'mid', 'modern'] as const)[i % 3]! },
    facts: { checks: 30 + i * 20, earlyOpen: i % 4 === 0 ? 0 : 12 },
  }),
);

function fakeApi(initial: RecommenderState = EMPTY_STATE) {
  let stored = parseRecommenderState(initial);
  const api: RecommenderApi & { saved: RecommenderState[] } = {
    saved: [],
    loadRecommender: vi.fn(async () => ({ ok: true, value: structuredClone(stored) }) as ApiResult<RecommenderState>),
    saveRecommender: vi.fn(async (state: RecommenderState) => {
      stored = state;
      api.saved.push(structuredClone(state));
      return { ok: true, value: null } as ApiResult<null>;
    }),
  };
  return api;
}

const setup = async (api = fakeApi(), over: Partial<React.ComponentProps<typeof RecommenderScreen>> = {}) => {
  const onBack = vi.fn();
  const onUse = vi.fn();
  const props = { api, games: GAMES, countLaunch: true, onBack, onUse, random: seededRandom(5), ...over };
  render(<RecommenderScreen {...props} />);
  await screen.findAllByTestId('rec-card');
  return { api, props, onBack, onUse };
};

const cards = () => screen.getAllByTestId('rec-card');
const names = () => cards().map((card) => within(card).getByRole('heading').textContent);

describe('RecommenderScreen', () => {
  it('shows ten ideas on its own, with a score, reasons and a labelled breakdown', async () => {
    await setup();
    expect(cards()).toHaveLength(10);
    const first = cards()[0]!;
    expect(within(first).getByLabelText(/^Score \d+ out of 100$/)).toBeTruthy();
    expect(within(first).getByRole('list', { name: 'Score breakdown' })).toBeTruthy();
    expect(within(first).getAllByText(/Scanned|Drafted/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ten new ones show up each time you start the app/)).toBeTruthy();
  });

  it('counts a launch the first time and remembers the ten as shown', async () => {
    const { api } = await setup();
    await waitFor(() => expect(api.saved.length).toBeGreaterThan(0));
    const last = api.saved[api.saved.length - 1]!;
    expect(last.launches).toBe(1);
    expect(Object.keys(last.shown)).toHaveLength(10);
  });

  it('opening it again in the same run does not count another launch, and shows the same ten', async () => {
    const api = fakeApi();
    const first = await setup(api);
    const before = names();
    await waitFor(() => expect(api.saved.length).toBeGreaterThan(1));
    cleanupRender();
    await setup(api, { countLaunch: false });
    expect(names()).toEqual(before);
    expect(api.saved[api.saved.length - 1]!.launches).toBe(first.api.saved[0]!.launches);
  });

  it('"Use these games" hands the two games to the app', async () => {
    const { onUse } = await setup();
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: 'Use these games' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    const [pair] = onUse.mock.calls[0]!;
    expect(pair).toHaveLength(2);
    expect(pair[0] < pair[1]).toBe(true);
  });

  it('pinning toggles and is saved', async () => {
    const { api } = await setup();
    const pin = within(cards()[0]!).getByRole('button', { name: 'Pin' });
    await userEvent.click(pin);
    expect(within(cards()[0]!).getByRole('button', { name: 'Pinned' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(api.saved[api.saved.length - 1]!.pins).toHaveLength(1));
  });

  it('"Never show this pair" removes the card and brings in a new one, keeping ten', async () => {
    const { api } = await setup();
    const gone = names()[0];
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: 'Never show this pair' }));
    await waitFor(() => expect(names()).not.toContain(gone));
    expect(cards()).toHaveLength(10);
    expect(api.saved[api.saved.length - 1]!.dismissed).toHaveLength(1);
  });

  it('a thumb does not reshuffle the list, and the change it made to the sliders is listed', async () => {
    await setup();
    const before = names();
    await userEvent.click(within(cards()[2]!).getByRole('button', { name: 'Good idea' }));
    expect(names().slice().sort()).toEqual(before.slice().sort());
    await userEvent.click(screen.getByRole('button', { name: 'Tune the scoring' }));
    const list = await screen.findByRole('list', { name: 'Changes made by thumbs' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('"Reset weights" restores the sliders and clears that list', async () => {
    await setup();
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: 'Good idea' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tune the scoring' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset weights' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Changes made by thumbs' })).toBeNull());
    for (const slider of screen.getAllByRole('slider')) expect((slider as HTMLInputElement).value).toBe('1');
  });

  it('"Give me ten more" adds cards that are different from the ones on screen', async () => {
    await setup();
    const before = new Set(names());
    await userEvent.click(screen.getByRole('button', { name: 'Give me ten more' }));
    await waitFor(() => expect(cards().length).toBeGreaterThan(10));
    const added = names().slice(10);
    expect(added.some((n) => before.has(n))).toBe(false);
  });

  it('changing the mood redraws the ten and is saved', async () => {
    const { api } = await setup();
    await userEvent.click(screen.getByRole('radio', { name: 'Opposites attract' }));
    await waitFor(() => expect(api.saved[api.saved.length - 1]!.mood).toBe('opposites'));
    expect(cards()).toHaveLength(10);
  });

  it('"What goes well with" lists that game\'s partners, best first, then goes back', async () => {
    await setup();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Game 03');
    const list = screen.getByRole('list', { name: 'Games that go well with Game 03' });
    const rows = within(list).getAllByTestId('rec-card');
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((row) => within(row).getByRole('heading').textContent!.includes('Game 03'))).toBe(true);
    const scores = rows.map((row) => Number(within(row).getByLabelText(/^Score \d+ out of 100$/).textContent));
    for (let i = 1; i < scores.length; i += 1) expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(cards()).toHaveLength(10);
  });

  it('a pair is never shown twice, even with ten more', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Give me ten more' }));
    await waitFor(() => expect(cards().length).toBeGreaterThan(10));
    expect(new Set(names()).size).toBe(names().length);
  });

  it('says so, and keeps working, when the history cannot be loaded or saved', async () => {
    const api = fakeApi();
    api.loadRecommender = vi.fn(async () => ({ ok: false, message: 'Request refused.' }) as ApiResult<RecommenderState>);
    api.saveRecommender = vi.fn(async () => ({ ok: false, message: 'Your recommendation history could not be saved.' }) as ApiResult<null>);
    await setup(api);
    expect(cards()).toHaveLength(10);
    expect((await screen.findAllByRole('alert'))[0]!.textContent).toMatch(/refused|could not be saved/);
  });

  it('with no games at all it says there is nothing to suggest', async () => {
    const api = fakeApi();
    render(<RecommenderScreen api={api} games={[]} countLaunch onBack={vi.fn()} onUse={vi.fn()} />);
    expect(await screen.findByText('Nothing to suggest.')).toBeTruthy();
  });

  it('Back calls onBack', async () => {
    const { onBack } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});

function cleanupRender(): void {
  document.body.innerHTML = '';
}
