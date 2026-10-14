import type { Feel, GameInfo, WorldFacts } from './types';

export const FEEL: Feel = {
  genre: 'platformer',
  pace: 3,
  length: 3,
  tones: ['whimsical'],
  era: 'classic',
  families: [],
  activities: ['platforming', 'collecting'],
};

export const FACTS: WorldFacts = { checks: 100, items: 100, earlyOpen: 20, needsFile: false, systems: [] };

/** A game for tests: a profile and facts you can override, or null to leave one out. */
export function game(
  name: string,
  over: { feel?: Partial<Feel> | null; facts?: Partial<WorldFacts> | null; difficulty?: number | null } = {},
): GameInfo {
  return {
    name,
    feel: over.feel === null ? null : { ...FEEL, ...over.feel },
    facts: over.facts === null ? null : { ...FACTS, ...over.facts },
    difficulty: over.difficulty ?? null,
  };
}
