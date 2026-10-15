import type { GameSchema, OptionSchema } from '../schema/types';
import { closest } from './text';
import type { Fix, Severity } from './types';

/**
 * Checks for item plando (`plando_items`) and connection plando (`plando_connections`). Every rule here was confirmed by
 * running Archipelago's own generator on a small YAML (see docs/reference/validator-rules.md), so a message says what really happens.
 *
 * Not checked: whether a location can really hold the item, whether the entrance and exit may be joined (that is up to
 * each game), and the plando of other kinds (texts, bosses and the like).
 */

export interface PlandoContext {
  add(code: string, severity: Severity, game: string | null, option: string | null, message: string, fixes?: Fix[], idKey?: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const quote = (value: unknown): string => (typeof value === 'string' ? `"${value}"` : JSON.stringify(value) ?? String(value));

/** Location words Archipelago understands in every game besides the game's own names and groups. */
export const SPECIAL_LOCATIONS = ['Everywhere', 'early_locations', 'non_early_locations'];

function stringsOf(value: unknown): string[] | null {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value as string[];
  return null;
}

export function validateItemPlando(ctx: PlandoContext, game: GameSchema, option: OptionSchema, list: unknown): void {
  const add = (code: string, severity: Severity, message: string, fixes: Fix[] = [], idKey = '') => ctx.add(code, severity, game.name, option.key, message, fixes, idKey);
  if (!Array.isArray(list)) {
    add('PLANDO_NOT_LIST', 'error', 'Item plando must be a list, one entry for each placement. Archipelago would stop with an error.');
    return;
  }
  const itemNames = new Set([...game.items, ...game.itemGroups]);
  const locationNames = new Set([...game.locations, ...game.locationGroups, ...SPECIAL_LOCATIONS]);
  const rewrite = (change: (copy: unknown[]) => void): Fix['edits'] => {
    const copy = clone(list);
    change(copy);
    return copy.length === 0 ? [{ op: 'reset', game: game.name, option: option.key }] : [{ op: 'set', game: game.name, option: option.key, value: copy }];
  };

  list.forEach((entry, index) => {
    const n = index + 1;
    const id = `${n}`;
    if (!isRecord(entry)) {
      add('PLANDO_ENTRY_NOT_MAP', 'error', `Placement ${n} must be a block with item and location. Archipelago would stop with an error.`, [{ label: `Remove placement ${n}`, edits: rewrite((copy) => void copy.splice(index, 1)), destructive: true }], id);
      return;
    }
    const target = (copy: unknown[]) => copy[index] as Record<string, unknown>;

    // Which items.
    const many = entry['items'];
    const one = entry['item'];
    let itemList: string[] = [];
    let itemKind: 'list' | 'map' | 'one' | 'none' = 'none';
    if (Array.isArray(many) ? many.length > 0 : isRecord(many) ? Object.keys(many).length > 0 : typeof many === 'string' && many !== '') {
      if (typeof many === 'string') {
        itemList = [many];
        itemKind = 'one';
      } else if (Array.isArray(many)) {
        itemList = many.map(String);
        itemKind = 'list';
      } else {
        itemList = Object.keys(many as Record<string, unknown>);
        itemKind = 'map';
      }
    } else if (typeof one === 'string' && one !== '') {
      itemList = [one];
      itemKind = 'one';
    } else if (many !== undefined && !Array.isArray(many) && !isRecord(many) && typeof many !== 'string') {
      add('PLANDO_ITEMS_SHAPE', 'error', `The items of placement ${n} must be one name, a list of names, or a map of names with how many. Archipelago would stop with an error.`, [], id);
      return;
    }
    if (itemKind === 'none') {
      add('PLANDO_NO_ITEM', 'error', `Placement ${n} does not say which item to place. Give it an item. Archipelago would stop with an error.`, [], id);
    }

    const force = own(entry, 'force') ? entry['force'] : 'silent';
    if (own(entry, 'force') && force !== true && force !== false && force !== 'silent') {
      add('PLANDO_FORCE', 'error', `The force setting of placement ${n} is ${quote(force)}. It must be true, false or silent. Archipelago would stop with an error.`, [{ label: 'Use silent', edits: rewrite((copy) => void (target(copy)['force'] = 'silent')) }], id);
    }
    if (own(entry, 'from_pool') && typeof entry['from_pool'] !== 'boolean') {
      add('PLANDO_FROM_POOL', 'error', `The from_pool setting of placement ${n} is ${quote(entry['from_pool'])}. It must be true or false. Archipelago would stop with an error.`, [{ label: 'Use true', edits: rewrite((copy) => void (target(copy)['from_pool'] = true)) }], id);
    }
    if (own(entry, 'percentage')) {
      const p = entry['percentage'];
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 100) {
        const fixed = typeof p === 'number' ? Math.max(0, Math.min(100, Math.round(p))) : 100;
        add('PLANDO_PERCENT', 'error', `The percentage of placement ${n} is ${quote(p)}. It must be a whole number from 0 to 100. Archipelago would stop with an error.`, [{ label: `Use ${fixed}`, edits: rewrite((copy) => void (target(copy)['percentage'] = fixed)) }], id);
      }
    }

    // Item names are always the player's own game's items, whichever world they land in.
    for (const name of itemList) {
      if (game.inferred === true || itemNames.has(name)) continue;
      const near = closest(name, [...itemNames]);
      const fixes: Fix[] =
        near === undefined
          ? []
          : [
              {
                label: `Use "${near}"`,
                edits: rewrite((copy) => {
                  const t = target(copy);
                  if (itemKind === 'one') t[own(t, 'items') ? 'items' : 'item'] = near;
                  else if (itemKind === 'list') t['items'] = (t['items'] as unknown[]).map((entryName) => (entryName === name ? near : entryName));
                  else {
                    const renamed: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(t['items'] as Record<string, unknown>)) renamed[key === name ? near : key] = value;
                    t['items'] = renamed;
                  }
                }),
              },
            ];
      add('PLANDO_UNKNOWN_ITEM', 'error', `"${name}" is not an item or item group of ${game.name}${near === undefined ? '' : `. Did you mean "${near}"?`} Archipelago would stop with an error.`, fixes, `${id}|${name}`);
    }

    // Where. Names are looked for in the world the item goes to; only an item that stays in your own world can be checked here.
    const own_world = !own(entry, 'world') || entry['world'] === false;
    const locs = own(entry, 'locations') ? stringsOf(entry['locations']) : own(entry, 'location') ? stringsOf(entry['location']) : [];
    const locKey = own(entry, 'locations') ? 'locations' : 'location';
    if (locs === null) {
      add('PLANDO_LOCATION_SHAPE', 'error', `The ${locKey} of placement ${n} must be one name or a list of names. Archipelago would stop with an error.`, [], id);
    } else if (own_world) {
      for (const name of locs) {
        if (game.inferred === true || locationNames.has(name)) continue;
        const near = closest(name, [...locationNames]);
        const severity: Severity = force === true ? 'error' : 'warning';
        add(
          'PLANDO_UNKNOWN_LOCATION',
          severity,
          `"${name}" is not a location or location group of ${game.name}${near === undefined ? '' : `. Did you mean "${near}"?`} ${force === true ? 'Because force is true, Archipelago would stop with an error.' : 'Archipelago would quietly place nothing there.'}`,
          near === undefined
            ? []
            : [
                {
                  label: `Use "${near}"`,
                  edits: rewrite((copy) => {
                    const t = target(copy);
                    const current = t[locKey];
                    t[locKey] = Array.isArray(current) ? current.map((entryName) => (entryName === name ? near : entryName)) : near;
                  }),
                },
              ],
          `${id}|${name}`,
        );
      }
    }

    // How many: a range must not be upside down (Archipelago stops on it).
    if (isRecord(entry['count']) && typeof entry['count']['min'] === 'number' && typeof entry['count']['max'] === 'number' && entry['count']['min'] > entry['count']['max']) {
      const range = entry['count'] as { min: number; max: number };
      add(
        'PLANDO_COUNT_RANGE',
        'error',
        `Placement ${n} asks for at least ${range.min} but at most ${range.max}. The fewest cannot be more than the most. Archipelago would stop with an error.`,
        [{ label: `Swap them (${range.max} to ${range.min})`, edits: rewrite((copy) => void (target(copy)['count'] = { min: range.max, max: range.min })) }],
        id,
      );
    }

    // How many.
    const count = entry['count'];
    if (typeof count === 'number' && Number.isInteger(count) && itemList.length > 0 && itemKind !== 'one') {
      const available = itemKind === 'list' ? itemList.length : Object.values(entry['items'] as Record<string, unknown>).reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
      if (itemKind === 'list' && count > available) {
        add(
          'PLANDO_COUNT',
          force === true ? 'error' : 'warning',
          `Placement ${n} asks for ${count} items but names only ${available}. ${force === true ? 'Because force is true, Archipelago would stop with an error.' : 'Archipelago would place fewer.'}`,
          [{ label: `Use ${available}`, edits: rewrite((copy) => void (target(copy)['count'] = available)) }],
          id,
        );
      }
    }
  });
}

