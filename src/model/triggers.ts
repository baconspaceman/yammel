import type { Edit } from './edits';

/**
 * Archipelago "triggers": when an option rolls a certain value, change other options.
 *
 *   triggers:
 *     - option_category: A Link to the Past   # which block to look in ("" = the top of the file)
 *       option_name: goal                     # the option that is watched
 *       option_result: ganon                  # the value that fires the trigger
 *       percentage: 50                        # optional chance, default 100
 *       options:                              # what to change when it fires
 *         A Link to the Past:
 *           swordless: true
 *           +start_inventory: [Bow]           # + adds to a list, set or map; - takes away
 *
 * Verified against Archipelago's own Generate.py (roll_triggers and update_weights) and by running it.
 */

export type ChangeMode = 'set' | 'add' | 'remove';

export interface TriggerChange {
  /** The block the change lands in: a game name, or "" for the top of the file. */
  category: string;
  option: string;
  mode: ChangeMode;
  value: unknown;
}

export interface Trigger {
  /** The block the watched option lives in: a game name, or "" for the top of the file. */
  category: string;
  option: string;
  result: unknown;
  /** null = not written, so Archipelago uses 100. */
  percentage: number | null;
  changes: TriggerChange[];
  /** Anything else the trigger had, kept exactly. */
  extra: Record<string, unknown>;
  /**
   * True when this trigger is simple enough for the controls: plain watched option and value, every change in the
   * same game block. Other triggers are shown read-only and written back untouched.
   */
  editable: boolean;
  /** The trigger exactly as read, used to write back one that is not editable. */
  raw: unknown;
}

export interface TriggerList {
  triggers: Trigger[];
  /** Set when `triggers` is not a list of triggers at all. The value is then left alone. */
  problem: string | null;
}

const KNOWN_KEYS = new Set(['option_category', 'option_name', 'option_result', 'percentage', 'options']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isPlain = (value: unknown): boolean => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** The mode and bare option name for a key like "+start_inventory". */
export function splitChangeKey(key: string): { mode: ChangeMode; option: string } {
  if (key.startsWith('+')) return { mode: 'add', option: key.slice(1) };
  if (key.startsWith('-')) return { mode: 'remove', option: key.slice(1) };
  return { mode: 'set', option: key };
}

export function changeKey(change: Pick<TriggerChange, 'mode' | 'option'>): string {
  return `${change.mode === 'add' ? '+' : change.mode === 'remove' ? '-' : ''}${change.option}`;
}

/** Reads the value of a game's `triggers:` key. `game` is the block it was found in (the default block for new changes). */
export function readTriggers(raw: unknown, game: string): TriggerList {
  if (raw === undefined || raw === null) return { triggers: [], problem: null };
  if (!Array.isArray(raw)) return { triggers: [], problem: 'The triggers are not a list, so they cannot be shown here.' };
  const triggers = raw.map((entry): Trigger => {
    if (!isRecord(entry)) return { category: '', option: '', result: null, percentage: null, changes: [], extra: {}, editable: false, raw: entry };
    const category = entry['option_category'] === undefined || entry['option_category'] === null ? '' : entry['option_category'];
    const changes: TriggerChange[] = [];
    let sameBlock = typeof category === 'string';
    const options = entry['options'];
    let optionsOk = isRecord(options);
    if (isRecord(options)) {
      for (const [block, inner] of Object.entries(options)) {
        if (!isRecord(inner)) {
          optionsOk = false;
          continue;
        }
        if (block !== game) sameBlock = false;
        for (const [key, value] of Object.entries(inner)) changes.push({ category: block, ...splitChangeKey(key), value });
      }
    }
    const percentage = entry['percentage'];
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) if (!KNOWN_KEYS.has(key)) extra[key] = value;
    const editable =
      sameBlock &&
      category === game &&
      optionsOk &&
      typeof entry['option_name'] === 'string' &&
      isPlain(entry['option_result']) &&
      (percentage === undefined || typeof percentage === 'number');
    return {
      category: typeof category === 'string' ? category : '',
      option: typeof entry['option_name'] === 'string' ? entry['option_name'] : '',
      result: entry['option_result'],
      percentage: typeof percentage === 'number' ? percentage : null,
      changes,
      extra,
      editable,
      raw: entry,
    };
  });
  return { triggers, problem: null };
}

/** The plain data to write for one trigger. A trigger that is not editable is written back exactly as it was read. */
export function triggerToPlain(trigger: Trigger): unknown {
  if (!trigger.editable) return trigger.raw;
  const out: Record<string, unknown> = {};
  out['option_category'] = trigger.category;
  out['option_name'] = trigger.option;
  out['option_result'] = trigger.result;
  if (trigger.percentage !== null) out['percentage'] = trigger.percentage;
  const options: Record<string, Record<string, unknown>> = {};
  for (const change of trigger.changes) {
    const block = (options[change.category] ??= {});
    block[changeKey(change)] = change.value;
  }
  out['options'] = options;
  for (const [key, value] of Object.entries(trigger.extra)) out[key] = value;
  return out;
}

/** The edit that makes this the game's trigger list. An empty list removes the `triggers:` key. */
export function triggersEdit(game: string, triggers: readonly Trigger[]): Edit {
  if (triggers.length === 0) return { op: 'reset', game, option: 'triggers' };
  return { op: 'set', game, option: 'triggers', value: triggers.map(triggerToPlain) };
}

/** A new trigger for the controls: it watches `option` (with `result`) in this game and changes nothing yet. */
export function newTrigger(game: string, option: string, result: unknown): Trigger {
  return { category: game, option, result, percentage: null, changes: [], extra: {}, editable: true, raw: null };
}
