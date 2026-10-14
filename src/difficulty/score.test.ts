import { describe, expect, it } from 'vitest';
import { curveAt, scoreProfile } from './score';
import { TEST_GAME, TEST_PROFILE } from './testGame';
import type { DifficultyProfile } from './types';

const score = (values: Record<string, unknown>, profile: DifficultyProfile = TEST_PROFILE) =>
  scoreProfile(profile, TEST_GAME, values);

describe('curveAt', () => {
  const curve: [number, number][] = [
    [0, 2],
    [10, 0],
    [20, 4],
  ];
  it('runs straight between points and holds the end points outside', () => {
    expect(curveAt(curve, 5)).toBe(1);
    expect(curveAt(curve, 15)).toBe(2);
    expect(curveAt(curve, -5)).toBe(2);
    expect(curveAt(curve, 99)).toBe(4);
  });
  it('gives 0 for an empty curve', () => {
    expect(curveAt([], 3)).toBe(0);
  });
});

describe('scoreProfile', () => {
  it('scores the base when nothing is set', () => {
    const result = score({});
    expect(result.score).toBe(4);
    expect(result.contributions).toEqual([]);
    expect(result.approximated).toEqual([]);
  });

  it('scores the base when values equal the defaults (shifts are relative to the default)', () => {
    expect(score({ death_link: false, mode: 'normal', lives: 5, balancing: 50 }).score).toBe(4);
  });

  it('adds the shift of a switch that is on and explains it', () => {
    const result = score({ death_link: true });
    expect(result.score).toBe(5);
    expect(result.contributions).toEqual([
      { key: 'death_link', displayName: 'Death Link', valueText: 'On', delta: 1, why: 'One death costs everyone.' },
    ]);
  });

  it('reads a choice, including an alias and the label it shows', () => {
    expect(score({ mode: 'hard' }).score).toBe(6);
    expect(score({ mode: 'simple' }).score).toBe(3);
    expect(score({ mode: 'hard' }).contributions[0]?.valueText).toBe('Hard');
  });

  it('matches an unquoted off (a YAML boolean) back to a choice called off', () => {
    const result = score({ mode: false });
    expect(result.score).toBe(4); // off shifts 0, same as the default
    expect(result.approximated).toEqual([]);
  });

  it('follows a curve for ranges', () => {
    expect(score({ lives: 1 }).score).toBe(7);
    expect(score({ lives: 3 }).score).toBe(5.5);
    expect(score({ lives: 9 }).score).toBe(3);
  });

  it('reads named ranges by number and by special name', () => {
    expect(score({ balancing: 0 }).score).toBe(5);
    expect(score({ balancing: 'extreme' }).score).toBe(5.5);
    expect(score({ balancing: 'disabled' }).score).toBe(5); // no listed shift: the curve at its number (0)
  });

  it('adds up several options and lists the biggest pull first', () => {
    const result = score({ death_link: true, mode: 'hard', lives: 9 });
    expect(result.score).toBe(6);
    expect(result.contributions.map((c) => c.key)).toEqual(['mode', 'death_link', 'lives']);
  });

  it('keeps the score between 0 and 10', () => {
    const wild: DifficultyProfile = { ...TEST_PROFILE, base: 9.5 };
    expect(score({ mode: 'hard' }, wild).score).toBe(10);
    const calm: DifficultyProfile = { ...TEST_PROFILE, base: 0.5 };
    expect(score({ mode: 'easy' }, calm).score).toBe(0);
  });

  it('counts a weighted table as the weighted average and says it did', () => {
    const result = score({ mode: { easy: 50, hard: 50 } });
    expect(result.score).toBe(4.5); // (-1 + 2) / 2 = +0.5
    expect(result.approximated).toEqual(['Mode']);
    expect(result.contributions[0]?.valueText).toBe('weighted');
  });

  it('counts plain random as the average over everything it can pick', () => {
    expect(score({ death_link: 'random' }).score).toBe(4.5);
    expect(score({ mode: 'random' }).score).toBe(4.25); // (-1 + 0 + 2 + 0) / 4
    expect(score({ death_link: 'random' }).approximated).toEqual(['Death Link']);
  });

  it('counts a random range as the average of its curve', () => {
    const result = score({ lives: 'random' });
    expect(result.approximated).toEqual(['Lives']);
    // the curve averages +0.5 over 1..9 (and 0 at the default of 5), sampled at 21 points
    expect(result.score).toBeCloseTo(4.5, 1);
  });

  it('counts a value it cannot read at the default and says so', () => {
    const result = score({ mode: 'impossible', lives: 'many', death_link: 'maybe' });
    expect(result.score).toBe(4);
    expect(result.approximated).toEqual(['Death Link', 'Mode', 'Lives']); // in the profile's order
  });

  it('counts random-low style values at the default and says so', () => {
    const result = score({ lives: 'random-low' });
    expect(result.score).toBe(4);
    expect(result.approximated).toEqual(['Lives']);
  });

  it('ignores options the profile does not mention and options the game does not have', () => {
    const result = score({ notes: 'hello', no_such_option: true });
    expect(result.score).toBe(4);
  });

  it('reads values the way Archipelago does: any case, and the full list of on/off words', () => {
    expect(score({ mode: 'HARD' }).score).toBe(6);
    expect(score({ mode: ' Easy ' }).score).toBe(3);
    expect(score({ death_link: 'on' }).score).toBe(5);
    expect(score({ death_link: 'True' }).score).toBe(5);
    expect(score({ death_link: 'YES' }).score).toBe(5);
    expect(score({ death_link: 1 }).score).toBe(5);
    expect(score({ death_link: 'off' }).score).toBe(4);
    expect(score({ death_link: 0 }).score).toBe(4);
    expect(score({ death_link: 'Random' }).score).toBe(4.5);
    expect(score({ mode: 'Random' }).score).toBe(4.25);
  });

  it('reads a weighted table whose keys YAML turned from on/off into true/false', () => {
    // an unquoted on: / off: key reaches the scorer as the text "true" / "false"; the option's choices are on/off
    const onOff = {
      ...TEST_GAME,
      options: {
        ...TEST_GAME.options,
        mode: { ...TEST_GAME.options['mode']!, choices: [{ key: 'on', label: 'On' }, { key: 'off', label: 'Off' }], default: 'off' },
      },
    };
    const profile: DifficultyProfile = { ...TEST_PROFILE, options: { mode: { values: { on: 2, off: 0 } } } };
    const result = scoreProfile(profile, onOff, { mode: { true: 1, false: 1 } });
    expect(result.score).toBe(5);
    expect(result.approximated).toEqual(['Mode']);
  });

  it('never treats a word from the object prototype as a value or a special name', () => {
    expect(score({ balancing: 'constructor' }).score).toBe(4);
    expect(score({ balancing: 'constructor' }).approximated).toEqual(['Balancing']);
    expect(score({ mode: 'toString' }).approximated).toEqual(['Mode']);
  });

  it('only reads plain decimal numbers from text', () => {
    expect(score({ lives: '0x10' }).approximated).toEqual(['Lives']);
    expect(score({ lives: '1e3' }).approximated).toEqual(['Lives']);
    expect(score({ lives: '1' }).score).toBe(7);
    expect(score({ lives: ' 3.5 ' }).score).toBeCloseTo(5.125, 5); // 3 - 3 * 2.5 / 4 = 1.125 above the base of 4
  });

  it('never lists a change that rounds to nothing', () => {
    const tiny: DifficultyProfile = { ...TEST_PROFILE, options: { death_link: { values: { true: 0.004 } } } };
    expect(score({ death_link: true }, tiny).contributions).toEqual([]);
    const small: DifficultyProfile = { ...TEST_PROFILE, options: { death_link: { values: { true: -0.005 } } } };
    for (const c of score({ death_link: true }, small).contributions) expect(Math.abs(c.delta)).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const values = { death_link: true, mode: { easy: 1, hard: 3 }, lives: 2 };
    expect(score(values)).toEqual(score(values));
  });
});
