import { describe, expect, it } from 'vitest';
import { scorePair } from './score';
import {
  EMPTY_STATE,
  NUDGE,
  beginLaunch,
  clearHistory,
  dismissPair,
  parseRecommenderState,
  recordShown,
  resetWeights,
  setDislike,
  setFavourite,
  setMood,
  setPick,
  setPinned,
  setThumb,
  setWeight,
} from './state';
import { game } from './testGames';
import { DEFAULT_WEIGHTS } from './types';

const pair = scorePair(game('A', { facts: { checks: 100 } }), game('B', { facts: { checks: 100 } }));

describe('parseRecommenderState', () => {
  it('gives the empty state for nothing or garbage, and never the shared object', () => {
    for (const raw of [undefined, null, 4, 'x', [], {}]) expect(parseRecommenderState(raw)).toEqual(EMPTY_STATE);
    const a = parseRecommenderState({});
    a.pins.push('x');
    a.weights.length = 9;
    expect(EMPTY_STATE.pins).toEqual([]);
    expect(EMPTY_STATE.weights.length).toBe(1);
  });

  it('keeps good fields and drops bad ones one at a time', () => {
    const state = parseRecommenderState({
      launches: 7.9,
      shown: { a: 3, b: 'x' },
      pins: ['p', 4, 'p', ''],
      thumbs: { t: 1, u: 2, v: -1 },
      weights: { vibe: 5, length: -3, friction: 'x', startup: 0.5 },
      mood: 'opposites',
      nudges: [{ pair: 'p', part: 'vibe', delta: 0.05 }, { pair: 'p', part: 'nope', delta: 1 }, 'junk'],
    });
    expect(state.launches).toBe(7);
    expect(state.shown).toEqual({ a: 3 });
    expect(state.pins).toEqual(['p']);
    expect(state.thumbs).toEqual({ t: 1, v: -1 });
    expect(state.weights).toMatchObject({ vibe: 2, length: 0, friction: 1, startup: 0.5 });
    expect(state.mood).toBe('opposites');
    expect(state.nudges).toEqual([{ pair: 'p', part: 'vibe', delta: 0.05 }]);
  });

  it('rejects an unknown mood and a negative launch count', () => {
    const state = parseRecommenderState({ mood: 'angry', launches: -4 });
    expect(state.mood).toBe('balanced');
    expect(state.launches).toBe(0);
  });
});

describe('launches and history', () => {
  it('counts launches and forgets pairs not shown for a long time', () => {
    const state = { ...EMPTY_STATE, launches: 100, shown: { old: 10, recent: 95 } };
    const next = beginLaunch(state);
    expect(next.launches).toBe(101);
    expect(next.shown).toEqual({ recent: 95 });
  });

  it('records what was shown in the current launch', () => {
    const state = recordShown({ ...EMPTY_STATE, launches: 3 }, [pair]);
    expect(state.shown[pair.key]).toBe(3);
  });

  it('clearHistory forgets shown, dismissed and thumbs but keeps pins, picks, favourites and sliders', () => {
    let state = setPinned(EMPTY_STATE, 'k', true);
    state = setPick(state, 'p', true);
    state = setFavourite(state, 'A', true);
    state = setWeight(state, 'vibe', 1.5);
    state = dismissPair(state, 'd');
    state = setThumb(state, pair, 1);
    state = recordShown({ ...state, launches: 2 }, [pair]);
    const cleared = clearHistory(state);
    expect(cleared.shown).toEqual({});
    expect(cleared.dismissed).toEqual([]);
    expect(cleared.thumbs).toEqual({});
    expect(cleared.pins).toEqual(['k']);
    expect(cleared.picks).toEqual(['p']);
    expect(cleared.favourites).toEqual(['A']);
    expect(cleared.weights).toEqual(state.weights);
  });
});

describe('lists', () => {
  it('pin and unpin are idempotent, and dismissing also unpins', () => {
    let state = setPinned(EMPTY_STATE, 'k', true);
    state = setPinned(state, 'k', true);
    expect(state.pins).toEqual(['k']);
    state = dismissPair(state, 'k');
    expect(state.pins).toEqual([]);
    expect(state.dismissed).toEqual(['k']);
    expect(setPinned(state, 'k', false).pins).toEqual([]);
  });

  it('a favourite cannot also be a dislike', () => {
    let state = setFavourite(EMPTY_STATE, 'A', true);
    state = setDislike(state, 'A', true);
    expect(state.favourites).toEqual([]);
    expect(state.dislikes).toEqual(['A']);
    state = setFavourite(state, 'A', true);
    expect(state.dislikes).toEqual([]);
  });

  it('mood is stored', () => {
    expect(setMood(EMPTY_STATE, 'similar').mood).toBe('similar');
  });
});

describe('weights and thumbs', () => {
  it('setWeight clamps to 0..2 and resetWeights restores the defaults and clears the thumb log', () => {
    expect(setWeight(EMPTY_STATE, 'vibe', 9).weights.vibe).toBe(2);
    expect(setWeight(EMPTY_STATE, 'vibe', -1).weights.vibe).toBe(0);
    const thumbed = setThumb(EMPTY_STATE, pair, 1);
    expect(thumbed.nudges.length).toBeGreaterThan(0);
    const reset = resetWeights(setWeight(thumbed, 'friction', 0.2));
    expect(reset.weights).toEqual(DEFAULT_WEIGHTS);
    expect(reset.nudges).toEqual([]);
  });

  it('a thumb up nudges the two strongest parts up by a small step and logs it', () => {
    const state = setThumb(EMPTY_STATE, pair, 1);
    const changed = Object.entries(state.weights).filter(([, value]) => value !== 1);
    expect(changed).toHaveLength(2);
    for (const [, value] of changed) expect(value).toBeCloseTo(1 + NUDGE);
    expect(state.thumbs[pair.key]).toBe(1);
    expect(state.nudges).toHaveLength(2);
  });

  it('a thumb down nudges them down', () => {
    const state = setThumb(EMPTY_STATE, pair, -1);
    expect(Object.values(state.weights).filter((v) => v < 1)).toHaveLength(2);
  });

  it('changing a thumb takes back the old nudge first, and removing it (0) restores the weights exactly', () => {
    const up = setThumb(EMPTY_STATE, pair, 1);
    const down = setThumb(up, pair, -1);
    expect(Object.values(down.weights).filter((v) => v > 1)).toHaveLength(0);
    expect(down.thumbs[pair.key]).toBe(-1);
    const none = setThumb(down, pair, 0);
    expect(none.weights).toEqual(DEFAULT_WEIGHTS);
    expect(none.thumbs).toEqual({});
    expect(none.nudges).toEqual([]);
  });

  it('keeps weights inside 0..2 however many thumbs are given', () => {
    let state = EMPTY_STATE;
    for (let i = 0; i < 60; i += 1) state = setThumb(state, scorePair(game(`A${i}`), game(`B${i}`)), 1);
    for (const value of Object.values(state.weights)) expect(value).toBeLessThanOrEqual(2);
  });
});
