import { describe, expect, it } from 'vitest';
import { labelFor, formatScore } from './labels';
import { validateProfile } from './profile';
import { TEST_GAME, TEST_PROFILE } from './testGame';

const check = (patch: Record<string, unknown>) => validateProfile({ ...TEST_PROFILE, ...patch }, TEST_GAME);
const withOption = (key: string, effect: unknown) => check({ options: { [key]: effect } });

describe('validateProfile', () => {
  it('accepts a sound profile', () => {
    expect(validateProfile(TEST_PROFILE, TEST_GAME)).toEqual([]);
  });

  it('rejects things that are not objects', () => {
    expect(validateProfile(null, TEST_GAME)).toEqual(['The profile must be an object.']);
    expect(validateProfile([], TEST_GAME)).toEqual(['The profile must be an object.']);
  });

  it('catches a wrong game, format, status, base or unknown field', () => {
    expect(check({ game: 'Other' })[0]).toMatch(/"game" is "Other"/);
    expect(check({ format: 2 })[0]).toMatch(/"format" must be 1/);
    expect(check({ status: 'perfect' })[0]).toMatch(/"status" must be one of/);
    expect(check({ base: 11 })[0]).toMatch(/"base" must be a number from 0 to 10/);
    expect(check({ base: '4' })[0]).toMatch(/"base"/);
    expect(check({ apVersion: '' })[0]).toMatch(/"apVersion"/);
    expect(check({ extra: 1 })[0]).toBe('Unknown field "extra".');
  });

  it('catches options the game does not have', () => {
    expect(withOption('no_such', { values: { true: 1 } })).toEqual(['Option "no_such" does not exist in Test Game.']);
  });

  it('catches a value that is not one of the option\'s values', () => {
    expect(withOption('mode', { values: { insane: 1 } })[0]).toMatch(/"insane" is not a value of this option \(allowed: easy, normal, hard, off\)/);
    expect(withOption('death_link', { values: { yes: 1 } })[0]).toMatch(/"yes" is not a value/);
    expect(withOption('balancing', { values: { huge: 1 } })[0]).toMatch(/"huge" is not a value/);
  });

  it('catches shifts that are not numbers or are too large', () => {
    expect(withOption('mode', { values: { hard: 'lots' } })[0]).toMatch(/shift for "hard"/);
    expect(withOption('mode', { values: { hard: 6 } })[0]).toMatch(/shift for "hard"/);
    expect(withOption('mode', { values: { hard: Number.NaN } })[0]).toMatch(/shift for "hard"/);
  });

  it('keeps values and curves on the right kinds of option', () => {
    expect(withOption('lives', { values: { 3: 1 } })[0]).toMatch(/cannot be used on a range option/);
    expect(withOption('mode', { curve: [[0, 0], [1, 1]] })[0]).toMatch(/only be used on a range or named range/);
    expect(withOption('notes', { values: { a: 1 } })[0]).toMatch(/cannot be used on a free_text option/);
  });

  it('checks curves', () => {
    expect(withOption('lives', { curve: [[1, 0]] })[0]).toMatch(/at least two points/);
    expect(withOption('lives', { curve: [[1, 0], [1, 1]] })[0]).toMatch(/must rise/);
    expect(withOption('lives', { curve: [[5, 0], [3, 1]] })[0]).toMatch(/must rise/);
    expect(withOption('lives', { curve: [[1, 0], [99, 1]] })[0]).toMatch(/outside the option's range 1 to 9/);
    expect(withOption('lives', { curve: [[1, 0], ['x', 1]] })[0]).toMatch(/\[value, shift\]/);
  });

  it('wants a reason to be a sentence and an effect to say something', () => {
    expect(withOption('mode', { why: '', values: { hard: 1 } })[0]).toMatch(/"why" must be a sentence/);
    expect(withOption('mode', {})[0]).toMatch(/needs "values" or "curve"/);
    expect(withOption('mode', { value: { hard: 1 } })[0]).toMatch(/unknown field "value"/);
  });
});

describe('labels', () => {
  it('shows one decimal', () => {
    expect(formatScore(4.04)).toBe('4.0');
    expect(formatScore(7)).toBe('7.0');
  });
  it('names the bands from very easy to very hard', () => {
    expect([0, 1.9, 2, 3.9, 4, 5.9, 6, 7.9, 8, 10].map(labelFor)).toEqual([
      'Very easy',
      'Very easy',
      'Easy',
      'Easy',
      'Moderate',
      'Moderate',
      'Hard',
      'Hard',
      'Very hard',
      'Very hard',
    ]);
  });
  it('uses the rounded score, so the number and the word agree', () => {
    expect(formatScore(3.96)).toBe('4.0');
    expect(labelFor(3.96)).toBe('Moderate');
  });
});
