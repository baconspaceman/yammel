import type { YamlDocument } from '../model/document';
import type { Edit } from '../model/edits';
import { resolveChoiceKey } from '../renderer/state/options';
import type { GameSchema, OptionSchema, SchemaFile } from '../schema/types';
import { closest } from './text';
import { validateConnectionPlando, validateItemPlando, validateTextPlando } from './plando';
import { validateTriggers } from './triggers';
import type { Fix, Issue, Severity } from './types';

const TOGGLE_OFF = ['off', '0', 'false', 'none', 'null', 'no', 'disabled'];
const TOGGLE_ON = ['on', '1', 'true', 'yes', 'enabled'];
const NAME_LIMIT = 16;
const MAX_NAMES_LISTED = 6;
const MAX_FIXED_NAMES = 30;
const MAX_LIST_CHECKED = 50;
/** Keys that are valid inside a game's block although they are not options of the game. */
const EXTRA_GAME_KEYS: Record<string, readonly string[]> = { '*': ['triggers'], 'A Link to the Past': ['sprite', 'sprite_pool', 'random_sprite_on_event'] };

const own = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const show = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
};

/** What is wrong with one value, and (when there is a believable answer) what to put instead. */
interface Problem {
  message: string;
  severity?: Severity;
  suggestion?: { label: string; value: unknown };
}

const isRandomWord = (word: string): boolean => /^random(-|$)/.test(word);

/** Checks the random words for a number: random, random-low/middle/high, random-range-A-B, random-range-low-A-B. */
function checkNumericRandom(option: OptionSchema, word: string): Problem | null {
  if (word === 'random' || word === 'random-low' || word === 'random-middle' || word === 'random-high') return null;
  const range = /^random-range-(?:(low|middle|high)-)?(\d+)-(\d+)$/.exec(word);
  if (range === null && /^random-range-(?:(?:low|middle|high)-)?-?\d+-+-?\d+$/.test(word)) {
    return { message: `"${word}" has a minus sign in it. Archipelago cannot read negative numbers in a random range, so it would quietly drop the minus and use different numbers.` };
  }
  if (range === null) {
    return { message: `"${word}" is not a random value Archipelago knows. Use random, random-low, random-middle, random-high or random-range-A-B.` };
  }
  const [a, b] = [Number(range[2]), Number(range[3])].sort((x, y) => x - y) as [number, number];
  if ((option.min !== undefined && a < option.min) || (option.max !== undefined && b > option.max)) {
    const lo = Math.max(a, option.min ?? a);
    const hi = Math.min(b, option.max ?? b);
    const fits = lo <= hi;
    return {
      message: `The range ${a} to ${b} is outside what this option allows (${option.min} to ${option.max}).`,
      suggestion: fits ? { label: `Use random between ${lo} and ${hi}`, value: `random-range-${lo}-${hi}` } : undefined,
    };
  }
  return null;
}

