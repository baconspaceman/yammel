import type { GameSchema, OptionSchema, SchemaFile } from '../schema/types';
import { splitChangeKey } from '../model/triggers';
import { closest } from './text';
import type { Fix, Severity } from './types';

/**
 * Checks for `triggers`. Every rule here was confirmed by running Archipelago's own generator (Generate.py
 * roll_triggers and update_weights) on a small YAML, so each message says what really happens.
 *
 * Not checked: whether a "-" change removes something that is really in the list, names inside item and location
 * lists, and what several triggers do to each other beyond the chaining below.
 */

export interface TriggerProblem {
  message: string;
  severity?: Severity;
  suggestion?: { label: string; value: unknown };
}

export interface TriggerContext {
  add(code: string, severity: Severity, game: string | null, option: string | null, message: string, fixes?: Fix[], idKey?: string): void;
  checkValue(option: OptionSchema, value: unknown): TriggerProblem | null;
}

export interface TriggerInput {
  schema: SchemaFile;
  /** The whole file as plain data. */
  object: Record<string, unknown>;
  /** The value of the `triggers:` key. */
  list: unknown;
  /** The game block the key was found in, or null for the top of the file. Fixes are only offered for a game block. */
  host: string | null;
}

const own = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isRandomWord = (value: unknown): boolean => typeof value === 'string' && /^random(-|$)/.test(value.trim().toLowerCase());
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const quote = (value: unknown): string => (typeof value === 'string' ? `"${value}"` : JSON.stringify(value) ?? String(value));

/** The merge kinds: "+" and "-" only work on these. */
const MERGEABLE = ['set', 'list', 'dict', 'counter'];

/** The values a watched option can end up with, from what is written and what any trigger sets. `null` when that cannot be known. */
function possibleValues(written: unknown, setBy: unknown[]): unknown[] | null {
  const out: unknown[] = [];
  const take = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.every(take);
    if (isRecord(value)) {
      for (const [key, weight] of Object.entries(value)) {
        if (typeof weight === 'number' && weight <= 0) continue;
        if (isRandomWord(key)) return false;
        out.push(key);
      }
      return true;
    }
    if (isRandomWord(value)) return false;
    out.push(value);
    return true;
  };
  if (!take(written)) return null;
  for (const value of setBy) if (!take(value)) return null;
  return out;
}

