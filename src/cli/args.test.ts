import { describe, expect, it } from 'vitest';
import { inputKey, parseCommandArgs } from './args';
import type { CommandDef } from './types';

const command: CommandDef = {
  name: 'new',
  summary: 'x',
  positional: { name: 'game', description: 'the game', required: true },
  flags: [
    { name: 'name', type: 'string', description: '' },
    { name: 'seed', type: 'number', description: '' },
    { name: 'randomize', type: 'boolean', description: '' },
    { name: 'set', type: 'list', description: '' },
    { name: 'ap-root', type: 'string', description: '' },
  ],
  run: async () => ({ ok: true, data: {} }),
};

const parse = (...words: string[]) => parseCommandArgs(command, words);

describe('inputKey', () => {
  it('camel-cases flag names', () => {
    expect(inputKey('ap-root')).toBe('apRoot');
    expect(inputKey('seed')).toBe('seed');
    expect(inputKey('a-b-c')).toBe('aBC');
  });
});

describe('parseCommandArgs', () => {
  it('reads the positional argument, strings, numbers and booleans', () => {
    expect(parse('APQuest', '--name', 'Ann', '--seed', '42', '--randomize')).toEqual({
      ok: true,
      input: { game: 'APQuest', name: 'Ann', seed: 42, randomize: true },
    });
  });

  it('accepts --flag=value, and the positional in any place', () => {
    expect(parse('--seed=7', 'APQuest', '--name=Bo')).toEqual({ ok: true, input: { game: 'APQuest', seed: 7, name: 'Bo' } });
  });

  it('collects a repeated list flag in order', () => {
    expect(parse('G', '--set', 'a=1', '--set', 'b=2', '--set=c=3')).toEqual({ ok: true, input: { game: 'G', set: ['a=1', 'b=2', 'c=3'] } });
  });

  it('camel-cases keys from flags with dashes', () => {
    expect(parse('G', '--ap-root', 'C:\\ap')).toEqual({ ok: true, input: { game: 'G', apRoot: 'C:\\ap' } });
  });

  it('lets a value start with a single dash or be negative', () => {
    expect(parse('G', '--seed', '-5')).toEqual({ ok: true, input: { game: 'G', seed: -5 } });
    expect(parse('G', '--name', '-x')).toEqual({ ok: true, input: { game: 'G', name: '-x' } });
  });

  it('allows explicit true or false for a boolean flag', () => {
    expect(parse('G', '--randomize=false')).toEqual({ ok: true, input: { game: 'G', randomize: false } });
    expect(parse('G', '--randomize=maybe').ok).toBe(false);
  });

  it('refuses an unknown flag and lists the known ones', () => {
    const result = parse('G', '--speed', '3');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe('Unknown flag --speed for "new". Flags: --name, --seed, --randomize, --set, --ap-root.');
  });

  it('refuses a flag with no value, or a value that is another flag', () => {
    expect(parse('G', '--name')).toEqual({ ok: false, message: '--name needs a value.' });
    expect(parse('G', '--name', '--seed', '1')).toEqual({ ok: false, message: '--name needs a value.' });
  });

  it('refuses a number that is not one', () => {
    expect(parse('G', '--seed', 'abc')).toEqual({ ok: false, message: '--seed must be a number (got "abc").' });
    expect(parse('G', '--seed', '')).toEqual({ ok: false, message: '--seed must be a number (got "").' });
  });

  it('wants exactly one positional when it is required, and none when the command takes none', () => {
    expect(parse()).toEqual({ ok: false, message: '"new" needs a game: the game.' });
    expect(parse('A', 'B').ok).toBe(false);
    const bare: CommandDef = { ...command, positional: undefined };
    expect(parseCommandArgs(bare, ['oops'])).toEqual({ ok: false, message: '"new" takes no positional argument (got "oops").' });
    expect(parseCommandArgs(bare, ['--seed', '1'])).toEqual({ ok: true, input: { seed: 1 } });
  });
});
