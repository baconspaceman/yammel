import { rateGame } from '../difficulty/registry';
import type { DifficultyProfile } from '../difficulty/types';
import type { Edit } from '../model/edits';
import { setOption } from '../renderer/state/options';
import type { Random } from '../roulette/random';
import type { GameSchema } from '../schema/types';
import { randomizableOptions, rollDifferent, rollValue } from './roll';

export interface DifficultyBand {
  min: number;
  max: number;
}

export interface RandomizeInput {
  game: GameSchema;
  apVersion: string;
  profiles: ReadonlyMap<string, DifficultyProfile>;
  /** The option values the YAML has now (as engineOptionsFor collects them): locked options keep these. */
  current: Record<string, unknown>;
  /** Option keys that must not be touched. */
  locked: ReadonlySet<string>;
  random: Random;
  /** Only accept a roll whose difficulty lands inside this band. */
  band?: DifficultyBand | null;
  /** How many rolls to try for a band before giving up. */
  maxTries?: number;
}

export type RandomizePlan =
  | { ok: true; edits: Edit[]; rolled: number; tries: number; score: number | null }
  | { ok: false; message: string };

export const DEFAULT_MAX_TRIES = 300;

/** A weighted table ({ value: weight }) or a list of values: the person chose those on purpose, so Randomize everything leaves it alone. */
export function isWeightedValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function setsFor(game: GameSchema, rolls: Map<string, unknown>): Edit[] {
  return [...rolls].map(([key, value]) => setOption(game.name, game.options[key]!, value));
}

/**
 * Re-rolls every option that is not locked, as one batch of edits (so it is one undo step). With a band, rolls again until
 * the difficulty estimate lands inside it, up to maxTries, and says so plainly if nothing fits.
 */
export function planRandomizeAll(input: RandomizeInput): RandomizePlan {
  const { game, apVersion, profiles, current, locked, random } = input;
  const targets = randomizableOptions(game).filter((option) => !locked.has(option.key) && !isWeightedValue(current[option.key]));
  if (targets.length === 0) {
    return { ok: false, message: 'Every option that can be randomized is locked or weighted, so nothing was changed.' };
  }

  const rollAll = (): Map<string, unknown> => new Map(targets.map((option) => [option.key, rollValue(option, random)]));

  const band = input.band ?? null;
  if (band === null) return { ok: true, edits: setsFor(game, rollAll()), rolled: targets.length, tries: 1, score: null };

  if (!(band.min >= 0 && band.max <= 10 && band.min <= band.max)) {
    return { ok: false, message: 'The difficulty band must be between 0 and 10, with the low end first.' };
  }
  if (rateGame(game, apVersion, current, profiles).source === 'none') {
    return { ok: false, message: 'This game has no difficulty rating, so a difficulty band cannot be used.' };
  }

  const kept: Record<string, unknown> = { ...current };
  for (const option of targets) delete kept[option.key];
  const scoreOf = (rolls: Map<string, unknown>): number =>
    rateGame(game, apVersion, { ...kept, ...Object.fromEntries(rolls) }, profiles).score ?? Number.POSITIVE_INFINITY;
  const distance = (score: number): number => (score < band.min ? band.min - score : score > band.max ? score - band.max : 0);

  // A budget of scored rolls. Plain luck gets most bands, but rolling everything evenly leans hard, so an easy band is rarely
  // hit that way: the first quarter of the budget samples fresh rolls, the rest nudges one option at a time toward the band.
  const budget = Math.max(1, input.maxTries ?? DEFAULT_MAX_TRIES);
  const sampling = Math.max(1, Math.ceil(budget / 4));
  let best = rollAll();
  let bestDistance = distance(scoreOf(best));
  let used = 1;
  const found = () => ({ ok: true as const, edits: setsFor(game, best), rolled: targets.length, tries: used, score: scoreOf(best) });
  if (bestDistance === 0) return found();

  while (used < sampling) {
    used += 1;
    const rolls = rollAll();
    const d = distance(scoreOf(rolls));
    if (d < bestDistance) {
      best = rolls;
      bestDistance = d;
    }
    if (bestDistance === 0) return found();
  }
  // Every pass through here scores one new roll. An option with no second value to offer is skipped without using the budget, and
  // the pass count is capped so a game made only of such options cannot loop forever.
  let passes = 0;
  while (used < budget && passes < budget * 20) {
    passes += 1;
    const option = targets[Math.min(targets.length - 1, Math.floor(random() * targets.length))]!;
    const value = rollDifferent(option, best.get(option.key), random);
    if (value === undefined) continue;
    used += 1;
    const candidate = new Map(best).set(option.key, value);
    const d = distance(scoreOf(candidate));
    if (d <= bestDistance) {
      best = candidate;
      bestDistance = d;
    }
    if (bestDistance === 0) return found();
  }
  return {
    ok: false,
    message: `No combination in ${used} tries landed between ${band.min} and ${band.max}, so nothing was changed. Try a wider band, or unlock more options.`,
  };
}