function checkRange(option: OptionSchema, value: unknown): Problem | null {
  const { min, max } = option;
  const bounds = min !== undefined && max !== undefined ? `${min} to ${max}` : '';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return { message: `${value} is not a whole number. This option takes whole numbers${bounds ? ` from ${bounds}` : ''}.`, suggestion: { label: `Use ${Math.round(value)}`, value: Math.round(value) } };
    }
    if (option.kind === 'named_range' && Object.values(option.specialNames ?? {}).includes(value)) return null; // a name's own number is always allowed, even outside the range
    if (min !== undefined && value < min) return { message: `${value} is below the lowest allowed value, ${min}.`, suggestion: { label: `Use ${min}`, value: min } };
    if (max !== undefined && value > max) return { message: `${value} is above the highest allowed value, ${max}.`, suggestion: { label: `Use ${max}`, value: max } };
    return null;
  }
  if (typeof value === 'boolean') {
    if (min === 0 && option.default !== 0) return null; // Archipelago reads true as the default and false as 0 here
    return { message: `${value ? 'true' : 'false'} is not a number. This option takes whole numbers${bounds ? ` from ${bounds}` : ''}.` };
  }
  if (typeof value !== 'string') return { message: `This option takes a whole number, not ${show(value)}.` };
  const word = value.trim().toLowerCase();
  if (isRandomWord(word)) return checkNumericRandom(option, word);
  if (word === 'high' || word === 'low' || word === 'default') return null;
  const special = Object.keys(option.specialNames ?? {}).find((name) => name.toLowerCase() === word);
  if (option.kind === 'named_range' && special !== undefined) return null;
  if ((word === 'true' || word === 'false') && min === 0 && option.default !== 0) return null;
  if (/^[+-]?\d+$/.test(word)) return checkRange(option, Number(word));
  const names = [...Object.keys(option.specialNames ?? {}), 'high', 'low'];
  const near = closest(word, names);
  return {
    message: `"${value}" is not a number${option.kind === 'named_range' ? ' or one of this option\'s names' : ''}.`,
    suggestion: near === undefined ? undefined : { label: `Use ${near}`, value: near },
  };
}

function checkToggle(value: unknown): Problem | null {
  if (typeof value === 'boolean') return null;
  if (typeof value === 'number') return value === 0 || value === 1 ? null : { message: `${value} is not on or off. Archipelago accepts it but it is probably a mistake. Use true or false.`, severity: 'warning', suggestion: { label: 'Turn it on (true)', value: true } };
  if (typeof value !== 'string') return { message: `A switch must be true or false, not ${show(value)}.` };
  if (value === 'random') return null;
  const lower = value.toLowerCase();
  if (lower === 'random') {
    return { message: 'A switch only accepts "random" in lowercase. Archipelago rejects "' + value + '".', suggestion: { label: 'Use random', value: 'random' } };
  }
  if (TOGGLE_OFF.includes(lower) || TOGGLE_ON.includes(lower)) return null;
  const near = closest(lower, [...TOGGLE_ON, ...TOGGLE_OFF]);
  return {
    message: `"${value}" is not on or off, so Archipelago will stop with an error.`,
    suggestion: near === undefined ? undefined : { label: `Use ${TOGGLE_ON.includes(near) ? 'true' : 'false'}`, value: TOGGLE_ON.includes(near) },
  };
}

function checkChoice(option: OptionSchema, value: unknown): Problem | null {
  if (typeof value === 'number') return null; // numbers can name a choice; the schema does not list them
  if (typeof value === 'string' && value.trim().toLowerCase() === 'random') return null;
  if (typeof value === 'string' || typeof value === 'boolean') {
    if (resolveChoiceKey(option, value) !== undefined) return null;
    const keys = option.choices?.map((choice) => choice.key) ?? [];
    const near = typeof value === 'string' ? closest(value, keys) : undefined;
    const list = keys.slice(0, 8).join(', ') + (keys.length > 8 ? ', ...' : '');
    return {
      message: `"${String(value)}" is not one of this option's choices (${list}).`,
      suggestion: near === undefined ? undefined : { label: `Use ${near}`, value: near },
    };
  }
  return { message: `This option takes one of its choices, not ${show(value)}.` };
}

/** Checks one plain value (not a weights map) for an option. */
export function checkValue(option: OptionSchema, value: unknown): Problem | null {
  if (value === null || value === undefined) return null;
  switch (option.kind) {
    case 'toggle':
      return checkToggle(value);
    case 'choice':
      return checkChoice(option, value);
    case 'range':
    case 'named_range':
      return checkRange(option, value);
    default:
      return null;
  }
}

const WEIGHTED_KINDS = ['toggle', 'choice', 'text_choice', 'range', 'named_range', 'free_text'];

