import { simpleGroups } from '../renderer/state/options';
import type { Random } from '../roulette/random';
import type { GameSchema, OptionSchema } from '../schema/types';
import { acceptsRandom, isNumeric } from './randomSpec';

/**
 * "Randomize everything" leaves alone any number option with more values than this. A roll over 0 to 999999
 * (starting money, a price) is almost never what anyone wants, and "Roll now" on that one option still works.
 */
export const WIDE_RANGE = 1000;

/** Whether "Roll now" can pick a real value for this option. */
export function isRollable(option: OptionSchema): boolean {
  if (!acceptsRandom(option)) return false;
  if (option.kind === 'choice' || option.kind === 'text_choice') return (option.choices?.length ?? 0) > 0;
  if (isNumeric(option)) return (option.max ?? 0) >= (option.min ?? 0);
  return true;
}

/** A valid value for this option, chosen evenly from what it allows; undefined when the option cannot be rolled. */
export function rollValue(option: OptionSchema, random: Random): unknown {
  if (!isRollable(option)) return undefined;
  if (option.kind === 'toggle') return random() < 0.5;
  if (option.kind === 'choice' || option.kind === 'text_choice') {
    const choices = option.choices ?? [];
    return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]!.key;
  }
  const min = option.min!;
  const span = option.max! - min + 1;
  return min + Math.min(span - 1, Math.floor(random() * span));
}

/** Like rollValue, but never the value given. undefined when the option has no second value to offer. */
export function rollDifferent(option: OptionSchema, current: unknown, random: Random): unknown {
  if (!isRollable(option)) return undefined;
  if (option.kind === 'toggle') return current !== true;
  if (option.kind === 'choice' || option.kind === 'text_choice') {
    const others = (option.choices ?? []).filter((choice) => choice.key !== current);
    if (others.length === 0) return undefined;
    return others[Math.min(others.length - 1, Math.floor(random() * others.length))]!.key;
  }
  const min = option.min!;
  const span = option.max! - min + 1;
  if (typeof current !== 'number' || !Number.isInteger(current) || current < min || current > option.max!) return rollValue(option, random);
  if (span < 2) return undefined;
  const pick = min + Math.min(span - 2, Math.floor(random() * (span - 1)));
  return pick >= current ? pick + 1 : pick;
}

/** Options "Randomize everything" may re-roll: shown in Simple mode, rollable, and not a very wide number range. */
export function randomizableOptions(game: GameSchema): OptionSchema[] {
  return simpleGroups(game, '')
    .flatMap((group) => group.options)
    .filter(isRollable)
    .filter((option) => !isNumeric(option) || option.max! - option.min! + 1 <= WIDE_RANGE);
}
