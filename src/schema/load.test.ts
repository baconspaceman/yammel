import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchemaFile, SchemaError } from './load';

const fixtureText = readFileSync(new URL('../../tests/fixtures/mini-schema.json', import.meta.url), 'utf8');

function mutated(change: (schema: any) => void): string {
  const schema = JSON.parse(fixtureText);
  change(schema);
  return JSON.stringify(schema);
}

describe('parseSchemaFile', () => {
  it('accepts the mini fixture and exposes typed data', () => {
    const schema = parseSchemaFile(fixtureText);
    expect(schema.apVersion).toBe('0.6.7');
    const game = schema.games['Demo Game'];
    expect(game?.options['difficulty']?.kind).toBe('choice');
    expect(game?.options['lives']?.max).toBe(10);
    expect(game?.groups[0]?.options).toEqual(['difficulty', 'lives', 'hard_mode']);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseSchemaFile('{nope')).toThrow(SchemaError);
  });

  it('rejects a missing games object and names the path', () => {
    const text = mutated((s) => delete s.games);
    expect(() => parseSchemaFile(text)).toThrow('$.games');
  });

  it('rejects an unknown option kind and names the path', () => {
    const text = mutated((s) => (s.games['Demo Game'].options.lives.kind = 'banana'));
    expect(() => parseSchemaFile(text)).toThrow('$.games["Demo Game"].options["lives"].kind');
  });

  it('rejects a group that lists an option that does not exist', () => {
    const text = mutated((s) => s.games['Demo Game'].groups[0].options.push('ghost'));
    expect(() => parseSchemaFile(text)).toThrow('lists unknown option "ghost"');
  });

  it('rejects a game whose name differs from its key', () => {
    const text = mutated((s) => (s.games['Demo Game'].name = 'Other'));
    expect(() => parseSchemaFile(text)).toThrow('name must equal its key');
  });

  const game = (s: any) => s.games['Demo Game'];
  const deeper: [string, (s: any) => void, string][] = [
    ['non-boolean supportsWeighting', (s) => (game(s).options.lives.supportsWeighting = 'yes'), 'options["lives"].supportsWeighting'],
    ['choice without choices', (s) => delete game(s).options.difficulty.choices, 'options["difficulty"].choices'],
    ['choice entry without a label', (s) => delete game(s).options.difficulty.choices[0].label, 'choices[0].label'],
    ['choice entry with a non-string key', (s) => (game(s).options.difficulty.choices[1].key = 3), 'choices[1].key'],
    ['choice without aliases', (s) => delete game(s).options.difficulty.aliases, 'options["difficulty"].aliases'],
    ['range without min', (s) => delete game(s).options.lives.min, 'options["lives"].min'],
    ['range with non-numeric max', (s) => (game(s).options.lives.max = '10'), 'options["lives"].max'],
    ['range with min above max', (s) => (game(s).options.lives.min = 11), 'min must not be above max'],
    [
      'named_range without specialNames',
      (s) => Object.assign(game(s).options.lives, { kind: 'named_range' }),
      'options["lives"].specialNames',
    ],
    [
      'named_range with a non-number special name',
      (s) => Object.assign(game(s).options.lives, { kind: 'named_range', specialNames: { none: 'zero' } }),
      'specialNames["none"]',
    ],
    ['non-boolean hidden', (s) => (game(s).hidden = 'no'), '.hidden'],
    ['a number in items', (s) => game(s).items.push(5), '.items[2]'],
    ['a number in locations', (s) => game(s).locations.push(5), '.locations[2]'],
    ['a number in itemGroups', (s) => game(s).itemGroups.push(5), '.itemGroups[1]'],
    ['a number in locationGroups', (s) => game(s).locationGroups.push(5), '.locationGroups[0]'],
    ['missing extractedAt', (s) => delete s.extractedAt, '$.extractedAt'],
    ['an error entry without an error text', (s) => s.errors.push({ game: 'X' }), '$.errors[0].error'],
    ['an error entry without a game', (s) => s.errors.push({ error: 'boom' }), '$.errors[0].game'],
  ];
  it.each(deeper)('rejects %s and names the path', (_label, change, path) => {
    expect(() => parseSchemaFile(mutated(change))).toThrow(path);
  });
});
