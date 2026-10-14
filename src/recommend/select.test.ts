import { describe, expect, it } from 'vitest';
import { seededRandom } from '../roulette/random';
import { NOVELTY_LAUNCHES, partnersFor, pickCards, TEN } from './select';
import { scoreAllPairs } from './score';
import { EMPTY_STATE, beginLaunch, dismissPair, recordShown, setPinned, type RecommenderState } from './state';
import { game } from './testGames';
import type { GameInfo } from './types';

const GENRES = ['platformer', 'rpg', 'shooter', 'puzzle', 'sim', 'strategy'];
const world = (n: number): GameInfo[] =>
  Array.from({ length: n }, (_, i) =>
    game(`Game ${String(i).padStart(2, '0')}`, {
      feel: { genre: GENRES[i % GENRES.length]!, pace: 1 + (i % 5), length: 1 + ((i * 3) % 5), tones: [['cozy', 'dark', 'funny'][i % 3]!], activities: [`a${i % 4}`, `b${i % 7}`], era: (['classic', 'mid', 'modern'] as const)[i % 3]! },
      facts: { checks: 20 + i * 15, earlyOpen: i % 4 === 0 ? 0 : 10 },
    }),
  );
const PAIRS = scoreAllPairs(world(30));
const fresh = (launches = 1): RecommenderState => ({ ...EMPTY_STATE, launches });

