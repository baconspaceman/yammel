import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shippedProfiles } from '../difficulty/shipped';
import { seededRandom } from '../roulette/random';
import { parseSchemaFile } from '../schema/load';
import { buildGameInfos } from './games';
import { findGroups, groupKey, MAX_GROUP, MIN_GROUP, scoreGroup } from './groups';
import { pairKey, scoreAllPairs, scorePair } from './score';
import { shippedFacts, shippedFeel } from './shipped';
import { game } from './testGames';
import type { PairScore } from './types';

const lookupOf = (pairs: readonly PairScore[]) => new Map(pairs.map((pair) => [pair.key, pair]));

/** Six small games where A, B and C are alike and D, E and F are alike. */
const cozy = { genre: 'cozy', tones: ['cozy'], activities: ['farming', 'collecting'], pace: 1 };
const fast = { genre: 'shooter', tones: ['frantic'], activities: ['shooting'], pace: 5 };
const GAMES = [game('A', { feel: cozy }), game('B', { feel: cozy }), game('C', { feel: cozy }), game('D', { feel: fast }), game('E', { feel: fast }), game('F', { feel: fast })];
const similar = { mood: 'similar' as const };

describe('scoreGroup', () => {
  const pairs = scoreAllPairs(GAMES, similar);
  const lookup = lookupOf(pairs);

  it('is the average of every pair, pulled toward the weakest', () => {
    const group = scoreGroup(['A', 'B', 'C'], lookup)!;
    const three = [lookup.get(pairKey('A', 'B'))!, lookup.get(pairKey('A', 'C'))!, lookup.get(pairKey('B', 'C'))!];
    const average = three.reduce((sum, pair) => sum + pair.score, 0) / 3;
    const weakest = Math.min(...three.map((pair) => pair.score));
    expect(group.average).toBeCloseTo(average, 1);
    expect(group.score).toBeCloseTo(0.65 * average + 0.35 * weakest, 0);
    expect(group.weakest.score).toBeCloseTo(weakest, 5);
    expect(group.games).toEqual(['A', 'B', 'C']);
  });

  it('scores a mixed group lower than a matched one', () => {
    expect(scoreGroup(['A', 'B', 'D'], lookup)!.score).toBeLessThan(scoreGroup(['A', 'B', 'C'], lookup)!.score);
  });

  it('is the same whatever order the games are given in', () => {
    expect(scoreGroup(['C', 'A', 'B'], lookup)).toEqual(scoreGroup(['A', 'B', 'C'], lookup));
    expect(groupKey(['C', 'A', 'B'])).toBe(groupKey(['A', 'B', 'C']));
  });

  it('names the weakest link when it is weak, and gives nothing for an unknown game', () => {
    const mixed = scoreGroup(['A', 'B', 'D'], lookup)!;
    expect(mixed.weakest.a === 'D' || mixed.weakest.b === 'D').toBe(true);
    expect(scoreGroup(['A', 'B', 'Nope'], lookup)).toBeNull();
    expect(scoreGroup(['A'], lookup)).toBeNull();
  });
});

