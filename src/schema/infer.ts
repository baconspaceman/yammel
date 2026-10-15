import type { TemplateOption, YamlDocument } from '../model/document';
import { closest } from '../validate/text';
import type { ChoiceEntry, GameSchema, OptionGroup, OptionSchema, SchemaFile } from './types';

/**
 * Builds the option list of a game Yammel has no data for (a custom world that was never scanned, or one that cannot be
 * scanned) from the YAML file itself. An Archipelago template already says everything an editor needs: each option's name,
 * its weighted choices, its range, and the comment that describes it. A file without those hints (plain `goal: ganon`)
 * still opens; every option in it can be changed, it just offers fewer ready-made choices.
 */

const ALL_VISIBILITY: OptionSchema['visibility'] = ['template', 'simple_ui', 'complex_ui', 'spoiler'];

/** Options every Archipelago game has, by name, whose shape is the same in every game. */
const COMMON: Record<string, Pick<OptionSchema, 'kind'> & Partial<Pick<OptionSchema, 'domain'>>> = {
  local_items: { kind: 'set', domain: 'items' },
  non_local_items: { kind: 'set', domain: 'items' },
  start_hints: { kind: 'set', domain: 'items' },
  start_location_hints: { kind: 'set', domain: 'locations' },
  exclude_locations: { kind: 'set', domain: 'locations' },
  priority_locations: { kind: 'set', domain: 'locations' },
  start_inventory: { kind: 'counter', domain: 'items' },
  start_inventory_from_pool: { kind: 'counter', domain: 'items' },
  item_links: { kind: 'list' },
  plando_items: { kind: 'plando_items' },
  plando_connections: { kind: 'other' },
  plando_texts: { kind: 'other' },
};

const RANDOM_WORD = /^random(-low|-high|-middle|-range(-(low|middle|high))?-(-?\d+)-(-?\d+))?$/;
const RANGE_KEY = /^random-range(?:-(?:low|middle|high))?-(-?\d+)-(-?\d+)$/;
const INTEGER = /^-?\d+$/;

