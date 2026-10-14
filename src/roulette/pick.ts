import type { SchemaFile } from '../schema/types';
import type { Random } from './random';

export const ROULETTE_MIN = 1;
export const ROULETTE_MAX = 10;

/** Clamp a requested game count to 1..10. NaN counts as 1; fractions round to the nearest integer. */
export function clampCount(value: number): number {
  if (Number.isNaN(value)) return ROULETTE_MIN;
  const rounded = Math.round(value);
  return Math.min(ROULETTE_MAX, Math.max(ROULETTE_MIN, rounded));
}

/** Names of all games a roulette may pick from (hidden games excluded), sorted. */
export function rouletteGames(schema: SchemaFile): string[] {
  return Object.values(schema.games)
    .filter((game) => !game.hidden)
    .map((game) => game.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Unique, non-empty game names from a pool, in first-seen order. */
function uniquePool(pool: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of pool) {
    if (name.trim() === '' || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

/**
 * Pick `min(clampCount(count), unique pool size)` different games uniformly at random.
 * Partial Fisher-Yates on a copy, so `pool` is never mutated.
 */
export function pickGames(pool: readonly string[], count: number, random: Random): string[] {
  const names = uniquePool(pool);
  const wanted = Math.min(clampCount(count), names.length);
  for (let i = 0; i < wanted; i++) {
    const j = i + Math.floor(random() * (names.length - i));
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  return names.slice(0, wanted);
}

/**
 * Replace the game at `index` with a random game from `pool` that is not already in `current`.
 * Returns an unchanged copy when no such game exists or the index is out of range.
 */
export function rerollOne(
  pool: readonly string[],
  current: readonly string[],
  index: number,
  random: Random,
): string[] {
  const copy = [...current];
  if (!Number.isInteger(index) || index < 0 || index >= current.length) return copy;
  const taken = new Set(current);
  const candidates = uniquePool(pool).filter((name) => !taken.has(name));
  if (candidates.length === 0) return copy;
  const choice = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!;
  copy[index] = choice;
  return copy;
}
