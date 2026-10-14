import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../difficulty/testGame';
import { seededRandom } from '../roulette/random';
import type { OptionSchema } from '../schema/types';
import { isRollable, randomizableOptions, rollDifferent, rollValue, WIDE_RANGE } from './roll';
import { withGroup } from './testGame';

const O = TEST_GAME.options as Record<string, OptionSchema>;
const wide: OptionSchema = { ...O['lives']!, key: 'money', min: 0, max: 999999 };
const edge: OptionSchema = { ...O['lives']!, key: 'edge', min: 0, max: WIDE_RANGE - 1 };
const lonely: OptionSchema = { ...O['mode']!, key: 'lonely', choices: [] };

describe('isRollable / rollValue', () => {
  it('rolls switches, choices and numbers, but not free text or an option with no choices', () => {
    expect(['death_link', 'mode', 'lives', 'balancing'].every((k) => isRollable(O[k]!))).toBe(true);
    expect(isRollable(O['notes']!)).toBe(false);
    expect(isRollable(lonely)).toBe(false);
    expect(rollValue(O['notes']!, () => 0.5)).toBeUndefined();
    expect(rollValue(lonely, () => 0.5)).toBeUndefined();
  });

  it('only ever picks values the option really allows', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      expect(typeof rollValue(O['death_link']!, random)).toBe('boolean');
      expect(['easy', 'normal', 'hard', 'off']).toContain(rollValue(O['mode']!, random));
      const lives = rollValue(O['lives']!, random) as number;
      expect(Number.isInteger(lives) && lives >= 1 && lives <= 9).toBe(true);
      const balancing = rollValue(O['balancing']!, random) as number;
      expect(Number.isInteger(balancing) && balancing >= 0 && balancing <= 100).toBe(true);
    }
  });

  it('reaches both ends of a range and never goes past them, even for the extreme random values', () => {
    expect(rollValue(O['lives']!, () => 0)).toBe(1);
    expect(rollValue(O['lives']!, () => 0.999999999)).toBe(9);
    expect(rollValue(O['lives']!, () => 1)).toBe(9); // a faulty source that returns exactly 1 must not overflow
    expect(rollValue(O['mode']!, () => 1)).toBe('off');
    expect(rollValue(O['death_link']!, () => 0.49)).toBe(true);
    expect(rollValue(O['death_link']!, () => 0.5)).toBe(false);
  });

  it('is fair: over many rolls every choice turns up about equally often', () => {
    const random = seededRandom(11);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i += 1) {
      const value = rollValue(O['mode']!, random) as string;
      counts[value] = (counts[value] ?? 0) + 1;
    }
    for (const key of ['easy', 'normal', 'hard', 'off']) expect(counts[key]).toBeGreaterThan(4500);
    for (const key of ['easy', 'normal', 'hard', 'off']) expect(counts[key]).toBeLessThan(5500);
  });

  it('is deterministic for the same seed', () => {
    const roll = () => {
      const random = seededRandom(3);
      return [rollValue(O['mode']!, random), rollValue(O['lives']!, random), rollValue(O['death_link']!, random)];
    };
    expect(roll()).toEqual(roll());
  });
});

describe('rollDifferent', () => {
  it('never returns the value it was given, for every kind', () => {
    const random = seededRandom(5);
    for (let i = 0; i < 300; i += 1) {
      expect(rollDifferent(O['death_link']!, true, random)).toBe(false);
      expect(rollDifferent(O['death_link']!, false, random)).toBe(true);
      expect(rollDifferent(O['mode']!, 'hard', random)).not.toBe('hard');
      expect(['easy', 'normal', 'off']).toContain(rollDifferent(O['mode']!, 'hard', random));
      const lives = rollDifferent(O['lives']!, 4, random) as number;
      expect(lives).not.toBe(4);
      expect(lives >= 1 && lives <= 9).toBe(true);
    }
  });

  it('reaches every other value, including both ends of a range', () => {
    const seen = new Set<unknown>();
    const random = seededRandom(8);
    for (let i = 0; i < 500; i += 1) seen.add(rollDifferent(O['lives']!, 5, random));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it('treats a value outside the option as different from everything', () => {
    expect(rollDifferent(O['mode']!, 'impossible', () => 0)).toBe('easy');
    expect(typeof rollDifferent(O['lives']!, 'many', () => 0)).toBe('number');
  });

  it('gives up (undefined) when the option has only one value', () => {
    const single: OptionSchema = { ...O['mode']!, key: 'single', choices: [{ key: 'only', label: 'Only' }] };
    const fixed: OptionSchema = { ...O['lives']!, key: 'fixed', min: 3, max: 3 };
    expect(rollDifferent(single, 'only', () => 0.5)).toBeUndefined();
    expect(rollDifferent(fixed, 3, () => 0.5)).toBeUndefined();
    expect(rollDifferent(O['notes']!, 'x', () => 0.5)).toBeUndefined();
  });
});

describe('randomizableOptions', () => {
  it('lists the options Randomize everything may touch and leaves out free text, empty choices and very wide ranges', () => {
    const game = withGroup(TEST_GAME, [wide, edge, lonely]);
    expect(randomizableOptions(game).map((o) => o.key)).toEqual(['death_link', 'mode', 'lives', 'balancing', 'edge']);
  });

  it('leaves out options Simple mode does not show', () => {
    const hidden: OptionSchema = { ...O['death_link']!, key: 'secret', visibility: ['complex_ui'] };
    expect(randomizableOptions(withGroup(TEST_GAME, [hidden])).map((o) => o.key)).not.toContain('secret');
  });
});