/** Sets and lists accept group names; counters and dicts (a start inventory) only the plain names. */
function namePool(game: GameSchema, domain: 'items' | 'locations', groups: boolean): string[] {
  if (domain === 'items') return groups ? [...game.items, ...game.itemGroups] : [...game.items];
  return groups ? [...game.locations, ...game.locationGroups] : [...game.locations];
}

class Collector {
  readonly issues: Issue[] = [];
  private seen = new Map<string, number>();

  add(code: string, severity: Severity, game: string | null, option: string | null, message: string, fixes: Fix[] = [], idKey = ''): void {
    const base = `${code}|${game ?? ''}|${option ?? ''}${idKey === '' ? '' : `|${idKey}`}`;
    const n = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, n);
    this.issues.push({ id: n === 1 ? base : `${base}#${n}`, severity, code, game, option, message, fixes, source: 'rules' });
  }
}

function setFix(label: string, game: string, option: string, value: unknown): Fix {
  return { label, edits: [{ op: 'set', game, option, value }] };
}

function validateNames(out: Collector, game: GameSchema, option: OptionSchema, raw: unknown): void {
  const domain = option.domain;
  if (domain === undefined) return;
  if (game.inferred === true) return; // a game read from the file has no list of names to check against
  const pool = namePool(game, domain, option.kind === 'set' || option.kind === 'list');
  const exact = new Set(pool);
  const folded = new Map(pool.map((name) => [name.toLowerCase(), name]));
  const noun = domain === 'items' ? 'item' : 'location';
  const entries = Array.isArray(raw) ? raw.map(String) : isRecord(raw) ? Object.keys(raw) : null;
  if (entries === null) {
    out.add('WRONG_SHAPE', 'error', game.name, option.key, `This option takes a list of ${noun} names.`);
    return;
  }
  const bad = entries.filter((name) => !exact.has(name));
  if (bad.length === 0) return;
  const manyBad = bad.length > MAX_FIXED_NAMES;
  const caseOnly = bad.every((name) => folded.has(name.toLowerCase()));
  const listed = bad.slice(0, MAX_NAMES_LISTED).map((name) => `"${name}"`).join(', ') + (bad.length > MAX_NAMES_LISTED ? `, and ${bad.length - MAX_NAMES_LISTED} more` : '');
  const replacement = (name: string): string | undefined => folded.get(name.toLowerCase()) ?? closest(name, pool);
  const fixes: Fix[] = [];
  const mapped = new Map(manyBad ? [] : bad.map((name) => [name, replacement(name)]));
  const rebuild = (fn: (name: string) => string | undefined): unknown => {
    if (Array.isArray(raw)) return raw.map(String).flatMap((name) => (exact.has(name) ? [name] : fn(name) === undefined ? [] : [fn(name)!]));
    const next: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      const use = exact.has(name) ? name : fn(name);
      if (use !== undefined) next[use] = value;
    }
    return next;
  };
  if (!manyBad && [...mapped.values()].every((value) => value !== undefined)) {
    fixes.push(setFix(bad.length === 1 ? `Use "${mapped.get(bad[0]!)}"` : 'Use the closest valid names', game.name, option.key, rebuild((name) => mapped.get(name))));
  }
  fixes.push({ ...setFix(bad.length === 1 ? 'Remove it' : 'Remove them', game.name, option.key, rebuild(() => undefined)), destructive: true });
  out.add(
    'UNKNOWN_NAME',
    caseOnly ? 'warning' : 'error',
    game.name,
    option.key,
    `${bad.length === 1 ? 'This is' : 'These are'} not ${noun} names in ${game.name}: ${listed}. Archipelago ${caseOnly ? 'compares capitals exactly here' : 'will stop with an error'}.`,
    fixes,
  );
}

