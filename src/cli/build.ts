import { rateGame } from '../difficulty/registry';
import type { DifficultyProfile } from '../difficulty/types';
import { YamlDocument } from '../model/document';
import { planRandomizeAll, type DifficultyBand } from '../randomize/plan';
import { setOption } from '../renderer/state/options';
import { engineOptionsFor } from '../renderer/state/seedOptions';
import { seededRandom } from '../roulette/random';
import type { GameSchema } from '../schema/types';

/** Archipelago player names are at most 16 characters; this keeps to plain, safe ones. */
const PLAYER_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,15}$/;

export function validPlayerName(name: string): boolean {
  return PLAYER_NAME.test(name) && !name.endsWith(' ');
}

export type BandParse = { ok: true; band: DifficultyBand } | { ok: false; message: string };

/** "2-4" or "2.5-6.5": the difficulty band for --band. */
export function parseBand(text: string): BandParse {
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (match === null) return { ok: false, message: `--band must look like 2-4 (low-high, between 0 and 10), not "${text}".` };
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (min > max || max > 10) return { ok: false, message: `--band ${text}: the low end must not exceed the high end, and neither may pass 10.` };
  return { ok: true, band: { min, max } };
}

export interface BuildInput {
  game: GameSchema;
  apVersion: string;
  profiles: ReadonlyMap<string, DifficultyProfile>;
  name: string;
  seed: number;
  /** Options set on purpose; these are never re-rolled. */
  sets: Record<string, unknown>;
  /** More option keys to keep out of the roll. */
  lock: readonly string[];
  randomize: boolean;
  band: DifficultyBand | null;
}

export type BuildResult =
  | {
      ok: true;
      text: string;
      /** The option values as written (what the seed engine is given). */
      options: Record<string, unknown>;
      rolled: number;
      difficulty: { score: number; label: string; source: 'rated' | 'estimated' } | null;
    }
  | { ok: false; message: string };

/** One player YAML: the explicit settings first, then (optionally) a seeded Randomize everything over everything not locked. */
export function buildYaml(input: BuildInput): BuildResult {
  const { game, apVersion, profiles } = input;
  if (!validPlayerName(input.name)) {
    return { ok: false, message: `The player name "${input.name}" is not usable: 1 to 16 letters, digits, spaces, dots, dashes or underscores.` };
  }
  for (const key of input.lock) {
    if (!Object.hasOwn(game.options, key)) return { ok: false, message: `--lock: ${game.name} has no option "${key}".` };
  }
  if (input.band !== null && !input.randomize) return { ok: false, message: '--band only makes sense together with --randomize.' };

  const doc = YamlDocument.empty(game.name, input.name);
  doc.applyAll(Object.entries(input.sets).map(([key, value]) => setOption(game.name, game.options[key]!, value)));

  let rolled = 0;
  if (input.randomize) {
    const plan = planRandomizeAll({
      game,
      apVersion,
      profiles,
      current: engineOptionsFor(doc, game.name, game),
      locked: new Set([...Object.keys(input.sets), ...input.lock]),
      random: seededRandom(input.seed),
      band: input.band,
    });
    if (!plan.ok) return { ok: false, message: plan.message };
    doc.applyAll(plan.edits);
    rolled = plan.rolled;
  }

  const options = engineOptionsFor(doc, game.name, game);
  const rating = rateGame(game, apVersion, options, profiles);
  const difficulty =
    rating.score === null || rating.label === null || rating.source === 'none'
      ? null
      : { score: Math.round(rating.score * 10) / 10, label: rating.label, source: rating.source };
  return { ok: true, text: doc.toString(), options, rolled, difficulty };
}
