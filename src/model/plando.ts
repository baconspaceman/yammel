import type { Edit } from './edits';

/**
 * Plando: placing things by hand instead of letting the generator choose.
 *
 * Item plando (`plando_items`): put chosen items at chosen locations.
 *   - item: Hookshot                  # one item, or `items:` with a list, or a map of name: how many
 *     location: Link's House          # one location, or `locations:` with a list ("Everywhere" if left out)
 *     world: false                    # false = your own world, true = any other world, a number or a name = that player
 *     from_pool: true                 # true = take it from the normal item pool, false = add a new one
 *     force: silent                   # true = stop the generation if it cannot be done, false = warn, silent = say nothing
 *     count: 2                        # how many of the items to place
 *     percentage: 50                  # the chance the whole entry applies
 *
 * Connection plando (`plando_connections`): choose which entrance leads to which exit.
 *   - entrance: Links House
 *     exit: Hyrule Castle Main Gate
 *     direction: both                 # both, entrance or exit
 *     percentage: 100
 *
 * Read from Archipelago's own Options.py (PlandoItems, PlandoConnections) and Fill.py (parse_planned_blocks), and
 * every rule checked by running its generator.
 */

export type ItemNames = { type: 'names'; names: string[] } | { type: 'counts'; counts: Record<string, number> };
export type PlandoWorld = false | true | null | number | string | string[];
export type PlandoCount = number | { min?: number; max?: number };
export type Force = true | false | 'silent';

export interface ItemPlando {
  items: ItemNames;
  /** Empty means "Everywhere". */
  locations: string[];
  world: PlandoWorld;
  fromPool: boolean;
  force: Force;
  /** null = not written. A map gives the fewest and the most. */
  count: PlandoCount | null;
  /** null = not written, so 100. */
  percentage: number | null;
  extra: Record<string, unknown>;
  editable: boolean;
  raw: unknown;
}

export interface ConnectionPlando {
  entrance: string;
  exit: string;
  direction: 'both' | 'entrance' | 'exit';
  percentage: number | null;
  extra: Record<string, unknown>;
  editable: boolean;
  raw: unknown;
}

export interface PlandoList<T> {
  entries: T[];
  /** Set when the value is not a list at all. The value is then left alone. */
  problem: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const ITEM_KEYS = new Set(['item', 'items', 'location', 'locations', 'world', 'from_pool', 'force', 'count', 'percentage']);
const CONNECTION_KEYS = new Set(['entrance', 'exit', 'direction', 'percentage']);

function extraOf(entry: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) if (!known.has(key)) out[key] = value;
  return out;
}

const NOT_LIST = 'The value is not a list, so it cannot be shown here.';

export function readItemPlando(raw: unknown): PlandoList<ItemPlando> {
  if (raw === undefined || raw === null) return { entries: [], problem: null };
  if (!Array.isArray(raw)) return { entries: [], problem: NOT_LIST };
  const entries = raw.map((entry): ItemPlando => {
    const blank: ItemPlando = { items: { type: 'names', names: [] }, locations: [], world: false, fromPool: true, force: 'silent', count: null, percentage: null, extra: {}, editable: false, raw: entry };
    if (!isRecord(entry)) return blank;
    let items: ItemNames | null = null;
    const many = entry['items'];
    const one = entry['item'];
    if (isStrings(many) && many.length > 0) items = { type: 'names', names: [...many] };
    else if (isRecord(many) && Object.values(many).every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0) && Object.keys(many).length > 0) items = { type: 'counts', counts: { ...(many as Record<string, number>) } };
    else if (typeof one === 'string' && many === undefined) items = { type: 'names', names: [one] };
    else if (one === undefined && (many === undefined || (Array.isArray(many) && many.length === 0) || (isRecord(many) && Object.keys(many).length === 0))) items = { type: 'names', names: [] }; // nothing chosen yet

    let locations: string[] | null = [];
    const locList = entry['locations'];
    const locOne = entry['location'];
    if (locList !== undefined) locations = isStrings(locList) ? [...locList] : null;
    else if (typeof locOne === 'string') locations = [locOne];
    else if (isStrings(locOne)) locations = [...locOne];
    else if (locOne !== undefined) locations = null;
    if (locations !== null && locations.length === 1 && locations[0] === 'Everywhere') locations = [];

    const world = entry['world'] === undefined ? false : entry['world'];
    const fromPool = entry['from_pool'] === undefined ? true : entry['from_pool'];
    const force = entry['force'] === undefined ? 'silent' : entry['force'];
    const count = entry['count'];
    const percentage = entry['percentage'];
    const worldOk = world === false || world === true || world === null || typeof world === 'number' || typeof world === 'string' || (isStrings(world) && world.length > 0);
    const isRange = isRecord(count) && Object.keys(count).every((key) => key === 'min' || key === 'max') && Object.values(count).every((n) => typeof n === 'number' && Number.isInteger(n));
    const editable =
      items !== null &&
      locations !== null &&
      worldOk &&
      typeof fromPool === 'boolean' &&
      (force === true || force === false || force === 'silent') &&
      (count === undefined || count === false || (typeof count === 'number' && Number.isInteger(count)) || isRange) &&
      (percentage === undefined || (typeof percentage === 'number' && Number.isInteger(percentage)));
    if (!editable) return blank;
    return {
      items: items!,
      locations: locations!,
      world: (Array.isArray(world) ? [...world] : world) as PlandoWorld,
      fromPool: fromPool as boolean,
      force: force as Force,
      count: typeof count === 'number' ? count : isRange ? { ...(count as { min?: number; max?: number }) } : null,
      percentage: typeof percentage === 'number' ? percentage : null,
      extra: extraOf(entry, ITEM_KEYS),
      editable: true,
      raw: entry,
    };
  });
  return { entries, problem: null };
}