function validateOption(out: Collector, game: GameSchema, option: OptionSchema, raw: unknown): void {
  if (raw === null || raw === undefined) return;
  // The option's own default is always accepted (a few games use a value outside the range, such as -1, to mean "automatic").
  if (JSON.stringify(raw) === JSON.stringify(option.default)) return;
  const where = [game.name, option.key] as const;

  if (option.domain !== undefined && ['set', 'list', 'dict', 'counter'].includes(option.kind)) {
    validateNames(out, game, option, raw);
    return;
  }
  if (option.kind === 'plando_items') {
    validateItemPlando({ add: (...args) => out.add(...args) }, game, option, raw);
    return;
  }
  if (option.kind === 'plando_texts') {
    validateTextPlando({ add: (...args) => out.add(...args) }, game, option, raw);
    return;
  }
  if (option.kind === 'plando_connections') {
    validateConnectionPlando({ add: (...args) => out.add(...args) }, game, option, raw);
    return;
  }
  if (!WEIGHTED_KINDS.includes(option.kind)) return; // other structured options are not checked yet

  if (isRecord(raw)) {
    const entries = Object.entries(raw);
    if (entries.length === 0) {
      out.add('EMPTY_WEIGHTS', 'error', ...where, 'This option has no values to pick from. Give it at least one value with a weight above 0.', [{ label: 'Remove it (use the default)', edits: [{ op: 'reset', game: game.name, option: option.key }] }]);
      return;
    }
    let positive = false;
    for (const [key, weight] of entries) {
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        out.add('BAD_WEIGHT', 'error', ...where, `The weight for "${key}" must be a number that is 0 or more, not ${show(weight)}.`);
      } else if (weight > 0) {
        positive = true;
      }
      const problem = checkValue(option, key);
      if (problem !== null) {
        const fixes: Fix[] = [];
        const target = problem.suggestion !== undefined && typeof problem.suggestion.value !== 'object' ? String(problem.suggestion.value) : null;
        if (problem.suggestion !== undefined && target !== null && !own(raw, target)) {
          const renamed = { ...raw };
          delete renamed[key];
          renamed[target] = raw[key];
          fixes.push({ label: problem.suggestion.label.replace(/^Use /, 'Change this value to '), edits: [{ op: 'set', game: game.name, option: option.key, value: renamed }] });
        }
        const without = { ...raw };
        delete without[key];
        if (Object.values(without).some((w) => typeof w === 'number' && w > 0)) {
          fixes.push({ label: `Remove "${key}"`, edits: [{ op: 'set', game: game.name, option: option.key, value: without }], destructive: true });
        }
        out.add('BAD_WEIGHTED_VALUE', problem.severity ?? 'error', ...where, `In the weighted values: ${problem.message}`, fixes, key);
      }
    }
    if (!positive && entries.every(([, w]) => typeof w === 'number')) {
      out.add('ALL_WEIGHTS_ZERO', 'error', ...where, 'Every weight is 0, so nothing can be picked. At least one weight must be above 0.');
    }
    return;
  }
  if (Array.isArray(raw)) {
    // Archipelago picks one entry of a list at random, so each entry must be a good value.
    if (raw.length === 0) {
      out.add('EMPTY_LIST', 'error', ...where, 'This list is empty, so there is nothing to pick from.', [{ label: 'Remove it (use the default)', edits: [{ op: 'reset', game: game.name, option: option.key }] }]);
      return;
    }
    for (const entry of raw.slice(0, MAX_LIST_CHECKED)) {
      const problem = typeof entry === 'object' && entry !== null ? { message: 'Each entry in the list must be a single value.' } : checkValue(option, entry);
      if (problem !== null) {
        out.add('BAD_LIST_VALUE', problem.severity ?? 'error', ...where, `In the list of values: ${problem.message}`, [], String(entry));
      }
    }
    return;
  }
  const problem = checkValue(option, raw);
  if (problem !== null) {
    const fixes: Fix[] = [];
    if (problem.suggestion !== undefined) fixes.push(setFix(problem.suggestion.label, game.name, option.key, problem.suggestion.value));
    fixes.push({ label: 'Go back to the default', edits: [{ op: 'reset', game: game.name, option: option.key }] });
    out.add('BAD_VALUE', problem.severity ?? 'error', ...where, problem.message, fixes);
  }
}

