import { acceptsRandom, formatRandom, parseRandom } from '../randomize/randomSpec';
import type { GameSchema, OptionSchema } from '../schema/types';

export type ValueParse = { ok: true; value: unknown } | { ok: false; message: string };

const TRUE_WORDS = ['true', 'on', 'yes', 'enabled', '1'];
const FALSE_WORDS = ['false', 'off', 'no', 'disabled', '0'];

const fail = (message: string): ValueParse => ({ ok: false, message });

/** Controls, and the separators (U+0085, U+2028, U+2029) that PyYAML reads as line breaks: written into a YAML they change or break the value. */
const UNSAFE_TEXT = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;

function safeText(option: OptionSchema, value: string): ValueParse {
  return UNSAFE_TEXT.test(value)
    ? fail(`${option.key}: the text contains a character that cannot be written safely into a YAML (a control or line-separator character).`)
    : { ok: true, value };
}

function choiceKey(option: OptionSchema, text: string): string | undefined {
  const lower = text.toLowerCase();
  const alias = Object.entries(option.aliases ?? {}).find(([name]) => name.toLowerCase() === lower)?.[1];
  const wanted = (alias ?? text).toLowerCase();
  return option.choices?.find((c) => c.key.toLowerCase() === wanted)?.key;
}

/**
 * The YAML value for text typed on a command line (`--set death_link=on`), checked against the option the way the editor does:
 * a real choice, a number inside the range, a switch word, or one of Archipelago's own random forms.
 */
export function parseOptionValue(option: OptionSchema, text: string): ValueParse {
  const value = text.trim();
  if (value === '') return fail(`${option.key}: the value is empty.`);

  if (acceptsRandom(option)) {
    const random = parseRandom(option, value);
    if (random !== null) return { ok: true, value: formatRandom(random) };
  }

  switch (option.kind) {
    case 'toggle': {
      const word = value.toLowerCase();
      if (TRUE_WORDS.includes(word)) return { ok: true, value: true };
      if (FALSE_WORDS.includes(word)) return { ok: true, value: false };
      return fail(`${option.key}: "${value}" is not a switch value. Use true or false (or on, off, yes, no), or random.`);
    }
    case 'choice': {
      const key = choiceKey(option, value);
      if (key !== undefined) return { ok: true, value: key };
      const choices = (option.choices ?? []).map((c) => c.key).join(', ');
      return fail(`${option.key}: "${value}" is not one of its choices (${choices}), or random.`);
    }
    case 'text_choice': {
      const key = choiceKey(option, value);
      return key !== undefined ? { ok: true, value: key } : safeText(option, value);
    }
    case 'range':
    case 'named_range': {
      const special = Object.keys(option.specialNames ?? {}).find((name) => name.toLowerCase() === value.toLowerCase());
      if (option.kind === 'named_range' && special !== undefined) return { ok: true, value: special };
      if (!/^-?\d+$/.test(value)) {
        const names = Object.keys(option.specialNames ?? {});
        const extra = names.length > 0 ? `, one of ${names.join(', ')},` : '';
        return fail(`${option.key}: "${value}" is not a whole number${extra} or a random form such as random-low.`);
      }
      const number = Number(value);
      const min = option.min ?? Number.NEGATIVE_INFINITY;
      const max = option.max ?? Number.POSITIVE_INFINITY;
      if (number < min || number > max) return fail(`${option.key}: ${number} is outside its range ${min} to ${max}.`);
      return { ok: true, value: number };
    }
    case 'free_text':
      return safeText(option, value);
    case 'set': {
      // JSON arrays preserve spaces and commas in names and can express an empty set.
      let entries: unknown;
      try { entries = JSON.parse(value); } catch {
        return fail(`${option.key}: use a JSON array of names, for example ["Crabs","Races"].`);
      }
      if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === 'string')) {
        return fail(`${option.key}: expected a JSON array containing only strings.`);
      }
      const names = entries as string[];
      for (const name of names) {
        const safe = safeText(option, name);
        if (!safe.ok) return safe;
        if (option.validKeys?.length && !option.validKeys.includes(name)) {
          return fail(`${option.key}: "${name}" is not an allowed name (${option.validKeys.join(', ')}).`);
        }
      }
      return { ok: true, value: [...new Set(names)] };
    }
    default:
      return fail(`${option.key}: a ${option.kind} option cannot be set from the command line yet (Advanced mode covers it).`);
  }
}

export type AssignmentsParse = { ok: true; values: Record<string, unknown> } | { ok: false; message: string };

/** `["death_link=on", "lives=3"]` for one game, as the option values to write. Unknown options and bad values are refused by name. */
export function parseAssignments(game: GameSchema, assignments: readonly string[]): AssignmentsParse {
  const values: Record<string, unknown> = {};
  for (const assignment of assignments) {
    const equals = assignment.indexOf('=');
    if (equals <= 0) return { ok: false, message: `"${assignment}" is not key=value.` };
    const given = assignment.slice(0, equals).trim();
    const key = Object.keys(game.options).find((k) => k === given) ?? Object.keys(game.options).find((k) => k.toLowerCase() === given.toLowerCase());
    if (key === undefined) {
      const near = Object.keys(game.options)
        .filter((k) => k.toLowerCase().includes(given.toLowerCase()) || given.toLowerCase().includes(k.toLowerCase()))
        .slice(0, 5);
      const hint = near.length > 0 ? ` Did you mean ${near.join(', ')}?` : '';
      return { ok: false, message: `${game.name} has no option "${given}".${hint}` };
    }
    if (Object.hasOwn(values, key)) return { ok: false, message: `${key} is set twice.` };
    const parsed = parseOptionValue(game.options[key]!, assignment.slice(equals + 1));
    if (!parsed.ok) return { ok: false, message: parsed.message };
    values[key] = parsed.value;
  }
  return { ok: true, values };
}
