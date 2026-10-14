import type { GameSchema, OptionSchema } from '../schema/types';
import { PROFILE_FORMAT, type DifficultyProfile, type OptionEffect } from './types';

/** An estimated profile always starts here: the rules can say how far options move the score, not where a game starts. */
export const ESTIMATE_BASE = 5;

const OFF_WORDS = ['disable', 'disabled', 'off', 'false', 'none', 'no', 'vanilla'];

/** Words in choice names that mean easier (negative) or harder (positive), in rough "difficulty levels". */
const LEVEL_WORDS: Record<string, number> = {
  baby: -2.5,
  peaceful: -2.5,
  newbie: -2,
  beginner: -2,
  casual: -1.5,
  easy: -1.5,
  plentiful: -1.5,
  simple: -1,
  half: -1,
  normal: 0,
  default: 0,
  medium: 0,
  regular: 0,
  balanced: 0,
  scarce: 1.5,
  hard: 1.5,
  double: 1.5,
  veteran: 2,
  harder: 2.5,
  expert: 2.5,
  master: 3,
  quadruple: 3,
  hardcore: 3,
  brutal: 3.5,
  hell: 3.5,
  extreme: 4,
  ohko: 4,
  mania: 4,
  nightmare: 4,
  insane: 4,
  infinity: 5,
};
/** One difficulty level moves the score this much. */
const LEVEL_STEP = 0.4;

const round2 = (n: number): number => Math.round(n * 100) / 100;

type Rule = (option: OptionSchema) => OptionEffect | null;

const deathLink: Rule = (option) => {
  if (!/(^|_)death_?link$/i.test(option.key)) return null;
  const why = 'Death link: when any player dies, everyone dies, so one mistake costs the whole group.';
  if (option.kind === 'toggle') return { why, values: { true: 0.4 } };
  if (option.kind === 'choice') {
    const values: Record<string, number> = {};
    for (const choice of option.choices ?? []) if (!OFF_WORDS.includes(choice.key)) values[choice.key] = 0.4;
    return Object.keys(values).length > 0 ? { why, values } : null;
  }
  return null;
};

const minimalAccessibility: Rule = (option) => {
  if (option.key !== 'accessibility' || option.kind !== 'choice') return null;
  if (!(option.choices ?? []).some((c) => c.key === 'minimal')) return null;
  return {
    why: 'Minimal accessibility only promises the goal can be finished, so far fewer items are guaranteed to be reachable.',
    values: { minimal: 0.6 },
  };
};

/**
 * Only the overall amount of traps counts. Per-trap weights and counts only matter once traps exist at all, and changing
 * all of them the same way changes nothing, so they would swing the score without meaning anything.
 */
const traps: Rule = (option) => {
  if ((option.kind !== 'range' && option.kind !== 'named_range') || option.min !== 0 || (option.max ?? 0) <= 0) return null;
  if (!/^(trap_?(chance|percent(age)?|fill_?percent(age)?)|total_?trap_?(chance|percent(age)?))$/i.test(option.key)) return null;
  return {
    why: 'Traps are setbacks hidden among the items, so more of them makes the run harder.',
    curve: [
      [0, 0],
      [option.max!, 1],
    ],
  };
};

const hardSwitch: Rule = (option) => {
  if (option.kind !== 'toggle') return null;
  const match = /(^|_)(ohko|one_?hit(_?ko)?|permadeath|hard_?mode|hardcore)(_|$)/i.exec(option.key);
  if (match === null) return null;
  const oneHit = /ohko|one_?hit|permadeath/i.test(match[0]);
  return { why: oneHit ? 'One mistake ends the run.' : 'The game itself is set to a harder mode.', values: { true: oneHit ? 2 : 1.5 } };
};

const levelLadder: Rule = (option) => {
  if (option.kind !== 'choice' || !/difficult|hard|damage|enemy_?(health|damage)|item_?pool|logic_?(rules|difficulty)/i.test(option.key)) return null;
  const values: Record<string, number> = {};
  for (const choice of option.choices ?? []) {
    const levels = choice.key
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((word) => (Object.hasOwn(LEVEL_WORDS, word) ? LEVEL_WORDS[word] : undefined))
      .filter((level): level is number => level !== undefined);
    // a choice that cannot be placed would silently count as the default, so the whole ladder is refused instead
    if (levels.length === 0) return null;
    const strongest = levels.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
    values[choice.key] = round2(strongest * LEVEL_STEP);
  }
  if (Object.keys(values).length < 2) return null;
  return { why: 'The names of the choices say how hard they are, so higher levels count as harder.', values };
};

function firstEffect(rules: Rule[], option: OptionSchema): OptionEffect | null {
  for (const rule of rules) {
    const effect = rule(option);
    if (effect !== null) return effect;
  }
  return null;
}

/** Death link and accessibility exist in almost every game, so finding only those says nothing about how hard this game is. */
const GENERIC_RULES: Rule[] = [deathLink, minimalAccessibility];
const SPECIFIC_RULES: Rule[] = [traps, hardSwitch, levelLadder];

/**
 * A guess at a game's difficulty profile from its option names and choices, for games nobody has written a profile for.
 * Returns null unless at least one option looks specifically difficulty-related (traps, a hard mode, a difficulty ladder);
 * death link and accessibility alone are not enough.
 */
export function estimateProfile(game: GameSchema, apVersion: string): DifficultyProfile | null {
  const options: Record<string, OptionEffect> = {};
  let specific = 0;
  for (const option of Object.values(game.options)) {
    const specificEffect = firstEffect(SPECIFIC_RULES, option);
    const effect = specificEffect ?? firstEffect(GENERIC_RULES, option);
    if (effect === null) continue;
    options[option.key] = effect;
    if (specificEffect !== null) specific += 1;
  }
  if (specific === 0) return null;
  return { format: PROFILE_FORMAT, game: game.name, apVersion, status: 'estimated', base: ESTIMATE_BASE, options };
}