export function validateTriggers(ctx: TriggerContext, input: TriggerInput): void {
  const { schema, object, list, host } = input;
  const where = host ?? null;
  const add = (code: string, severity: Severity, option: string | null, message: string, fixes: Fix[] = [], idKey = '') => ctx.add(code, severity, where, option, message, fixes, idKey);

  if (!Array.isArray(list)) {
    add('TRIGGERS_NOT_LIST', 'error', 'triggers', 'The triggers must be a list, one entry for each trigger. Archipelago would stop with an error.');
    return;
  }

  const hostGame = host === null ? undefined : schema.games[host];
  /** An edit that rewrites this block's trigger list. Only for a trigger list inside a game block. */
  const rewrite = (change: (copy: unknown[]) => void): Fix['edits'] => {
    const copy = clone(list);
    change(copy);
    return host === null ? [] : copy.length === 0 ? [{ op: 'reset', game: host, option: 'triggers' }] : [{ op: 'set', game: host, option: 'triggers', value: copy }];
  };
  const fixIn = (label: string, change: (copy: unknown[]) => void, destructive = false): Fix[] => {
    if (host === null) return [];
    return [{ label, edits: rewrite(change), ...(destructive ? { destructive: true } : {}) }];
  };

  // What every trigger sets, so one trigger can fire on another's change.
  const setBy = new Map<string, unknown[]>();
  for (const entry of list) {
    const options = isRecord(entry) ? entry['options'] : undefined;
    if (!isRecord(options)) continue;
    for (const [category, inner] of Object.entries(options)) {
      if (!isRecord(inner)) continue;
      for (const [key, value] of Object.entries(inner)) {
        const { mode, option } = splitChangeKey(key);
        if (mode !== 'set') continue;
        const id = `${category}\u0000${option}`;
        setBy.set(id, [...(setBy.get(id) ?? []), value]);
      }
    }
  }

  list.forEach((entry, index) => {
    const n = index + 1;
    const id = `${n}`;
    if (!isRecord(entry)) {
      add('TRIGGER_NOT_MAP', 'error', 'triggers', `Trigger ${n} must be a block with option_name, option_result and options. Archipelago would stop with an error.`, fixIn(`Remove trigger ${n}`, (copy) => void copy.splice(index, 1), true), id);
      return;
    }
    const category = entry['option_category'];
    const categoryName = typeof category === 'string' ? category : '';
    const watched = entry['option_name'];

    for (const key of ['option_name', 'options'] as const) {
      if (!own(entry, key)) add('TRIGGER_MISSING', 'error', 'triggers', `Trigger ${n} has no ${key}. Archipelago would stop with an error.`, [], `${id}|${key}`);
    }
    if (!own(entry, 'option_result')) {
      add('TRIGGER_NO_RESULT', 'warning', 'triggers', `Trigger ${n} has no option_result, so it only fires when the watched option has no value at all.`, [], id);
    }

    // Which block the watched option is looked for in.
    if (categoryName !== '' && !own(object, categoryName)) {
      const games = Object.keys(object).filter((key) => own(schema.games, key));
      const near = closest(categoryName, games);
      add(
        'TRIGGER_BAD_CATEGORY',
        'error',
        'triggers',
        `Trigger ${n} looks in "${categoryName}", which is not a section of this file${near === undefined ? '' : `. Did you mean "${near}"?`} Archipelago would stop with an error.`,
        near === undefined ? [] : fixIn(`Use "${near}"`, (copy) => void ((copy[index] as Record<string, unknown>)['option_category'] = near)),
        id,
      );
    }
    const blockOf = (name: string): unknown => (name === '' ? object : object[name]);
    const targetGame = categoryName === '' ? undefined : schema.games[categoryName];
    const targetBlock = blockOf(categoryName);

    if (typeof watched === 'string' && isRecord(targetBlock)) {
      const option = targetGame?.options[watched];
      if (categoryName === '' && host !== null && hostGame !== undefined && own(hostGame.options, watched)) {
        add(
          'TRIGGER_NO_CATEGORY',
          'warning',
          'triggers',
          `Trigger ${n} has no option_category, so Archipelago looks for "${watched}" at the top of the file instead of in "${host}". It will not find it, and the trigger will never fire.`,
          fixIn(`Look in "${host}"`, (copy) => void ((copy[index] as Record<string, unknown>)['option_category'] = host)),
          id,
        );
      } else if (targetGame !== undefined && option === undefined && !own(targetBlock, watched)) {
        const near = closest(watched, Object.keys(targetGame.options));
        add(
          'TRIGGER_UNKNOWN_OPTION',
          'warning',
          'triggers',
          `Trigger ${n} watches "${watched}", which is not an option of ${categoryName}${near === undefined ? '' : `. Did you mean "${near}"?`} It will never fire.`,
          near === undefined ? [] : fixIn(`Watch "${near}"`, (copy) => void ((copy[index] as Record<string, unknown>)['option_name'] = near)),
          id,
        );
      } else if (option !== undefined && !own(targetBlock, watched)) {
        const fallback = option.default;
        const usable = typeof fallback === 'string' || typeof fallback === 'number' || typeof fallback === 'boolean';
        add(
          'TRIGGER_WATCHED_NOT_SET',
          'error',
          'triggers',
          `Trigger ${n} watches "${watched}", but ${categoryName} does not set it in this YAML. Archipelago puts an empty value there and stops with an error. Write the option in the YAML first.`,
          usable && categoryName === host && host !== null ? [{ label: `Write ${watched}: ${String(fallback)}`, edits: [{ op: 'set', game: host, option: watched, value: fallback }] }] : [],
          id,
        );
      } else if (own(targetBlock, watched)) {
        const possible = possibleValues(targetBlock[watched], setBy.get(`${categoryName}\u0000${watched}`) ?? []);
        const result = entry['option_result'];
        if (possible !== null && possible.length > 0 && own(entry, 'option_result') && typeof result !== 'object') {
          const exact = possible.some((value) => value === result);
          const writtenAsKey = isRecord(targetBlock[watched]) && possible.some((value) => String(value) === String(result));
          if (!exact && !writtenAsKey) {
            const sameText = possible.find((value) => String(value) === String(result));
            const sameLetters = possible.find((value) => String(value).toLowerCase() === String(result).toLowerCase());
            const shown = possible.slice(0, 6).map(quote).join(', ');
            let message: string;
            if (sameText !== undefined) {
              message = `Trigger ${n} waits for ${quote(result)}, but "${watched}" is written as ${quote(sameText)}. Archipelago compares exactly, so a switch value (true) and the text "true" never match. The trigger will never fire.`;
            } else if (sameLetters !== undefined) {
              message = `Trigger ${n} waits for ${quote(result)}, but "${watched}" is written as ${quote(sameLetters)}. Archipelago compares capitals exactly, so the trigger will never fire.`;
            } else {
              message = `Trigger ${n} waits for ${quote(result)}, but "${watched}" can only be ${shown}${possible.length > 6 ? ', ...' : ''}. The trigger will never fire.`;
            }
            const replacement = sameText ?? sameLetters ?? (possible.length === 1 ? possible[0] : undefined);
            add(
              'TRIGGER_NEVER_FIRES',
              'warning',
              'triggers',
              message,
              replacement === undefined ? [] : fixIn(`Wait for ${quote(replacement)}`, (copy) => void ((copy[index] as Record<string, unknown>)['option_result'] = replacement)),
              id,
            );
          }
        }
      }
    }

    // The chance.
    if (own(entry, 'percentage')) {
      const chance = entry['percentage'];
      const numeric = typeof chance === 'number' ? chance : typeof chance === 'string' && chance.trim() !== '' ? Number(chance) : Number.NaN;
      if (!isRecord(chance) && !Array.isArray(chance) && !Number.isFinite(numeric)) {
        add('TRIGGER_PERCENT', 'error', 'triggers', `Trigger ${n} has a percentage of ${quote(chance)}, which is not a number. Archipelago would stop with an error.`, fixIn('Use 100', (copy) => void ((copy[index] as Record<string, unknown>)['percentage'] = 100)), id);
      } else if (Number.isFinite(numeric) && (numeric < 0 || numeric > 100)) {
        const bounded = numeric < 0 ? 0 : 100;
        add('TRIGGER_PERCENT_RANGE', 'warning', 'triggers', `Trigger ${n} has a percentage of ${numeric}. It is a chance from 0 to 100, so this means ${numeric < 0 ? 'never' : 'always'}.`, fixIn(`Use ${bounded}`, (copy) => void ((copy[index] as Record<string, unknown>)['percentage'] = bounded)), id);
      }
    }

    // What it changes.
    const options = entry['options'];
    if (own(entry, 'options') && !isRecord(options)) {
      add('TRIGGER_OPTIONS_SHAPE', 'error', 'triggers', `The options of trigger ${n} must be blocks of changes, one block for each game (for example "${host ?? 'A Link to the Past'}:"). Archipelago would stop with an error.`, [], id);
      return;
    }
    if (!isRecord(options)) return;
    for (const [block, inner] of Object.entries(options)) {
      if (block !== '' && !own(object, block)) {
        add('TRIGGER_CHANGE_BAD_CATEGORY', 'error', 'triggers', `Trigger ${n} changes options in "${block}", which is not a section of this file. Archipelago would stop with an error.`, [], `${id}|${block}`);
        continue;
      }
      if (!isRecord(inner)) {
        add('TRIGGER_CHANGES_SHAPE', 'error', 'triggers', `The changes for "${block}" in trigger ${n} must be a list of options with their new values. Archipelago would stop with an error.`, [], `${id}|${block}`);
        continue;
      }
      const game: GameSchema | undefined = schema.games[block];
      const blockData = block === '' ? object : object[block];
      for (const [key, value] of Object.entries(inner)) {
        const { mode, option: name } = splitChangeKey(key);
        const option = game?.options[name];
        const idKey = `${id}|${block}|${key}`;
        const here = block === host && host !== null;
        if (game !== undefined && option === undefined && !(isRecord(blockData) && own(blockData, name)) && name !== 'triggers') {
          const near = closest(name, Object.keys(game.options));
          add('TRIGGER_CHANGE_UNKNOWN_OPTION', 'warning', 'triggers', `Trigger ${n} changes "${name}", which is not an option of ${block}${near === undefined ? '' : `. Did you mean "${near}"?`} Archipelago ignores it.`, [], idKey);
          continue;
        }
        if (mode !== 'set') {
          const present = isRecord(blockData) && own(blockData, name);
          const current = present ? blockData[name] : undefined;
          if (option !== undefined && !MERGEABLE.includes(option.kind) && present && !Array.isArray(current) && !isRecord(current)) {
            add('TRIGGER_MERGE_KIND', 'error', 'triggers', `Trigger ${n} uses "${mode === 'add' ? '+' : '-'}" on "${name}", but that is not a list, set or map, so there is nothing to add to or take from. Archipelago would stop with an error.`, here ? fixIn(`Set it instead`, (copy) => {
              const target = ((copy[index] as Record<string, unknown>)['options'] as Record<string, Record<string, unknown>>)[block]!;
              delete target[key];
              target[name] = value;
            }) : [], idKey);
          } else if (!Array.isArray(value) && !isRecord(value) && present) {
            add('TRIGGER_MERGE_VALUE', 'error', 'triggers', `Trigger ${n} uses "${mode === 'add' ? '+' : '-'}" on "${name}" with a single value. It needs a list or a map. Archipelago would stop with an error.`, [], idKey);
          }
          continue;
        }
        if (option === undefined || value === null) continue;
        const checks = isRecord(value) ? Object.keys(value) : Array.isArray(value) ? value : [value];
        for (const item of checks.slice(0, 50)) {
          if (typeof item === 'object' && item !== null) break;
          const problem = ctx.checkValue(option, item);
          if (problem === null) continue;
          const fixed = problem.suggestion;
          add(
            'TRIGGER_BAD_VALUE',
            problem.severity ?? 'error',
            'triggers',
            `Trigger ${n} would set "${name}": ${problem.message}`,
            here && fixed !== undefined && !isRecord(value) && !Array.isArray(value)
              ? fixIn(fixed.label, (copy) => {
                  const target = ((copy[index] as Record<string, unknown>)['options'] as Record<string, Record<string, unknown>>)[block]!;
                  target[key] = fixed.value;
                })
              : [],
            idKey,
          );
          break;
        }
      }
    }
  });
}
