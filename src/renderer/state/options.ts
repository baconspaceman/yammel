import type { Edit } from '../../model/edits';
import type { GameSchema, OptionSchema, SchemaFile } from '../../schema/types';

/** How one option looks right now, and whether Simple mode can edit it. */
export interface OptionState {
  /** The key exists in the file. */
  present: boolean;
  /** Value to show in a control (a choice shows its canonical key). Meaningful when editable. */
  value: unknown;
  /** A Simple-mode control can represent and change this value. */
  editable: boolean;
  /** Plain-language reason a control cannot show the value. */
  note?: string;
  /** A value the control can show but Archipelago would probably reject. */
  warning?: string;
  /** Present in the file and different from the game's default. */
  changed: boolean;
}

const WEIGHT_NOTE = 'This option uses weighted values, which are edited below. If they cannot be shown there, use the Raw tab.';
const ADVANCED_NOTE = 'This kind of option is edited in the Raw tab.';
const TRUE_WORDS = ['true', 'on', 'yes'];
const FALSE_WORDS = ['false', 'off', 'no'];

/** Random values ("random", "random-low", ...) are shown as a sentence; what counts depends on the kind. */
function isRandom(option: OptionSchema, raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  if (option.kind === 'free_text') return false;
  // A real choice can start with "random" (for example "random_balanced"); that is a choice, not randomness.
  if (resolveChoiceKey(option, raw) !== undefined) return false;
  const word = raw.trim();
  if (option.kind === 'text_choice') return /^random$/i.test(word);
  return /^random/i.test(word);
}

/** The special name whose number is `n`, for a named range. */
function specialNameFor(option: OptionSchema, n: unknown): string | undefined {
  if (option.kind !== 'named_range' || typeof n !== 'number') return undefined;
  return Object.entries(option.specialNames ?? {}).find(([, number]) => number === n)?.[0];
}

