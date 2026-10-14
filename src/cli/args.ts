import type { CommandDef, FlagSpec } from './types';

export type ParsedInput = { ok: true; input: Record<string, unknown> } | { ok: false; message: string };

/** Camel-case key for an input property: "ap-root" becomes "apRoot". */
export function inputKey(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function flagFor(command: CommandDef, name: string): FlagSpec | undefined {
  return command.flags.find((flag) => flag.name === name);
}

/**
 * Turns command-line words into the input object a command takes. Flags look like `--count 5` or `--count=5`;
 * boolean flags need no value; list flags (`--set key=value`) may be repeated. Anything unknown is refused with the list of
 * flags the command does take, so an agent can correct itself.
 */
export function parseCommandArgs(command: CommandDef, words: readonly string[]): ParsedInput {
  const input: Record<string, unknown> = {};
  const positionals: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (!word.startsWith('--')) {
      positionals.push(word);
      continue;
    }
    const equals = word.indexOf('=');
    const name = word.slice(2, equals === -1 ? undefined : equals);
    const flag = flagFor(command, name);
    if (flag === undefined) {
      const known = command.flags.map((f) => `--${f.name}`).join(', ') || 'none';
      return { ok: false, message: `Unknown flag --${name} for "${command.name}". Flags: ${known}.` };
    }
    const key = inputKey(flag.name);
    if (flag.type === 'boolean') {
      if (equals !== -1) {
        const value = word.slice(equals + 1);
        if (value !== 'true' && value !== 'false') return { ok: false, message: `--${name} takes no value (or true/false).` };
        input[key] = value === 'true';
      } else {
        input[key] = true;
      }
      continue;
    }
    let value: string;
    if (equals !== -1) value = word.slice(equals + 1);
    else {
      const next = words[i + 1];
      if (next === undefined || (next.startsWith('--') && next.length > 2)) return { ok: false, message: `--${name} needs a value.` };
      value = next;
      i += 1;
    }
    if (flag.type === 'number') {
      const number = Number(value);
      if (value.trim() === '' || !Number.isFinite(number)) return { ok: false, message: `--${name} must be a number (got "${value}").` };
      input[key] = number;
    } else if (flag.type === 'list') {
      const list = (input[key] as string[] | undefined) ?? [];
      list.push(value);
      input[key] = list;
    } else {
      input[key] = value;
    }
  }

  const positional = command.positional;
  if (positional === undefined) {
    if (positionals.length > 0) return { ok: false, message: `"${command.name}" takes no positional argument (got "${positionals[0]}").` };
  } else {
    if (positionals.length > 1) {
      const booleans = command.flags.some((f) => f.type === 'boolean') ? ' Boolean flags take no value: write --flag=false to turn one off.' : '';
      return { ok: false, message: `"${command.name}" takes one ${positional.name} (got ${positionals.length}). Quote names with spaces.${booleans}` };
    }
    if (positionals.length === 0 && positional.required) return { ok: false, message: `"${command.name}" needs a ${positional.name}: ${positional.description}.` };
    if (positionals.length === 1) input[positional.name] = positionals[0];
  }
  return { ok: true, input };
}