describe('pickCards', () => {
  it('gives ten different pairs', () => {
    const { pairs, reshuffled } = pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(1) });
    expect(pairs).toHaveLength(TEN);
    expect(new Set(pairs.map((p) => p.key)).size).toBe(TEN);
    expect(reshuffled).toBe(false);
  });

  it('is repeatable for one seed and different for another', () => {
    const run = (seed: number) => pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(seed) }).pairs.map((p) => p.key);
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('shows the best pairs far more often than the worst ones', () => {
    const sorted = [...PAIRS].sort((a, b) => b.score - a.score);
    const bestHalf = new Set(sorted.slice(0, sorted.length / 2).map((p) => p.key));
    let inBest = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const pair of pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(seed) }).pairs) {
        total += 1;
        if (bestHalf.has(pair.key)) inBest += 1;
      }
    }
    expect(inBest / total).toBeGreaterThan(0.65); // half would be chance
  });

  it('uses no game on more than three cards, and keeps a mix of kinds', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const { pairs } = pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(seed) });
      const uses = new Map<string, number>();
      for (const p of pairs) for (const name of [p.a, p.b]) uses.set(name, (uses.get(name) ?? 0) + 1);
      expect(Math.max(...uses.values())).toBeLessThanOrEqual(3);
      for (const kind of ['similar', 'contrast'] as const) expect(pairs.filter((p) => p.kind === kind).length).toBeLessThanOrEqual(7);
    }
  });

  it('allows at most two cards with a guessed game', () => {
    const games = [...world(20), ...['X1', 'X2', 'X3', 'X4', 'X5'].map((n) => game(n, { feel: null }))];
    const pairs = scoreAllPairs(games);
    for (let seed = 1; seed <= 20; seed += 1) {
      const picked = pickCards({ pairs, state: fresh(), random: seededRandom(seed) }).pairs;
      expect(picked.filter((p) => p.guessed).length).toBeLessThanOrEqual(2);
    }
  });

  it('never shows a dismissed pair, and always includes pinned ones first', () => {
    const [first, second] = [...PAIRS].sort((a, b) => a.score - b.score);
    let state = dismissPair(fresh(), first!.key);
    state = setPinned(state, second!.key, true);
    for (let seed = 1; seed <= 15; seed += 1) {
      const picked = pickCards({ pairs: PAIRS, state, random: seededRandom(seed) }).pairs;
      expect(picked.map((p) => p.key)).not.toContain(first!.key);
      expect(picked.map((p) => p.key)).toContain(second!.key);
      expect(picked).toHaveLength(TEN);
    }
  });

  it('gives the same ten again after they were recorded as shown in this launch', () => {
    const first = pickCards({ pairs: PAIRS, state: fresh(3), random: seededRandom(11) });
    const again = pickCards({ pairs: PAIRS, state: recordShown(fresh(3), first.pairs), random: seededRandom(11) });
    expect(again.pairs.map((p) => p.key)).toEqual(first.pairs.map((p) => p.key));
  });

  it('does not repeat a shown pair within five launches, then may', () => {
    const first = pickCards({ pairs: PAIRS, state: recordShown(fresh(10), []), random: seededRandom(3) });
    const state = recordShown(fresh(10), first.pairs);
    const keys = new Set(first.pairs.map((p) => p.key));
    for (let later = 11; later <= 10 + NOVELTY_LAUNCHES; later += 1) {
      const next = pickCards({ pairs: PAIRS, state: { ...state, launches: later }, random: seededRandom(later) });
      expect(next.pairs.some((p) => keys.has(p.key))).toBe(false);
    }
    // After the window has passed they are eligible again: with a tiny pool every pair must come back.
    const tiny = scoreAllPairs(world(5)); // 10 pairs
    const shown = recordShown(fresh(1), tiny);
    expect(pickCards({ pairs: tiny, state: { ...shown, launches: 1 + NOVELTY_LAUNCHES + 1 }, random: seededRandom(1) }).reshuffled).toBe(false);
  });

  it('still shows ten when few unseen pairs remain, bringing back the longest-ago ones and saying so', () => {
    const pool = scoreAllPairs(world(8)); // 28 pairs
    let state = fresh(1);
    const old = pool.slice(0, 20);
    state = recordShown({ ...state, launches: 2 }, old.slice(0, 10)); // shown in launch 2
    state = recordShown({ ...state, launches: 3 }, old.slice(10)); // shown in launch 3
    state = { ...state, launches: 4 };
    const picked = pickCards({ pairs: pool, state, random: seededRandom(2) });
    expect(picked.pairs).toHaveLength(TEN);
    expect(picked.reshuffled).toBe(true);
    // 8 unseen pairs exist, so 2 old ones came back, taken from the earliest (launch 2) batch.
    const old2 = new Set(old.slice(0, 10).map((p) => p.key));
    const back = picked.pairs.filter((p) => state.shown[p.key] !== undefined);
    expect(back).toHaveLength(2);
    expect(back.every((p) => old2.has(p.key))).toBe(true);
  });

  it('"give me ten more" avoids what is on screen', () => {
    const one = pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(5) });
    const avoid = new Set(one.pairs.map((p) => p.key));
    const more = pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(6), avoid });
    expect(more.pairs.some((p) => avoid.has(p.key))).toBe(false);
    expect(more.pairs).toHaveLength(TEN);
  });

  it('a pinned pair already on screen is not offered again by "more" or as a replacement', () => {
    const pin = PAIRS[5]!;
    const state = setPinned(fresh(), pin.key, true);
    const more = pickCards({ pairs: PAIRS, state, random: seededRandom(2), avoid: new Set([pin.key]) });
    expect(more.pairs.map((p) => p.key)).not.toContain(pin.key);
    expect(pickCards({ pairs: PAIRS, state, random: seededRandom(2), count: 1, avoid: new Set([pin.key]) }).pairs).toHaveLength(1);
  });

  it('returns fewer when there are not enough pairs at all, without failing', () => {
    expect(pickCards({ pairs: scoreAllPairs(world(2)), state: fresh(), random: seededRandom(1) }).pairs).toHaveLength(1);
    expect(pickCards({ pairs: [], state: fresh(), random: seededRandom(1) })).toEqual({ pairs: [], reshuffled: false });
  });

  it('lists the best cards first', () => {
    const { pairs } = pickCards({ pairs: PAIRS, state: fresh(), random: seededRandom(4) });
    for (let i = 1; i < pairs.length; i += 1) expect(pairs[i - 1]!.score).toBeGreaterThanOrEqual(pairs[i]!.score);
  });

  it('a new launch number counts as a later launch', () => {
    expect(beginLaunch(fresh(4)).launches).toBe(5);
  });
});

describe('partnersFor', () => {
  it('lists every partner of one game, best first, without dismissed pairs', () => {
    const target = 'Game 03';
    const partners = partnersFor(target, PAIRS, fresh());
    expect(partners).toHaveLength(29);
    expect(partners.every((p) => p.a === target || p.b === target)).toBe(true);
    for (let i = 1; i < partners.length; i += 1) expect(partners[i - 1]!.score).toBeGreaterThanOrEqual(partners[i]!.score);
    const hidden = dismissPair(fresh(), partners[0]!.key);
    expect(partnersFor(target, PAIRS, hidden)).toHaveLength(28);
  });
});