export function itemPlandoToPlain(entry: ItemPlando): unknown {
  if (!entry.editable) return entry.raw;
  const out: Record<string, unknown> = {};
  const names = entry.items.type === 'names' ? entry.items.names : null;
  // A single `item` or `location` also fixes the count at one, so the plural forms are used whenever a count is written.
  const singleItem = names !== null && names.length === 1 && entry.count === null;
  const singleLocation = entry.locations.length === 1 && entry.count === null;
  if (singleItem) out['item'] = names![0];
  else out['items'] = entry.items.type === 'names' ? entry.items.names : entry.items.counts;
  if (singleLocation) out['location'] = entry.locations[0];
  else if (entry.locations.length > 0) out['locations'] = entry.locations;
  if (entry.world !== false) out['world'] = entry.world;
  if (!entry.fromPool) out['from_pool'] = false;
  if (entry.force !== 'silent') out['force'] = entry.force;
  if (entry.count !== null) out['count'] = entry.count;
  if (entry.percentage !== null) out['percentage'] = entry.percentage;
  for (const [key, value] of Object.entries(entry.extra)) out[key] = value;
  return out;
}

export function newItemPlando(item = '', location = ''): ItemPlando {
  return { items: { type: 'names', names: item === '' ? [] : [item] }, locations: location === '' ? [] : [location], world: false, fromPool: true, force: 'silent', count: null, percentage: null, extra: {}, editable: true, raw: null };
}

export function readConnectionPlando(raw: unknown): PlandoList<ConnectionPlando> {
  if (raw === undefined || raw === null) return { entries: [], problem: null };
  if (!Array.isArray(raw)) return { entries: [], problem: NOT_LIST };
  const entries = raw.map((entry): ConnectionPlando => {
    const blank: ConnectionPlando = { entrance: '', exit: '', direction: 'both', percentage: null, extra: {}, editable: false, raw: entry };
    if (!isRecord(entry)) return blank;
    const direction = entry['direction'] === undefined ? 'both' : entry['direction'];
    const percentage = entry['percentage'];
    const editable =
      typeof entry['entrance'] === 'string' &&
      typeof entry['exit'] === 'string' &&
      (direction === 'both' || direction === 'entrance' || direction === 'exit') &&
      (percentage === undefined || (typeof percentage === 'number' && Number.isInteger(percentage)));
    if (!editable) return blank;
    return {
      entrance: entry['entrance'] as string,
      exit: entry['exit'] as string,
      direction: direction as ConnectionPlando['direction'],
      percentage: typeof percentage === 'number' ? percentage : null,
      extra: extraOf(entry, CONNECTION_KEYS),
      editable: true,
      raw: entry,
    };
  });
  return { entries, problem: null };
}

export function connectionPlandoToPlain(entry: ConnectionPlando): unknown {
  if (!entry.editable) return entry.raw;
  const out: Record<string, unknown> = { entrance: entry.entrance, exit: entry.exit };
  if (entry.direction !== 'both') out['direction'] = entry.direction;
  if (entry.percentage !== null) out['percentage'] = entry.percentage;
  for (const [key, value] of Object.entries(entry.extra)) out[key] = value;
  return out;
}

export function newConnectionPlando(entrance = '', exit = ''): ConnectionPlando {
  return { entrance, exit, direction: 'both', percentage: null, extra: {}, editable: true, raw: null };
}

/** The edit that makes this the option's list. An empty list removes the option. */
export function plandoEdit(game: string, option: string, plain: readonly unknown[]): Edit {
  return plain.length === 0 ? { op: 'reset', game, option } : { op: 'set', game, option, value: [...plain] };
}

/** Text plando (`plando_texts`, A Link to the Past only): replace one of the game's texts. */
export interface TextPlando {
  /** Which text to replace, one of the game's own keys. */
  at: string;
  /** The lines of the new text. One line is written as plain text, more as a list. */
  text: string[];
  /** null = not written, so 100. */
  percentage: number | null;
  extra: Record<string, unknown>;
  editable: boolean;
  raw: unknown;
}

const TEXT_KEYS = new Set(['at', 'text', 'percentage']);

export function readTextPlando(raw: unknown): PlandoList<TextPlando> {
  if (raw === undefined || raw === null) return { entries: [], problem: null };
  if (!Array.isArray(raw)) return { entries: [], problem: NOT_LIST };
  const entries = raw.map((entry): TextPlando => {
    const blank: TextPlando = { at: '', text: [], percentage: null, extra: {}, editable: false, raw: entry };
    if (!isRecord(entry)) return blank;
    const text = entry['text'];
    const lines = text === undefined ? [] : typeof text === 'string' ? [text] : isStrings(text) ? [...text] : null;
    const percentage = entry['percentage'];
    const editable = typeof entry['at'] === 'string' && lines !== null && (percentage === undefined || (typeof percentage === 'number' && Number.isInteger(percentage)));
    if (!editable) return blank;
    return { at: entry['at'] as string, text: lines!, percentage: typeof percentage === 'number' ? percentage : null, extra: extraOf(entry, TEXT_KEYS), editable: true, raw: entry };
  });
  return { entries, problem: null };
}

export function textPlandoToPlain(entry: TextPlando): unknown {
  if (!entry.editable) return entry.raw;
  const out: Record<string, unknown> = { at: entry.at, text: entry.text.length === 1 ? entry.text[0] : entry.text };
  if (entry.percentage !== null) out['percentage'] = entry.percentage;
  for (const [key, value] of Object.entries(entry.extra)) out[key] = value;
  return out;
}

export function newTextPlando(at = ''): TextPlando {
  return { at, text: [''], percentage: null, extra: {}, editable: true, raw: null };
}
