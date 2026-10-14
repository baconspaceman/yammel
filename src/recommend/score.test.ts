import { describe, expect, it } from 'vitest';
import { pairKey, scoreAllPairs, scorePair } from './score';
import { game } from './testGames';
import { DEFAULT_WEIGHTS } from './types';

const part = (pair: ReturnType<typeof scorePair>, key: string) => pair.parts.find((p) => p.key === key);

describe('pairKey', () => {
  it('is the same either way round, and different for different pairs', () => {
    expect(pairKey('A', 'B')).toBe(pairKey('B', 'A'));
    expect(pairKey('A', 'B')).not.toBe(pairKey('A', 'C'));
    expect(pairKey('A B', 'C')).not.toBe(pairKey('A', 'B C'));
  });
});

describe('scorePair', () => {
  it('puts the games in alphabetical order whichever way they are given', () => {
    const ab = scorePair(game('Alpha'), game('Beta'));
    const ba = scorePair(game('Beta'), game('Alpha'));
    expect(ab).toEqual(ba);
    expect([ab.a, ab.b]).toEqual(['Alpha', 'Beta']);
  });

  it('is between 0 and 100 and is deterministic', () => {
    const x = game('X', { feel: { genre: 'rpg', pace: 1, length: 5, tones: ['dark'], era: 'modern', activities: ['combat'] } });
    const y = game('Y');
    const first = scorePair(x, y);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(scorePair(x, y)).toEqual(first);
  });

  describe('setup friction', () => {
    it('is perfect when neither needs anything, and names what each needs when they do', () => {
      expect(part(scorePair(game('A'), game('B')), 'friction')!.value).toBe(1);
      const needy = scorePair(
        game('A', { facts: { needsFile: true, systems: ['GB'] } }),
        game('B', { facts: { needsFile: true, systems: ['GBA'] } }),
      );
      expect(part(needy, 'friction')!.value).toBe(0); // two files + two emulators
      expect(part(needy, 'friction')!.reason).toContain('A needs a file you supply and BizHawk (GB)');
    });

    it('treats two games on the same emulator as one emulator', () => {
      const same = scorePair(game('A', { facts: { systems: ['GB'] } }), game('B', { facts: { systems: ['GB'] } }));
      expect(part(same, 'friction')!.value).toBe(0.75);
    });

    it('is left out when a world was never scanned', () => {
      expect(part(scorePair(game('A', { facts: null }), game('B')), 'friction')).toBeUndefined();
    });
  });

  describe('length balance', () => {
    it('likes similar check counts and says the numbers', () => {
      const close = part(scorePair(game('A', { facts: { checks: 223 } }), game('B', { facts: { checks: 219 } })), 'length')!;
      expect(close.value).toBeGreaterThan(0.95);
      expect(close.reason).toContain('A has 223 checks and B has 219: well matched');
      const far = part(scorePair(game('A', { facts: { checks: 10 } }), game('B', { facts: { checks: 1000 } })), 'length')!;
      expect(far.value).toBeLessThan(0.2);
      expect(far.reason).toContain('very different in size');
    });

    it('falls back to the drafted length, labelled Drafted, when checks are unknown', () => {
      const fallback = part(scorePair(game('A', { facts: null, feel: { length: 1 } }), game('B', { facts: null, feel: { length: 5 } })), 'length')!;
      expect(fallback.source).toBe('drafted');
      expect(fallback.value).toBe(0);
    });
  });

  it('difficulty fit only counts when both games have a rating', () => {
    expect(part(scorePair(game('A', { difficulty: 5 }), game('B')), 'difficulty')).toBeUndefined();
    expect(part(scorePair(game('A', { difficulty: 3 }), game('B', { difficulty: 7 })), 'difficulty')!.value).toBeCloseTo(0.6);
  });

  describe('start-up balance', () => {
    it('rewards one closed start with one open start, and punishes two closed starts', () => {
      const closed = game('Closed', { facts: { checks: 200, earlyOpen: 0 } });
      const open = game('Open', { facts: { checks: 200, earlyOpen: 60 } });
      const closed2 = game('Closed2', { facts: { checks: 200, earlyOpen: 1 } });
      expect(part(scorePair(closed, open), 'startup')!.value).toBe(1);
      expect(part(scorePair(closed, open), 'startup')!.reason).toContain('so there is always something to do');
      expect(part(scorePair(closed, closed2), 'startup')!.value).toBeLessThan(0.2);
      expect(part(scorePair(open, game('Open2', { facts: { earlyOpen: 50 } })), 'startup')!.value).toBe(0.75);
    });

    it('is left out when openness is unknown for either game', () => {
      expect(part(scorePair(game('A', { facts: { earlyOpen: null } }), game('B')), 'startup')).toBeUndefined();
    });
  });

  describe('vibe and contrast', () => {
    const calm = (name: string) => game(name, { feel: { genre: 'sim', pace: 1, tones: ['cozy'], era: 'modern', activities: ['farming', 'crafting'], families: [] } });
    const fast = (name: string) => game(name, { feel: { genre: 'shooter', pace: 5, tones: ['tense'], era: 'classic', activities: ['shooting'], families: [] } });

    it('alike games have a high vibe and low contrast, and different games the reverse', () => {
      const alike = scorePair(calm('A'), calm('B'));
      const different = scorePair(calm('A'), fast('B'));
      expect(part(alike, 'vibe')!.value).toBeGreaterThan(part(different, 'vibe')!.value);
      expect(part(different, 'contrast')!.value).toBeGreaterThan(part(alike, 'contrast')!.value);
    });

    it('penalises near-duplicates for contrast', () => {
      expect(part(scorePair(calm('A'), calm('B')), 'contrast')!.reason).toContain('add little variety');
    });

    it('counts a shared series', () => {
      const withSeries = (n: string) => game(n, { feel: { families: ['zelda'] } });
      const withoutSeries = (n: string) => game(n, { feel: { families: [] } });
      expect(part(scorePair(withSeries('A'), withSeries('B')), 'vibe')!.value).toBeGreaterThan(part(scorePair(withoutSeries('A'), withoutSeries('B')), 'vibe')!.value);
      expect(part(scorePair(withSeries('A'), withSeries('B')), 'vibe')!.reason).toContain('same series');
    });

    it('mood moves the weight: similar likes alike pairs, opposites likes different ones', () => {
      const alike = [calm('A'), calm('B')] as const;
      const different = [calm('A'), fast('B')] as const;
      expect(scorePair(...alike, { mood: 'similar' }).score).toBeGreaterThan(scorePair(...different, { mood: 'similar' }).score);
      expect(scorePair(...different, { mood: 'opposites' }).score).toBeGreaterThan(scorePair(...alike, { mood: 'opposites' }).score);
    });

    it('says which kind a pair is', () => {
      expect(scorePair(calm('A'), calm('B'), { mood: 'similar' }).kind).toBe('similar');
      expect(scorePair(calm('A'), fast('B'), { mood: 'opposites' }).kind).toBe('contrast');
    });
  });

  describe('a game with no drafted profile', () => {
    it('has no vibe or contrast, is marked guessed, and says so', () => {
      const pair = scorePair(game('Custom', { feel: null }), game('B'));
      expect(pair.guessed).toBe(true);
      expect(part(pair, 'vibe')).toBeUndefined();
      expect(part(pair, 'contrast')).toBeUndefined();
      expect(pair.kind).toBe('practical');
      expect(pair.warnings.join(' ')).toContain('No drafted profile for Custom');
    });
  });

  describe('sliders and preferences', () => {
    it('a slider at 0 switches that part off, and a heavier one counts more', () => {
      const a = game('A', { facts: { checks: 10 } });
      const b = game('B', { facts: { checks: 1000 } });
      const normal = scorePair(a, b).score;
      const noLength = scorePair(a, b, { weights: { ...DEFAULT_WEIGHTS, length: 0 } }).score;
      const doubleLength = scorePair(a, b, { weights: { ...DEFAULT_WEIGHTS, length: 2 } }).score;
      expect(noLength).toBeGreaterThan(normal);
      expect(doubleLength).toBeLessThan(normal);
    });

    it('a pick adds a bonus, a favourite adds a little, a dislike takes a lot, all inside 0 to 100', () => {
      const a = game('A', { feel: { genre: 'rpg', pace: 1, length: 5, tones: ['dark'], era: 'modern', activities: ['combat'] }, facts: { checks: 10, needsFile: true, systems: ['GB'] } });
      const b = game('B', { facts: { checks: 1000, needsFile: true, systems: ['GBA'] } });
      const base = scorePair(a, b).score;
      expect(scorePair(a, b, { picks: new Set([pairKey('A', 'B')]) }).score).toBeGreaterThan(base);
      expect(scorePair(a, b, { favourites: new Set(['A']) }).score).toBeGreaterThan(base);
      expect(scorePair(a, b, { dislikes: new Set(['A']) }).score).toBeLessThanOrEqual(base);
      expect(scorePair(a, b, { dislikes: new Set(['A', 'B']) }).score).toBeGreaterThanOrEqual(0);
      const perfect = scorePair(game('P'), game('Q'), { picks: new Set([pairKey('P', 'Q')]), favourites: new Set(['P', 'Q']) }).score;
      expect(perfect).toBeLessThanOrEqual(100);
    });
  });

  it('gives reasons for good parts and warnings for bad ones', () => {
    const pair = scorePair(game('A', { facts: { needsFile: true, systems: ['GB'] } }), game('B', { facts: { needsFile: true, systems: ['GBA'] } }));
    expect(pair.warnings.join(' ')).toContain('A needs a file you supply');
    expect(pair.reasons.length).toBeGreaterThan(0);
    expect(pair.reasons.length).toBeLessThanOrEqual(4);
  });
});

describe('scoreAllPairs', () => {
  it('makes n*(n-1)/2 pairs, each once', () => {
    const games = ['A', 'B', 'C', 'D', 'E'].map((n) => game(n));
    const pairs = scoreAllPairs(games);
    expect(pairs).toHaveLength(10);
    expect(new Set(pairs.map((p) => p.key)).size).toBe(10);
  });
});
