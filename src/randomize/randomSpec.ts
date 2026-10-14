import type { OptionSchema } from '../schema/types';

/**
 * Archipelago's own random values, decided when the seed is generated (see Options.py):
 *   random, random-low, random-middle, random-high            (the last three only for numbers)
 *   random-range-A-B                                          (numbers; A and B are whole numbers, no minus sign)
 */
export type RandomBias = 'any' | 'low' | 'middle' | 'high';

export type RandomSpec =
  | { type: 'random'; bias: RandomBias }
  | { type: 'range'; from: number; to: number };

export type RandomModeId = 'random' | 'random-low' | 'random-middle' | 'random-high' | 'range';

export interface RandomMode {
  id: RandomModeId;
  label: string;
}

export function isNumeric(option: OptionSchema): boolean {
  return option.kind === 'range' || option.kind === 'named_range';
}

/** Kinds that can be set to a random value. Lists, sets, plando and free text cannot. */
export function acceptsRandom(option: OptionSchema): boolean {
  switch (option.kind) {
    case 'toggle':
    case 'choice':
    case 'text_choice':
      return true;
    case 'range':
    case 'named_range':
      return typeof option.min === 'number' && typeof option.max === 'number';
    default:
      return false;
  }
}

/** The bounds of a numeric option as whole numbers (callers check isNumeric first). */
function bounds(option: OptionSchema): { min: number; max: number } {
  return { min: option.min ?? 0, max: option.max ?? 0 };
}

/** "random-range-A-B" cannot hold a minus sign, so the range mode is only offered when no value is negative. */
export function supportsRangeMode(option: OptionSchema): boolean {
  return isNumeric(option) && bounds(option).min >= 0;
}

/** The ways an option can be made random, in the order they are offered. */
export function randomModes(option: OptionSchema): RandomMode[] {
  if (!acceptsRandom(option)) return [];
  const modes: RandomMode[] = [{ id: 'random', label: 'Random' }];
  if (isNumeric(option)) {
    modes.push(
      { id: 'random-low', label: 'Random, leaning low' },
      { id: 'random-middle', label: 'Random, leaning middle' },
      { id: 'random-high', label: 'Random, leaning high' },
    );
    if (supportsRangeMode(option)) modes.push({ id: 'range', label: 'Random between two numbers' });
  }
  return modes;
}

/** The text to write in the YAML. */
export function formatRandom(spec: RandomSpec): string {
  if (spec.type === 'range') {
    const [from, to] = spec.from <= spec.to ? [spec.from, spec.to] : [spec.to, spec.from];
    return `random-range-${from}-${to}`;
  }
  return spec.bias === 'any' ? 'random' : `random-${spec.bias}`;
}

/** The mode a spec belongs to. */
export function modeOf(spec: RandomSpec): RandomModeId {
  if (spec.type === 'range') return 'range';
  return spec.bias === 'any' ? 'random' : (`random-${spec.bias}` as RandomModeId);
}

/**
 * Reads a YAML value as one of the random values above, or null when it is not one (or not one this option accepts).
 * Case and surrounding spaces do not matter. A real choice that merely starts with "random" is a choice, not randomness.
 */
export function parseRandom(option: OptionSchema, raw: unknown): RandomSpec | null {
  if (typeof raw !== 'string' || !acceptsRandom(option)) return null;
  // Archipelago's Toggle only accepts exactly "random": "Random" or " random " is an error there, so it is not shown as random.
  if (option.kind === 'toggle') return raw === 'random' ? { type: 'random', bias: 'any' } : null;
  const word = raw.trim().toLowerCase();
  if (option.choices?.some((c) => c.key.toLowerCase() === word)) return null;
  if (word === 'random') return { type: 'random', bias: 'any' };
  if (!isNumeric(option)) return null;
  if (word === 'random-low' || word === 'random-middle' || word === 'random-high') {
    return { type: 'random', bias: word.slice('random-'.length) as RandomBias };
  }
  const range = /^random-range-(\d+)-(\d+)$/.exec(word);
  if (range === null) return null;
  const a = Number(range[1]);
  const b = Number(range[2]);
  const { min, max } = bounds(option);
  const [from, to] = a <= b ? [a, b] : [b, a];
  if (min < 0) return null; // no "random between" mode is offered for an option that can be negative, so it stays read-only
  if (from < min || to > max) return null; // Archipelago refuses a range outside the option's own
  return { type: 'range', from, to };
}

/** One plain sentence about what the random value will do. */
export function describeRandom(option: OptionSchema, spec: RandomSpec): string {
  if (spec.type === 'range') return `Random: a whole number from ${spec.from} to ${spec.to}, decided when the seed is generated.`;
  if (option.kind === 'toggle') return 'Random: on or off, decided when the seed is generated.';
  if (!isNumeric(option)) return 'Random: any of the choices, decided when the seed is generated.';
  const { min, max } = bounds(option);
  const lean = { any: '', low: ', leaning towards low values', middle: ', leaning towards the middle', high: ', leaning towards high values' }[
    spec.bias
  ];
  return `Random: a whole number from ${min} to ${max}${lean}, decided when the seed is generated.`;
}