function isPlainObject(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function defaultValue(option: OptionSchema): unknown {
  if (option.kind === 'free_text' || option.kind === 'text_choice') return option.default ?? '';
  return specialNameFor(option, option.default) ?? option.default;
}

export function resolveChoiceKey(option: OptionSchema, raw: unknown): string | undefined {
  const keys = option.choices?.map((c) => c.key) ?? [];
  const find = (word: string) => keys.find((k) => k.toLowerCase() === word.toLowerCase());
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    const alias = Object.entries(option.aliases ?? {}).find(([a]) => a.toLowerCase() === lower)?.[1];
    return find(alias ?? lower);
  }
  if (typeof raw === 'number') {
    // Archipelago accepts the number a choice has inside the game's code (Stardew's preset says goal: 1).
    return option.choices?.find((choice) => choice.value === raw)?.key;
  }
  if (typeof raw === 'boolean') {
    for (const word of raw ? TRUE_WORDS : FALSE_WORDS) {
      const hit = find(word);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

function unsupported(raw: unknown, note: string): OptionState {
  return { present: raw !== undefined, value: raw, editable: false, note, changed: raw !== undefined };
}

function finish(option: OptionSchema, raw: unknown, value: unknown, warning?: string): OptionState {
  const present = raw !== undefined;
  const state: OptionState = {
    present,
    value,
    editable: true,
    changed: present && !same(value, defaultValue(option)),
  };
  if (warning !== undefined) state.warning = warning;
  return state;
}

export function describeOption(option: OptionSchema, raw: unknown): OptionState {
  const kind = option.kind;
  if (raw === undefined) return finish(option, raw, defaultValue(option));

  const simple = ['toggle', 'choice', 'text_choice', 'range', 'named_range', 'free_text'].includes(kind);
  if (!simple) return unsupported(raw, ADVANCED_NOTE);
  if (isPlainObject(raw)) return unsupported(raw, WEIGHT_NOTE);
  if (isRandom(option, raw)) {
    return unsupported(raw, `This option is set to "${String(raw)}". Edit that form in the Raw tab.`);
  }

  switch (kind) {
    case 'toggle':
      return typeof raw === 'boolean'
        ? finish(option, raw, raw)
        : unsupported(raw, `Simple mode cannot show the value "${summarizeValue(raw)}" for a switch.`);
    case 'choice': {
      const key = resolveChoiceKey(option, raw);
      return key !== undefined
        ? finish(option, raw, key)
        : unsupported(raw, `"${summarizeValue(raw)}" is not one of this option's choices.`);
    }
    case 'text_choice': {
      if (typeof raw === 'string' || typeof raw === 'number') {
        const key = resolveChoiceKey(option, raw);
        return finish(option, raw, key ?? String(raw));
      }
      return unsupported(raw, `Simple mode cannot show the value "${summarizeValue(raw)}".`);
    }
    case 'range':
    case 'named_range': {
      if (typeof raw === 'number' && Number.isInteger(raw)) {
        const special = specialNameFor(option, raw);
        if (special !== undefined) return finish(option, raw, special);
        const outside = raw !== option.default && ((option.min !== undefined && raw < option.min) || (option.max !== undefined && raw > option.max));
        return finish(
          option,
          raw,
          raw,
          outside ? `This value is outside the allowed range: it must be between ${option.min} and ${option.max}.` : undefined,
        );
      }
      if (kind === 'named_range' && typeof raw === 'string') {
        const name = Object.keys(option.specialNames ?? {}).find((n) => n.toLowerCase() === raw.trim().toLowerCase());
        if (name !== undefined) return finish(option, raw, name);
      }
      return unsupported(raw, `Simple mode cannot show the value "${summarizeValue(raw)}" here.`);
    }
    default:
      // free_text
      return typeof raw === 'string' || typeof raw === 'number'
        ? finish(option, raw, String(raw))
        : unsupported(raw, `Simple mode cannot show the value "${summarizeValue(raw)}".`);
  }
}

/** The game's default as a short phrase for the card footer, or null when there is nothing useful to say. */
export function formatDefault(option: OptionSchema): string | null {
  const value = defaultValue(option);
  switch (option.kind) {
    case 'toggle':
      return value ? 'On' : 'Off';
    case 'choice':
      return option.choices?.find((c) => c.key === value)?.label ?? String(value);
    case 'range':
      return String(value);
    case 'named_range': {
      const special = specialNameFor(option, option.default);
      return special !== undefined ? `${special} (${String(option.default)})` : String(value);
    }
    case 'free_text':
    case 'text_choice':
      return value === '' ? null : String(value);
    default:
      return null;
  }
}

export function setOption(game: string, option: OptionSchema, value: unknown): Edit {
  return { op: 'set', game, option: option.key, value };
}

export function resetOption(game: string, option: OptionSchema): Edit {
  return { op: 'reset', game, option: option.key };
}

export type NumberParse = { ok: true; value: number } | { ok: false; message: string };

export function parseWholeNumber(text: string, min: number, max: number): NumberParse {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, message: 'Enter a whole number.' };
  const value = Number(trimmed);
  if (value < min || value > max) return { ok: false, message: `Must be between ${min} and ${max}.` };
  return { ok: true, value };
}

/** A short single-line description of any value, for read-only display. */
export function summarizeValue(raw: unknown, limit = 120): string {
  const text = typeof raw === 'string' ? raw : (JSON.stringify(raw) ?? String(raw));
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export interface OptionGroupView {
  name: string;
  collapsed: boolean;
  options: OptionSchema[];
}

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Simple mode's groups, narrowed by a search query. Empty groups are dropped. */
export function simpleGroups(game: GameSchema, query: string): OptionGroupView[] {
  const wanted = terms(query);
  const views: OptionGroupView[] = [];
  for (const group of game.groups) {
    const options = group.options
      .map((key) => game.options[key])
      .filter((o): o is OptionSchema => o !== undefined && o.visibility.includes('simple_ui'))
      .filter((o) => {
        const haystack = `${o.displayName} ${o.key} ${o.description}`.toLowerCase();
        return wanted.every((term) => haystack.includes(term));
      });
    if (options.length > 0) views.push({ name: group.name, collapsed: group.collapsed, options });
  }
  return views;
}

export function searchGames(schema: SchemaFile, query: string): GameSchema[] {
  const wanted = terms(query);
  return Object.values(schema.games)
    .filter((g) => !g.hidden)
    .filter((g) => wanted.every((term) => g.name.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