function placeholdersResolved(name: string): string {
  return name.replace(/\{number\}/g, '1').replace(/\{NUMBER\}/g, '').replace(/\{player\}/g, '1').replace(/\{PLAYER\}/g, '');
}

function validateName(out: Collector, doc: YamlDocument): void {
  const raw = doc.toObject()['name'];
  // A missing name is fine: Archipelago uses the file's name instead.
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return;
  const text = String(raw);
  const resolved = placeholdersResolved(text).trim().slice(0, NAME_LIMIT).trim();
  if (resolved === 'Archipelago') {
    out.add('NAME_RESERVED', 'error', null, null, 'Archipelago does not allow a player to be named "Archipelago".', [{ label: 'Call the player "Player"', edits: [{ op: 'setMeta', key: 'name', value: 'Player' }] }]);
    return;
  }
  if (placeholdersResolved(text).trim().length > NAME_LIMIT) {
    const short = placeholdersResolved(text).trim().slice(0, NAME_LIMIT).trim();
    out.add('NAME_TOO_LONG', 'warning', null, null, `Names are cut to ${NAME_LIMIT} characters, so "${text}" will show up as "${short}".`, [{ label: `Use "${short}"`, edits: [{ op: 'setMeta', key: 'name', value: short }] }]);
  }
}

function validateGameLine(out: Collector, doc: YamlDocument, schema: SchemaFile): string[] {
  const raw = doc.toObject()['game'];
  const names = doc.games();
  if (names.length === 0) {
    out.add('NO_GAME', 'error', null, null, 'This YAML does not say which game it is for. It needs a "game:" line.');
    return [];
  }
  if (isRecord(raw)) {
    const entries = Object.entries(raw);
    const bad = entries.filter(([, weight]) => typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0);
    if (bad.length > 0) {
      out.add('BAD_GAME_WEIGHT', 'error', null, null, `Each game's weight must be a number that is 0 or more. Check: ${bad.map(([name]) => name).join(', ')}.`);
    } else if (!entries.some(([, weight]) => (weight as number) > 0)) {
      const first = entries[0]![0];
      out.add('GAME_WEIGHTS_ZERO', 'error', null, null, 'Every game has a weight of 0, so none can be picked. At least one weight must be above 0.', [{ label: `Give ${first} a weight of 50`, edits: [{ op: 'setGameWeights', weights: Object.fromEntries(entries.map(([name], i) => [name, i === 0 ? 50 : 0])) }] }]);
    }
  }
  const known: string[] = [];
  for (const name of names) {
    if (own(schema.games, name)) {
      known.push(name);
      continue;
    }
    const near = closest(name, Object.values(schema.games).filter((g) => !g.hidden).map((g) => g.name));
    out.add('UNKNOWN_GAME', 'error', name, null, `"${name}" is not a game this version of Archipelago has${near === undefined ? '' : `. Did you mean "${near}"?`}`, [
      ...(names.length > 1
        ? [
            {
              label: `Remove ${name} from the game list`,
              destructive: true,
              edits: [{ op: 'setGameWeights', weights: remainingWeights(names.filter((n) => n !== name), raw) } as Edit, { op: 'removeGame', game: name } as Edit],
            },
          ]
        : []),
    ]);
  }
  return known;
}

/** The weights the other games keep when one is removed; if none would be left above 0, they all get 1. */
function remainingWeights(names: string[], raw: unknown): Record<string, number> {
  const weights = Object.fromEntries(names.map((n) => [n, isRecord(raw) && typeof raw[n] === 'number' && Number.isFinite(raw[n]) && (raw[n] as number) >= 0 ? (raw[n] as number) : 1]));
  return Object.values(weights).some((w) => w > 0) ? weights : Object.fromEntries(names.map((n) => [n, 1]));
}

