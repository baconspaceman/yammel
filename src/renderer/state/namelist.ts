import type { Edit } from '../../model/edits';
import type { GameSchema, OptionSchema } from '../../schema/types';

/** What a name-list option holds: plain names, or names with a count. */
export type NameEntries = { type: 'names'; names: string[] } | { type: 'counts'; counts: Record<string, number> };

export const LIST_KINDS: readonly string[] = ['set', 'list', 'counter', 'dict'];

export function isNameListKind(option: OptionSchema): boolean {
  return LIST_KINDS.includes(option.kind);
}

/** Every item (or location) name of the game, then its groups, in the order the game gives them. */
export function namePool(game: GameSchema, domain: 'items' | 'locations'): string[] {
  return domain === 'items' ? [...game.items, ...game.itemGroups] : [...game.locations, ...game.locationGroups];
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/**
 * The names in the file, or null when this editor cannot show them (a list of settings such as item links, a dict with
 * values that are not numbers). Nothing at all counts as an empty list.
 */
export function entriesOf(option: OptionSchema, raw: unknown): NameEntries | null {
  const counted = option.kind === 'counter' || option.kind === 'dict';
  if (raw === undefined || raw === null) return counted ? { type: 'counts', counts: {} } : { type: 'names', names: [] };
  if (!counted) {
    if (!Array.isArray(raw) || !raw.every((entry) => typeof entry === 'string')) return null;
    return { type: 'names', names: [...new Set(raw as string[])] };
  }
  if (!isPlainObject(raw)) return null;
  const entries = Object.entries(raw);
  if (!entries.every(([, count]) => typeof count === 'number' && Number.isInteger(count) && count >= 0)) return null;
  return { type: 'counts', counts: Object.fromEntries(entries as [string, number][]) };
}

/** Names that contain what was typed, names that start with it first, never ones already chosen. */
export function suggest(pool: readonly string[], query: string, taken: ReadonlySet<string>, limit = 8): string[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of pool) {
    if (taken.has(name)) continue;
    const lower = name.toLowerCase();
    if (lower.startsWith(wanted)) starts.push(name);
    else if (lower.includes(wanted)) contains.push(name);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** The edit that saves these names. Nothing left means the option is removed, so the game's default applies. */
export function nameEdit(game: string, option: OptionSchema, entries: NameEntries): Edit {
  if (entries.type === 'names') {
    return entries.names.length === 0 ? { op: 'reset', game, option: option.key } : { op: 'set', game, option: option.key, value: entries.names };
  }
  return Object.keys(entries.counts).length === 0 ? { op: 'reset', game, option: option.key } : { op: 'set', game, option: option.key, value: entries.counts };
}

export function countOf(entries: NameEntries): number {
  return entries.type === 'names' ? entries.names.length : Object.keys(entries.counts).length;
}
