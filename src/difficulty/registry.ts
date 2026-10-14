import type { GameSchema } from '../schema/types';
import { estimateProfile } from './estimate';
import { labelFor } from './labels';
import { scoreProfile } from './score';
import type { DifficultyProfile, Rating } from './types';

const NO_RATING: Rating = {
  source: 'none',
  status: null,
  score: null,
  label: null,
  contributions: [],
  approximated: [],
  note: 'No option here looks difficulty-related, and nobody has written a rating for this game yet.',
};

const estimates = new WeakMap<GameSchema, DifficultyProfile | null>();

function estimateFor(game: GameSchema, apVersion: string): DifficultyProfile | null {
  if (!estimates.has(game)) estimates.set(game, estimateProfile(game, apVersion));
  return estimates.get(game) ?? null;
}

/** The ready-made profiles by game name. A file that is not a profile for a named game is ignored. */
export function indexProfiles(files: readonly unknown[]): Map<string, DifficultyProfile> {
  const index = new Map<string, DifficultyProfile>();
  for (const file of files) {
    if (typeof file !== 'object' || file === null) continue;
    const profile = file as DifficultyProfile;
    if (typeof profile.game === 'string' && profile.game !== '') index.set(profile.game, profile);
  }
  return index;
}

/**
 * What the meter shows for one game and its current option values.
 * A ready-made profile gives a Rated score; otherwise rules over the option names give an Estimated one; otherwise there is none.
 */
export function rateGame(
  game: GameSchema,
  apVersion: string,
  values: Record<string, unknown>,
  profiles: ReadonlyMap<string, DifficultyProfile>,
): Rating {
  const curated = profiles.get(game.name);
  const profile = curated ?? estimateFor(game, apVersion);
  if (profile === null || profile === undefined) return NO_RATING;
  const result = scoreProfile(profile, game, values);
  if (!Number.isFinite(result.score)) return { ...NO_RATING, note: 'The difficulty data for this game could not be read, so there is no rating.' };
  const estimated = curated === undefined;
  let note: string;
  if (estimated) {
    note =
      'Estimated from option names only. It shows how far your choices move the game from its defaults; the starting point is a guess, not a rating.';
  } else if (profile.status === 'reviewed') {
    note = 'Rated, and checked by someone who plays this game. Still an estimate, not a measurement.';
  } else {
    note = 'A draft rating written from the option names. It has not been checked by someone who plays this game.';
  }
  if (!estimated && profile.apVersion !== apVersion) {
    note += ` It was written for Archipelago ${profile.apVersion}; the options here are from ${apVersion}.`;
  }
  return {
    source: estimated ? 'estimated' : 'rated',
    status: profile.status,
    score: result.score,
    label: labelFor(result.score),
    contributions: result.contributions,
    approximated: result.approximated,
    note,
  };
}
