import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../difficulty/testGame';
import type { OptionSchema } from '../schema/types';
import {
  acceptsRandom,
  describeRandom,
  formatRandom,
  modeOf,
  parseRandom,
  randomModes,
  supportsRangeMode,
  type RandomSpec,
} from './randomSpec';

const O = TEST_GAME.options as Record<string, OptionSchema>;
const toggle = O['death_link']!;
const choice = O['mode']!;
const lives = O['lives']!; // range 1..9
const balancing = O['balancing']!; // named range 0..100
const notes = O['notes']!; // free text
const negative: OptionSchema = { ...lives, key: 'clock', min: -60, max: 60 };
const randomChoice: OptionSchema = {
  ...choice,
  key: 'pick',
  choices: [
    { key: 'random_balanced', label: 'Balanced' },
    { key: 'random', label: 'Random pick' },
    { key: 'fixed', label: 'Fixed' },
  ],
};

describe('acceptsRandom / randomModes', () => {
  it('accepts switches, choices and numbers, and nothing else', () => {
    expect([toggle, choice, lives, balancing].every(acceptsRandom)).toBe(true);
    expect(acceptsRandom(notes)).toBe(false);
    expect(acceptsRandom({ ...lives, min: undefined })).toBe(false);
    expect(randomModes(notes)).toEqual([]);
  });

  it('offers only plain Random for switches and choices', () => {
    expect(randomModes(toggle).map((m) => m.id)).toEqual(['random']);
    expect(randomModes(choice).map((m) => m.id)).toEqual(['random']);
  });

  it('offers the leaning modes and a range for numbers', () => {
    expect(randomModes(lives).map((m) => m.id)).toEqual(['random', 'random-low', 'random-middle', 'random-high', 'range']);
    expect(randomModes(balancing).map((m) => m.id)).toContain('range');
  });

  it('does not offer a range when the option can be negative (Archipelago cannot write one)', () => {
    expect(supportsRangeMode(negative)).toBe(false);
    expect(randomModes(negative).map((m) => m.id)).toEqual(['random', 'random-low', 'random-middle', 'random-high']);
  });
});

describe('formatRandom / modeOf', () => {
  it('writes Archipelago text', () => {
    expect(formatRandom({ type: 'random', bias: 'any' })).toBe('random');
    expect(formatRandom({ type: 'random', bias: 'low' })).toBe('random-low');
    expect(formatRandom({ type: 'random', bias: 'middle' })).toBe('random-middle');
    expect(formatRandom({ type: 'random', bias: 'high' })).toBe('random-high');
    expect(formatRandom({ type: 'range', from: 2, to: 6 })).toBe('random-range-2-6');
  });

  it('writes a range with the smaller number first', () => {
    expect(formatRandom({ type: 'range', from: 8, to: 3 })).toBe('random-range-3-8');
  });

  it('round-trips every mode', () => {
    const specs: RandomSpec[] = [
      { type: 'random', bias: 'any' },
      { type: 'random', bias: 'low' },
      { type: 'random', bias: 'middle' },
      { type: 'random', bias: 'high' },
      { type: 'range', from: 2, to: 6 },
    ];
    for (const spec of specs) expect(parseRandom(lives, formatRandom(spec))).toEqual(spec);
    expect(specs.map(modeOf)).toEqual(['random', 'random-low', 'random-middle', 'random-high', 'range']);
  });
});

describe('parseRandom', () => {
  it('reads plain random for every kind that accepts it; choices and numbers ignore case and spaces', () => {
    for (const option of [toggle, choice, lives, balancing]) {
      expect(parseRandom(option, 'random')).toEqual({ type: 'random', bias: 'any' });
    }
    for (const option of [choice, lives, balancing]) {
      expect(parseRandom(option, '  Random ')).toEqual({ type: 'random', bias: 'any' });
    }
  });

  it('reads random on a switch only as exactly "random": Archipelago refuses any other case there', () => {
    expect(parseRandom(toggle, 'random')).toEqual({ type: 'random', bias: 'any' });
    expect(parseRandom(toggle, 'Random')).toBeNull();
    expect(parseRandom(toggle, 'RANDOM')).toBeNull();
    expect(parseRandom(toggle, ' random ')).toBeNull();
  });

  it('does not show a random range on an option that can be negative as if it were editable', () => {
    expect(parseRandom(negative, 'random-range-0-3')).toBeNull();
    expect(parseRandom(negative, 'random-low')).toEqual({ type: 'random', bias: 'low' });
  });

  it('reads the leaning modes and ranges only for numbers', () => {
    expect(parseRandom(lives, 'random-low')).toEqual({ type: 'random', bias: 'low' });
    expect(parseRandom(balancing, 'RANDOM-HIGH')).toEqual({ type: 'random', bias: 'high' });
    expect(parseRandom(lives, 'random-range-3-7')).toEqual({ type: 'range', from: 3, to: 7 });
    expect(parseRandom(lives, 'random-range-7-3')).toEqual({ type: 'range', from: 3, to: 7 });
    expect(parseRandom(choice, 'random-low')).toBeNull();
    expect(parseRandom(toggle, 'random-range-1-2')).toBeNull();
  });

  it('refuses a range outside the option, and text that is not a random value', () => {
    expect(parseRandom(lives, 'random-range-0-5')).toBeNull(); // below the minimum of 1
    expect(parseRandom(lives, 'random-range-5-12')).toBeNull();
    expect(parseRandom(lives, 'random-range-1')).toBeNull();
    expect(parseRandom(lives, 'random-range-low-1-5')).toBeNull(); // a variant this app does not edit
    expect(parseRandom(lives, 'randomish')).toBeNull();
    expect(parseRandom(lives, 5)).toBeNull();
    expect(parseRandom(lives, true)).toBeNull();
    expect(parseRandom(lives, { random: 1 })).toBeNull();
    expect(parseRandom(notes, 'random')).toBeNull();
  });

  it('treats a choice that is literally called random, or starts with it, as a choice', () => {
    expect(parseRandom(randomChoice, 'random_balanced')).toBeNull();
    expect(parseRandom(randomChoice, 'random')).toBeNull();
    expect(parseRandom(randomChoice, 'RANDOM')).toBeNull();
  });
});

describe('describeRandom', () => {
  it('says in plain words what will happen', () => {
    expect(describeRandom(toggle, { type: 'random', bias: 'any' })).toBe('Random: on or off, decided when the seed is generated.');
    expect(describeRandom(choice, { type: 'random', bias: 'any' })).toBe('Random: any of the choices, decided when the seed is generated.');
    expect(describeRandom(lives, { type: 'random', bias: 'any' })).toBe('Random: a whole number from 1 to 9, decided when the seed is generated.');
    expect(describeRandom(lives, { type: 'random', bias: 'low' })).toBe(
      'Random: a whole number from 1 to 9, leaning towards low values, decided when the seed is generated.',
    );
    expect(describeRandom(lives, { type: 'range', from: 2, to: 4 })).toBe('Random: a whole number from 2 to 4, decided when the seed is generated.');
  });
});