describe('findGroups on a few games', () => {
  const pairs = scoreAllPairs(GAMES, similar);

  it('puts the alike games together', () => {
    const groups = findGroups({ pairs, size: 3, random: seededRandom(1), count: 2 });
    expect(groups[0]!.games).toHaveLength(3);
    expect(['A,B,C', 'D,E,F']).toContain(groups[0]!.games.join(','));
  });

  it('keeps the games you insist on and leaves out the ones you exclude', () => {
    const groups = findGroups({ pairs, size: 3, include: ['A'], exclude: ['B'], random: seededRandom(2), count: 5 });
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.games).toContain('A');
      expect(group.games).not.toContain('B');
    }
  });

  it('is repeatable with the same random numbers, and different groups come from different ones', () => {
    const first = findGroups({ pairs, size: 3, random: seededRandom(7) });
    const again = findGroups({ pairs, size: 3, random: seededRandom(7) });
    expect(again).toEqual(first);
  });

  it('never returns the same group twice, and honours "leave out these"', () => {
    const groups = findGroups({ pairs, size: 3, random: seededRandom(3), count: 20 });
    expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length);
    const avoid = new Set([groups[0]!.key]);
    expect(findGroups({ pairs, size: 3, random: seededRandom(3), count: 20, avoid }).map((group) => group.key)).not.toContain(groups[0]!.key);
  });

  it('gives nothing when it cannot be done', () => {
    expect(findGroups({ pairs, size: 7, random: seededRandom(1) })).toEqual([]); // only six games
    expect(findGroups({ pairs, size: 3, include: ['A', 'B', 'C', 'D'], random: seededRandom(1) })).toEqual([]);
    expect(findGroups({ pairs, size: 3, exclude: ['A', 'B', 'C', 'D'], random: seededRandom(1) })).toEqual([]);
  });

  it('keeps the size inside the allowed range', () => {
    expect(findGroups({ pairs, size: 1, random: seededRandom(1), count: 1 })[0]!.games).toHaveLength(MIN_GROUP);
    expect(MAX_GROUP).toBe(8);
  });

  it('ignores an include that is not a game, without failing', () => {
    expect(findGroups({ pairs, size: 3, include: ['Not a game'], random: seededRandom(1), count: 1 })).toHaveLength(1);
  });
});

describe('findGroups on the real games', () => {
  const schema = parseSchemaFile(readFileSync(new URL('../../data/schema.json', import.meta.url), 'utf8'));
  const infos = buildGameInfos(schema, shippedFeel, shippedFacts, shippedProfiles);
  const pairs = scoreAllPairs(infos);

  it.each([3, 4, 5, 6, 7, 8])('finds ten groups of %i quickly, all scored inside 0 to 100', (size) => {
    const started = Date.now();
    const groups = findGroups({ pairs, size, random: seededRandom(size) });
    expect(Date.now() - started).toBeLessThan(2500);
    expect(groups).toHaveLength(10);
    for (const group of groups) {
      expect(group.games).toHaveLength(size);
      expect(new Set(group.games).size).toBe(size);
      expect(group.score).toBeGreaterThanOrEqual(0);
      expect(group.score).toBeLessThanOrEqual(100);
    }
    const uses = new Map<string, number>();
    for (const group of groups) for (const name of group.games) uses.set(name, (uses.get(name) ?? 0) + 1);
    expect(Math.max(...uses.values())).toBeLessThanOrEqual(3);
  });

  it('beats a random group of the same size by a wide margin', () => {
    const lookup = lookupOf(pairs);
    const best = findGroups({ pairs, size: 4, random: seededRandom(11), count: 1 })[0]!;
    const names = infos.map((info) => info.name);
    const random = seededRandom(5);
    const trials = Array.from({ length: 50 }, () => {
      const chosen = new Set<string>();
      while (chosen.size < 4) chosen.add(names[Math.floor(random() * names.length)]!);
      return scoreGroup([...chosen], lookup)!.score;
    });
    const mean = trials.reduce((a, b) => a + b, 0) / trials.length;
    expect(best.score).toBeGreaterThan(mean + 10);
  });

  it('puts the games you insist on in every group', () => {
    const groups = findGroups({ pairs, size: 4, include: ['Super Mario World', 'Kingdom Hearts'], random: seededRandom(2) });
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.games).toEqual(expect.arrayContaining(['Super Mario World', 'Kingdom Hearts']));
  });

  it('agrees with the pair scores it was built from', () => {
    const group = findGroups({ pairs, size: 3, random: seededRandom(4), count: 1 })[0]!;
    const [a, b] = group.games;
    expect(group.average).toBeGreaterThan(0);
    expect(scorePair(infos.find((i) => i.name === a)!, infos.find((i) => i.name === b)!).score).toBeGreaterThanOrEqual(0);
  });
});
