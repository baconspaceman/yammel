import type { YamlDocument } from '../../model/document';
import type { GameSchema } from '../../schema/types';

/**
 * The option values this YAML sets for one game, exactly as written (random and weighted values included:
 * the engine reports those as "not counted"). Options the game does not have, and empty values, are left out.
 */
export function engineOptionsFor(doc: YamlDocument, game: string, schemaGame: GameSchema): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const key of Object.keys(schemaGame.options)) {
    if (!doc.has(game, key)) continue;
    const value = doc.get(game, key);
    if (value === null || value === undefined) continue;
    options[key] = value;
  }
  return options;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, stable(inner)]),
    );
  }
  return value;
}

/** A key that is the same for the same game and values however the keys are ordered. */
export function countKey(game: string, options: Record<string, unknown>): string {
  return JSON.stringify([game, stable(options)]);
}