export function validateConnectionPlando(ctx: PlandoContext, game: GameSchema, option: OptionSchema, list: unknown): void {
  const add = (code: string, severity: Severity, message: string, fixes: Fix[] = [], idKey = '') => ctx.add(code, severity, game.name, option.key, message, fixes, idKey);
  if (!Array.isArray(list)) {
    add('PLANDO_NOT_LIST', 'error', 'Connection plando must be a list, one entry for each connection. Archipelago would stop with an error.');
    return;
  }
  const entrances = option.entrances === undefined ? null : new Set(option.entrances);
  const exits = option.exits === undefined ? null : new Set(option.exits);
  const rewrite = (change: (copy: unknown[]) => void): Fix['edits'] => {
    const copy = clone(list);
    change(copy);
    return copy.length === 0 ? [{ op: 'reset', game: game.name, option: option.key }] : [{ op: 'set', game: game.name, option: option.key, value: copy }];
  };
  const usedEntrances = new Set<string>();
  const usedExits = new Set<string>();

  list.forEach((entry, index) => {
    const n = index + 1;
    const id = `${n}`;
    if (!isRecord(entry)) {
      add('PLANDO_ENTRY_NOT_MAP', 'error', `Connection ${n} must be a block with an entrance and an exit. Archipelago would stop with an error.`, [{ label: `Remove connection ${n}`, edits: rewrite((copy) => void copy.splice(index, 1)), destructive: true }], id);
      return;
    }
    const target = (copy: unknown[]) => copy[index] as Record<string, unknown>;
    for (const key of ['entrance', 'exit'] as const) {
      const value = entry[key];
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (empty) add('PLANDO_CONNECTION_MISSING', 'error', `Connection ${n} has no ${key}. Archipelago would stop with an error.`, [], `${id}|${key}`);
    }
    if (own(entry, 'direction') && !['entrance', 'exit', 'both'].includes(entry['direction'] as string)) {
      add('PLANDO_DIRECTION', 'error', `The direction of connection ${n} is ${quote(entry['direction'])}. It must be both, entrance or exit. Archipelago would stop with an error.`, [{ label: 'Use both', edits: rewrite((copy) => void (target(copy)['direction'] = 'both')) }], id);
    }
    if (own(entry, 'percentage')) {
      const p = entry['percentage'];
      if (typeof p !== 'number' || !Number.isFinite(p)) {
        add('PLANDO_PERCENT', 'error', `The percentage of connection ${n} is ${quote(p)}. It must be a number from 0 to 100. Archipelago would stop with an error.`, [{ label: 'Use 100', edits: rewrite((copy) => void (target(copy)['percentage'] = 100)) }], id);
      }
    }
    const sides: [string, Set<string> | null, Set<string>][] = [
      ['entrance', entrances, usedEntrances],
      ['exit', exits, usedExits],
    ];
    for (const [key, names, used] of sides) {
      const value = entry[key];
      if (typeof value !== 'string' || value === '') continue; // a list means "pick one at random"; the names inside are not checked here
      if (used.has(value) && !(key === 'exit' && option.duplicateExits === true)) {
        add('PLANDO_DUPLICATE', 'error', `The ${key} "${value}" is used by more than one connection. Archipelago allows each ${key} only once here, and would stop with an error.`, [], `${id}|${key}`);
      }
      used.add(value);
      if (names !== null && !names.has(value.toLowerCase())) {
        const near = closest(value.toLowerCase(), [...names]);
        add(
          'PLANDO_UNKNOWN_CONNECTION',
          'error',
          `"${value}" is not an ${key} of ${game.name}${near === undefined ? '' : `. Did you mean "${near}"?`} Archipelago would stop with an error.`,
          near === undefined ? [] : [{ label: `Use "${near}"`, edits: rewrite((copy) => void (target(copy)[key] = near)) }],
          `${id}|${key}`,
        );
      }
    }
  });
}

