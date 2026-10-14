import { rateGame } from '../difficulty/registry';
import type { DifficultyProfile } from '../difficulty/types';
import type { Edit } from '../model/edits';
import { randomizableOptions } from '../randomize/roll';
import { describeOption } from '../renderer/state/options';
import type { GameSchema, OptionSchema } from '../schema/types';

export interface Nudge {
  edits: Edit[];
  /** One plain line per change: "Turn on Swordless". */
  changes: string[];
  before: number;
  after: number;
}

export type NudgeResult = { ok: true; nudge: Nudge } | { ok: false; message: string };

/** The few values worth trying for an option: both ends of a switch, every choice, and a spread of a number's range. */
function candidates(option: OptionSchema, current: unknown): unknown[] {
  if (option.kind === 'toggle') return [!(current === true)];
  if (option.kind === 'choice' || option.kind === 'text_choice') return (option.choices ?? []).map((choice) => choice.key);
  const min = option.min ?? 0;
  const max = option.max ?? 0;
  const span = max - min;
  const points = new Set([min, max, min + Math.round(span * 0.25), min + Math.round(span * 0.5), min + Math.round(span * 0.75)]);
  if (typeof current === 'number') {
    points.add(Math.min(max, current + Math.max(1, Math.round(span * 0.1))));
    points.add(Math.max(min, current - Math.max(1, Math.round(span * 0.1))));
  }
  return [...points];
}

function describeChange(option: OptionSchema, value: unknown): string {
  if (option.kind === 'toggle') return `${value === true ? 'Turn on' : 'Turn off'} ${option.displayName}`;
  const choice = option.choices?.find((entry) => entry.key === value);
  return `Set ${option.displayName} to ${choice?.label ?? String(value)}`;
}

/**
 * Looks for a few option changes that move the difficulty estimate by about `amount` in one direction. It tries one
 * change at a time, keeps the one that lands nearest the target, and stops when close enough, when nothing helps, or
 * after `maxChanges`. Only options the Simple view shows are touched, and options in `locked` are left alone.
 */
export function nudgeDifficulty(input: {
  game: GameSchema;
  apVersion: string;
  profiles: ReadonlyMap<string, DifficultyProfile>;
  current: Record<string, unknown>;
  direction: 'harder' | 'easier';
  amount: number;
  locked?: ReadonlySet<string>;
  maxChanges?: number;
}): NudgeResult {
  const { game, apVersion, profiles } = input;
  const start = rateGame(game, apVersion, input.current, profiles);
  if (start.source === 'none' || start.score === null) {
    return { ok: false, message: `${game.name} has no difficulty rating, so I cannot tell which settings would make it harder or easier.` };
  }
  const sign = input.direction === 'harder' ? 1 : -1;
  const target = Math.min(10, Math.max(0, start.score + sign * input.amount));
  if (Math.abs(target - start.score) < 0.05) {
    return { ok: false, message: `It is already about as ${input.direction === 'harder' ? 'hard' : 'easy'} as this game's settings can make it.` };
  }
  const options = randomizableOptions(game).filter((option) => !(input.locked?.has(option.key) ?? false));
  const values: Record<string, unknown> = { ...input.current };
  const used = new Set<string>();
  const edits: Edit[] = [];
  const changes: string[] = [];
  let score = start.score;
  const limit = input.maxChanges ?? 4;

  while (changes.length < limit && Math.abs(target - score) > 0.3) {
    let best: { option: OptionSchema; value: unknown; score: number } | null = null;
    for (const option of options) {
      if (used.has(option.key)) continue;
      const now = describeOption(option, values[option.key]).value;
      for (const value of candidates(option, values[option.key])) {
        if (value === now) continue;
        const next = rateGame(game, apVersion, { ...values, [option.key]: value }, profiles).score;
        if (next === null) continue;
        const moved = (next - score) * sign;
        if (moved <= 0.05) continue; // must move the right way
        if ((next - target) * sign > 0.6) continue; // do not blow far past the target
        if (best === null || Math.abs(next - target) < Math.abs(best.score - target) - 1e-9) best = { option, value, score: next };
      }
    }
    if (best === null) break;
    used.add(best.option.key);
    values[best.option.key] = best.value;
    edits.push({ op: 'set', game: game.name, option: best.option.key, value: best.value });
    changes.push(describeChange(best.option, best.value));
    score = best.score;
  }

  if (changes.length === 0) {
    return { ok: false, message: `I could not find a setting that makes this ${input.direction === 'harder' ? 'harder' : 'easier'} without going too far.` };
  }
  return { ok: true, nudge: { edits, changes, before: start.score, after: score } };
}
