import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchemaFile } from '../schema/load';
import type { GameSchema, SchemaFile } from '../schema/types';
import { seededRandom } from './random';
import {
  ROULETTE_MAX,
  ROULETTE_MIN,
  clampCount,
  pickGames,
  rouletteGames,
  rerollOne,
} from './pick';

const miniUrl = new URL('../../tests/fixtures/mini-schema.json', import.meta.url);

function gameStub(name: string, hidden = false): GameSchema {
  return {
    name,
    hidden,
    groups: [],
    options: {},
    presets: {},
    items: [],
    locations: [],
    itemGroups: [],
    locationGroups: [],
  };
}

function schemaWith(games: GameSchema[]): SchemaFile {
  return {
    apVersion: '0.0.0',
    extractedAt: '2026-01-01T00:00:00+00:00',
    errors: [],
    games: Object.fromEntries(games.map((g) => [g.name, g])),
  };
}

const POOL5 = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
const POOL6 = ['A', 'B', 'C', 'D', 'E', 'F'];

describe('constants', () => {
  it('range is 1 to 10', () => {
    expect(ROULETTE_MIN).toBe(1);
    expect(ROULETTE_MAX).toBe(10);
  });
});

describe('clampCount', () => {
  it('handles the edge cases', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-5)).toBe(1);
    expect(clampCount(11)).toBe(10);
    expect(clampCount(3.6)).toBe(4);
    expect(clampCount(3.4)).toBe(3);
    expect(clampCount(NaN)).toBe(1);
    expect(clampCount(10)).toBe(10);
    expect(clampCount(1)).toBe(1);
    expect(clampCount(Infinity)).toBe(10);
    expect(clampCount(-Infinity)).toBe(1);
  });
});

describe('rouletteGames', () => {
  it('lists the visible games of the mini fixture', () => {
    const schema = parseSchemaFile(readFileSync(miniUrl, 'utf8'));
    expect(rouletteGames(schema)).toEqual(['Demo Game']);
  });

  it('excludes hidden games and sorts the rest', () => {
    const schema = schemaWith([
      gameStub('Zelda'),
      gameStub('secret-test', true),
      gameStub('Anguirus'),
      gameStub('Mega Man'),
    ]);
    expect(rouletteGames(schema)).toEqual(['Anguirus', 'Mega Man', 'Zelda']);
  });
});

describe('pickGames', () => {
  it('returns exactly the requested count of different games from the pool', () => {
    const picks = pickGames(POOL5, 3, seededRandom(1));
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const pick of picks) expect(POOL5).toContain(pick);
  });

  it('never returns more games than the pool holds', () => {
    const picks = pickGames(['X', 'Y', 'Z'], 10, seededRandom(3));
    expect(picks).toHaveLength(3);
    expect(new Set(picks)).toEqual(new Set(['X', 'Y', 'Z']));
  });

  it('clamps the count like clampCount does', () => {
    expect(pickGames(POOL5, 0, seededRandom(4))).toHaveLength(1);
    const pool12 = Array.from({ length: 12 }, (_, i) => `Game ${i}`);
    expect(pickGames(pool12, 99, seededRandom(4))).toHaveLength(ROULETTE_MAX);
  });

  it('returns an empty array for an empty pool', () => {
    expect(pickGames([], 3, seededRandom(5))).toEqual([]);
  });

  it('does not mutate the pool', () => {
    const pool = [...POOL5];
    pickGames(pool, 5, seededRandom(6));
    expect(pool).toEqual(POOL5);
  });

  it('gives the same picks for the same seed', () => {
    expect(pickGames(POOL6, 3, seededRandom(11))).toEqual(pickGames(POOL6, 3, seededRandom(11)));
  });

  it('usually gives different picks for different seeds', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      results.add(pickGames(POOL6, 3, seededRandom(seed)).join('|'));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('ignores duplicate and empty names in the pool', () => {
    const pool = ['Alpha', 'Alpha', '', 'Bravo', 'Bravo', '   ', 'Charlie'];
    const picks = pickGames(pool, 10, seededRandom(8));
    expect(picks.slice().sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('picks uniformly: each of 5 games in about 4000 of 20000 single draws', () => {
    const counts = new Map<string, number>(POOL5.map((g) => [g, 0]));
    const random = seededRandom(2024);
    for (let i = 0; i < 20000; i++) {
      const [game] = pickGames(POOL5, 1, random);
      counts.set(game!, (counts.get(game!) ?? 0) + 1);
    }
    for (const game of POOL5) {
      const n = counts.get(game)!;
      expect(n, game).toBeGreaterThanOrEqual(3200);
      expect(n, game).toBeLessThanOrEqual(4800);
    }
  });

  it('gives each game of a 6-game pool a similar share when picking 3 across 2000 draws', () => {
    const counts = new Map<string, number>(POOL6.map((g) => [g, 0]));
    for (let i = 0; i < 2000; i++) {
      for (const game of pickGames(POOL6, 3, seededRandom(i + 1))) {
        counts.set(game, (counts.get(game) ?? 0) + 1);
      }
    }
    for (const game of POOL6) {
      const share = counts.get(game)! / 2000;
      expect(share, game).toBeGreaterThanOrEqual(0.25);
      expect(share, game).toBeLessThanOrEqual(0.75);
    }
  });
});

describe('rerollOne', () => {
  const pool = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

  it('replaces only the given position with a game not already chosen', () => {
    const current = ['Alpha', 'Bravo', 'Charlie'];
    const result = rerollOne(pool, current, 1, seededRandom(9));
    expect(result).toHaveLength(3);
    expect(result[1]).not.toBe('Bravo');
    expect(['Delta', 'Echo']).toContain(result[1]);
    expect(result[0]).toBe('Alpha');
    expect(result[2]).toBe('Charlie');
    expect(new Set(result).size).toBe(3);
  });

  it('keeps no duplicates across many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = rerollOne(pool, ['Alpha', 'Bravo', 'Charlie'], seed % 3, seededRandom(seed));
      expect(new Set(result).size).toBe(3);
    }
  });

  it('returns an unchanged copy when the pool has nothing new', () => {
    const current = ['Alpha', 'Bravo'];
    const result = rerollOne(['Alpha', 'Bravo'], current, 0, seededRandom(1));
    expect(result).toEqual(['Alpha', 'Bravo']);
    expect(result).not.toBe(current);
  });

  it('returns an unchanged copy when the index is out of range', () => {
    const current = ['Alpha', 'Bravo'];
    expect(rerollOne(pool, current, 2, seededRandom(1))).toEqual(['Alpha', 'Bravo']);
    expect(rerollOne(pool, current, -1, seededRandom(1))).toEqual(['Alpha', 'Bravo']);
  });

  it('does not mutate current or the pool', () => {
    const current = ['Alpha', 'Bravo'];
    const poolCopy = [...pool];
    rerollOne(pool, current, 0, seededRandom(3));
    expect(current).toEqual(['Alpha', 'Bravo']);
    expect(pool).toEqual(poolCopy);
  });
});

describe('real visible games (skipped without data/schema.json)', () => {
  const schemaUrl = new URL('../../data/schema.json', import.meta.url);
  describe.skipIf(!existsSync(schemaUrl))('real schema', () => {
    const schema = parseSchemaFile(readFileSync(schemaUrl, 'utf8'));
    it('rouletteGames excludes hidden games and matches the non-hidden count', () => {
      const names = rouletteGames(schema);
      const visible = Object.values(schema.games).filter((g) => !g.hidden);
      expect(names).toHaveLength(visible.length);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });
});