export function validateTextPlando(ctx: PlandoContext, game: GameSchema, option: OptionSchema, list: unknown): void {
  const add = (code: string, severity: Severity, message: string, fixes: Fix[] = [], idKey = '') => ctx.add(code, severity, game.name, option.key, message, fixes, idKey);
  if (!Array.isArray(list)) {
    add('PLANDO_NOT_LIST', 'error', 'Text plando must be a list, one entry for each text. Archipelago would stop with an error.');
    return;
  }
  const places = option.validKeys === undefined ? null : new Set(option.validKeys);
  const rewrite = (change: (copy: unknown[]) => void): Fix['edits'] => {
    const copy = clone(list);
    change(copy);
    return copy.length === 0 ? [{ op: 'reset', game: game.name, option: option.key }] : [{ op: 'set', game: game.name, option: option.key, value: copy }];
  };

  list.forEach((entry, index) => {
    const n = index + 1;
    const id = `${n}`;
    if (!isRecord(entry)) {
      add('PLANDO_ENTRY_NOT_MAP', 'error', `Text ${n} must be a block with "at" and "text". Archipelago would stop with an error.`, [{ label: `Remove text ${n}`, edits: rewrite((copy) => void copy.splice(index, 1)), destructive: true }], id);
      return;
    }
    const target = (copy: unknown[]) => copy[index] as Record<string, unknown>;
    const at = entry['at'];
    if (at === undefined || at === null || at === '') {
      add('PLANDO_TEXT_NO_PLACE', 'error', `Text ${n} does not say which text to replace ("at"). Archipelago would stop with an error.`, [], id);
    } else if (typeof at === 'string' && places !== null && !places.has(at)) {
      const near = closest(at, [...places]);
      add(
        'PLANDO_TEXT_UNKNOWN_PLACE',
        'error',
        `"${at}" is not a text of ${game.name} that can be replaced${near === undefined ? '' : `. Did you mean "${near}"?`} Names are matched exactly, capitals included. Archipelago would stop when it writes the game.`,
        near === undefined ? [] : [{ label: `Use "${near}"`, edits: rewrite((copy) => void (target(copy)['at'] = near)) }],
        id,
      );
    }
    const text = entry['text'];
    if (text !== undefined && typeof text !== 'string' && !(Array.isArray(text) && text.every((line) => typeof line === 'string')) && !isRecord(text)) {
      add('PLANDO_TEXT_SHAPE', 'error', `The text of text ${n} must be words, or a list of lines. Archipelago would stop with an error.`, [], id);
    } else if (text === undefined || text === '' || (Array.isArray(text) && text.length === 0)) {
      add('PLANDO_TEXT_EMPTY', 'warning', `Text ${n} has no words in it, so it would replace the game's text with nothing.`, [], id);
    }
    if (own(entry, 'percentage')) {
      const p = entry['percentage'];
      if (typeof p !== 'number' || !Number.isFinite(p)) {
        add('PLANDO_PERCENT', 'error', `The percentage of text ${n} is ${quote(p)}. It must be a number from 0 to 100. Archipelago would stop with an error.`, [{ label: 'Use 100', edits: rewrite((copy) => void (target(copy)['percentage'] = 100)) }], id);
      }
    }
  });
}