function displayName(key: string): string {
  return key
    .split('_')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoolWord(word: string): boolean {
  return /^(true|false)$/i.test(word);
}

/** The key with the highest weight, or the first key when none has any weight. */
function heaviest(entries: [string, unknown][]): string | undefined {
  let best: string | undefined;
  let bestWeight = Number.NEGATIVE_INFINITY;
  for (const [key, weight] of entries) {
    const w = typeof weight === 'number' ? weight : 0;
    if (w > bestWeight) {
      best = key;
      bestWeight = w;
    }
  }
  return best;
}

/** "Minimum value is 0" / "Maximum value is 99" lines from an option's description. */
function limitsFrom(description: string): { min?: number; max?: number } {
  const min = /minimum value is (-?\d+)/i.exec(description);
  const max = /maximum value is (-?\d+)/i.exec(description);
  return { ...(min ? { min: Number(min[1]) } : {}), ...(max ? { max: Number(max[1]) } : {}) };
}

function inferOption(info: TemplateOption): OptionSchema {
  const { key, value, description, notes } = info;
  const base = {
    key,
    displayName: displayName(key),
    description,
    visibility: [...ALL_VISIBILITY],
  };
  const common = COMMON[key];
  if (common !== undefined && (Array.isArray(value) || isRecord(value) || value === undefined || value === null)) {
    return {
      ...base,
      kind: common.kind,
      default: common.kind === 'counter' ? {} : [],
      supportsWeighting: false,
      ...(common.domain === undefined ? {} : { domain: common.domain }),
    };
  }

  if (typeof value === 'boolean') {
    return { ...base, kind: 'toggle', default: value, supportsWeighting: true };
  }

  if (isRecord(value) && Object.keys(value).length > 0) {
    const entries = Object.entries(value);
    const words = entries.map(([word]) => word);
    const ranged = words.find((word) => RANGE_KEY.test(word));
    const numeric = words.filter((word) => INTEGER.test(word));
    const named = words.filter((word) => !INTEGER.test(word) && !RANDOM_WORD.test(word));
    const onlyWeights = entries.every(([, weight]) => typeof weight === 'number');

    if (onlyWeights && (ranged !== undefined || numeric.length > 0)) {
      return rangeOption(base, info, ranged, numeric, named, entries);
    }
    if (onlyWeights && words.length >= 1 && words.every((word) => isBoolWord(word) || RANDOM_WORD.test(word)) && words.some(isBoolWord)) {
      const chosen = heaviest(entries.filter(([word]) => isBoolWord(word)));
      return { ...base, kind: 'toggle', default: chosen === undefined ? false : /^true$/i.test(chosen), supportsWeighting: true };
    }
    if (onlyWeights) {
      const choices: ChoiceEntry[] = words.filter((word) => !/^random$/i.test(word)).map((word) => ({ key: word, label: noteOrLabel(word, notes) }));
      if (choices.length > 0) {
        const chosen = heaviest(entries.filter(([word]) => !/^random$/i.test(word)));
        return { ...base, kind: 'choice', default: chosen ?? choices[0]!.key, supportsWeighting: true, choices };
      }
    }
    return { ...base, kind: 'other', default: value, supportsWeighting: false };
  }

  if (Array.isArray(value)) return { ...base, kind: 'list', default: [], supportsWeighting: false };
  if (isRecord(value)) return { ...base, kind: 'dict', default: {}, supportsWeighting: false };

  if (typeof value === 'number' && Number.isFinite(value)) {
    const limits = limitsFrom(description);
    const min = limits.min ?? Math.min(0, Math.floor(value));
    const max = limits.max ?? Math.max(100, Math.ceil(value));
    return { ...base, kind: 'range', default: value, supportsWeighting: true, min, max };
  }
  if (typeof value === 'string') {
    return { ...base, kind: 'free_text', default: value, supportsWeighting: false };
  }
  return { ...base, kind: 'other', default: value ?? null, supportsWeighting: false };
}

function noteOrLabel(word: string, _notes: Record<string, string>): string {
  return displayName(word);
}

function rangeOption(
  base: Pick<OptionSchema, 'key' | 'displayName' | 'description' | 'visibility'>,
  info: TemplateOption,
  ranged: string | undefined,
  numeric: string[],
  named: string[],
  entries: [string, unknown][],
): OptionSchema {
  const fromKey = ranged === undefined ? undefined : RANGE_KEY.exec(ranged);
  const limits = limitsFrom(info.description);
  const numbers = numeric.map(Number);
  let min = fromKey ? Number(fromKey[1]) : (limits.min ?? Math.min(0, ...numbers));
  let max = fromKey ? Number(fromKey[2]) : (limits.max ?? Math.max(100, ...numbers));
  if (limits.min !== undefined) min = limits.min;
  if (limits.max !== undefined) max = limits.max;
  const specialNames: Record<string, number> = {};
  for (const word of named) {
    const note = info.notes[word] ?? '';
    const found = /(?:equivalent to|equals?|is)\s+(-?\d+)/i.exec(note);
    if (found) specialNames[word] = Number(found[1]);
  }
  const heavy = heaviest(entries.filter(([word]) => !RANDOM_WORD.test(word)));
  let chosen: number = min;
  if (heavy !== undefined) {
    if (INTEGER.test(heavy)) chosen = Number(heavy);
    else if (specialNames[heavy] !== undefined) chosen = specialNames[heavy]!;
  }
  const hasNames = Object.keys(specialNames).length > 0;
  return {
    ...base,
    kind: hasNames ? 'named_range' : 'range',
    default: chosen,
    supportsWeighting: true,
    min,
    max,
    ...(hasNames ? { specialNames } : {}),
  };
}

/** The game's option list as the YAML file itself describes it. `options` come from YamlDocument.templateInfo. */
export function inferGameSchema(name: string, options: readonly TemplateOption[]): GameSchema {
  const byKey: Record<string, OptionSchema> = {};
  const groups: OptionGroup[] = [];
  let current: OptionGroup | undefined;
  for (const info of options) {
    if (Object.prototype.hasOwnProperty.call(byKey, info.key)) continue;
    byKey[info.key] = inferOption(info);
    if (info.heading !== undefined || current === undefined) {
      current = { name: info.heading ?? 'Options', collapsed: false, options: [] };
      groups.push(current);
    }
    current.options.push(info.key);
  }
  return {
    name,
    hidden: false,
    groups,
    options: byKey,
    presets: {},
    items: [],
    locations: [],
    itemGroups: [],
    locationGroups: [],
    inferred: true,
  };
}

/**
 * The schema with every game the open file names but Yammel has no data for added from the file itself. A name that looks like a
 * misspelling of a known game is left out, so the usual "did you mean" message still catches the typo. Each game is read once per
 * `owner` (the opened file) and then kept in `cache`, so its controls keep their shape while the file is edited.
 */
export function withInferredGames(
  schema: SchemaFile,
  doc: YamlDocument,
  cache: WeakMap<object, Map<string, GameSchema>>,
  owner: object,
): SchemaFile {
  const known = Object.values(schema.games).filter((game) => !game.hidden).map((game) => game.name);
  let mine = cache.get(owner);
  let games: Record<string, GameSchema> | null = null;
  for (const name of doc.games()) {
    if (Object.prototype.hasOwnProperty.call(schema.games, name)) continue;
    if (closest(name, known) !== undefined) continue;
    if (mine === undefined) {
      mine = new Map();
      cache.set(owner, mine);
    }
    let inferred = mine.get(name);
    if (inferred === undefined) {
      inferred = inferGameSchema(name, doc.templateInfo(name));
      mine.set(name, inferred);
    }
    games ??= { ...schema.games };
    games[name] = inferred;
  }
  return games === null ? schema : { ...schema, games };
}