function compareVersions(a: string, b: string): number {
  const x = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const y = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Reads a YAML the way Archipelago will and lists what would go wrong, each with one-click fixes where there
 * is a believable answer. Needs nothing but the option data that ships with the app.
 */
export function validateDocument(doc: YamlDocument, schema: SchemaFile): Issue[] {
  try {
    return validateUnchecked(doc, schema);
  } catch {
    return []; // a file too odd to read (an alias bomb, a circular anchor) is left to Archipelago, never a crash here
  }
}

function validateUnchecked(doc: YamlDocument, schema: SchemaFile): Issue[] {
  const out = new Collector();
  if (!doc.isValid) return [];
  const object = doc.toObject();
  validateName(out, doc);
  const known = validateGameLine(out, doc, schema);

  const requires = object['requires'];
  if (isRecord(requires) && typeof requires['version'] === 'string' && compareVersions(requires['version'], schema.apVersion) > 0) {
    out.add('NEEDS_NEWER_VERSION', 'warning', null, null, `This YAML says it needs Archipelago ${requires['version']} or newer, and the option data here is for ${schema.apVersion}. Options may be missing or different.`);
  }

  for (const name of known) {
    const game = schema.games[name]!;
    const block = own(object, name) ? object[name] : undefined;
    if (block === undefined) {
      // A game that can be picked needs its own block, even an empty one, or Archipelago stops with "No game options".
      const raw = object['game'];
      const picked = !isRecord(raw) || (typeof raw[name] === 'number' ? (raw[name] as number) > 0 : true);
      if (picked) {
        const all = doc.games();
        out.add('MISSING_BLOCK', 'error', name, null, `"${name}" is in the game list but has no "${name}:" section, so Archipelago would stop when it picks it.`, [
          { label: `Add an empty "${name}:" section`, edits: [{ op: 'setGameWeights', weights: remainingWeights(all, raw) }] },
        ]);
      }
      continue;
    }
    if (block === null) continue;
    if (!isRecord(block)) {
      out.add('BLOCK_NOT_MAP', 'error', name, null, `"${name}:" must be followed by a list of options, not a single value.`);
      continue;
    }
    const lowerKeys = new Map(Object.keys(game.options).map((key) => [key.toLowerCase(), key]));
    for (const [key, value] of Object.entries(block)) {
      if (key === 'triggers') {
        validateTriggers({ add: (...args) => out.add(...args), checkValue }, { schema, object, list: value, host: name });
        continue;
      }
      if ((EXTRA_GAME_KEYS['*']!.includes(key)) || (EXTRA_GAME_KEYS[name]?.includes(key) ?? false)) continue;
      const option = own(game.options, key) ? game.options[key] : undefined;
      if (option === undefined) {
        const near = lowerKeys.get(key.toLowerCase()) ?? closest(key, Object.keys(game.options));
        const fixes: Fix[] = [];
        if (near !== undefined && own(game.options, near) && !own(block, near) && checkValue(game.options[near]!, value) === null) fixes.push({ label: `Rename it to ${near}`, edits: [{ op: 'reset', game: name, option: key }, { op: 'set', game: name, option: near, value }] });
        fixes.push({ label: 'Remove it', edits: [{ op: 'reset', game: name, option: key }], destructive: true });
        out.add('UNKNOWN_OPTION', 'warning', name, key, `"${key}" is not an option of ${name}, so Archipelago will ignore it${near === undefined ? '' : `. Did you mean "${near}"?`}`, fixes);
        continue;
      }
      validateOption(out, game, option, value);
    }
  }
  if (own(object, 'triggers') && object['triggers'] !== null) validateTriggers({ add: (...args) => out.add(...args), checkValue }, { schema, object, list: object['triggers'], host: null });
  return out.issues;
}
