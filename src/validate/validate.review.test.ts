import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import { parseSchemaFile } from '../schema/load';
import { validateDocument } from './validate';
import { bestFix } from './types';

const real = parseSchemaFile(readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8'));
const mini = parseSchemaFile(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'mini-schema.json'), 'utf8'));
const run = (yaml: string, schema = mini) => validateDocument(YamlDocument.parse(yaml), schema);
const demo = (options: string) => `name: P\ngame: Demo Game\nDemo Game:\n${options}`;

describe('things Archipelago accepts that must not be flagged (found in review)', () => {
  it('triggers and the A Link to the Past sprite keys are valid inside a game block', () => {
    expect(run(demo('  lives: 3\n  triggers:\n    - option_category: Demo Game\n      option_name: lives\n      option_result: 3\n      options:\n        Demo Game:\n          hard_mode: true\n'))).toEqual([]);
    expect(run('name: P\ngame: A Link to the Past\nA Link to the Past:\n  sprite: Link\n  sprite_pool: [Link]\n  random_sprite_on_event: {}\n', real)).toEqual([]);
  });

  it('a list of values is fine when each entry is (Archipelago picks one at random), and so is a list of games', () => {
    expect(run(demo('  difficulty: [easy, hard]\n'))).toEqual([]);
    expect(run('name: P\ngame: [Demo Game]\nDemo Game: {}\n')).toEqual([]);
    expect(YamlDocument.parse('game: [A, B]\n').games()).toEqual(['A', 'B']);
  });

  it('true and false are fine for a number that treats them as "default" and 0', () => {
    const real2 = YamlDocument.parse('name: P\ngame: Stardew Valley\nStardew Valley:\n  starting_money: true\n');
    expect(validateDocument(real2, real).filter((i) => i.option === 'starting_money')).toEqual([]);
  });

  it('a missing name is fine', () => {
    expect(run('game: Demo Game\nDemo Game: {}\n')).toEqual([]);
  });
});

describe('fixes that must not hurt (found in review)', () => {
  it('never offers to remove the last usable weighted value, or to overwrite a key that is there', () => {
    const issues = run(demo('  difficulty:\n    hrad: 1\n    hard: 1\n'));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.fixes.map((f) => f.label)).toEqual(['Remove "hrad"']); // renaming to "hard" would overwrite the existing "hard"
    const onlyBad = run(demo('  difficulty:\n    hrad: 1\n    easy: 0\n'));
    expect(onlyBad[0]!.fixes.every((f) => !f.label.startsWith('Remove'))).toBe(true); // removing it would leave only weight 0
  });

  it('keeps ids of different weighted problems apart and stable', () => {
    const a = run(demo('  difficulty:\n    hrad: 1\n    esay: 1\n    hard: 1\n'));
    const b = run(demo('  difficulty:\n    esay: 1\n    hrad: 1\n    hard: 1\n'));
    expect(new Set(a.map((i) => i.id)).size).toBe(2);
    expect([...a.map((i) => i.id)].sort()).toEqual([...b.map((i) => i.id)].sort());
  });

  it('removing an unknown option or a game is marked destructive and is never what "apply all" picks', () => {
    const issues = run(demo('  nonsense: 1\n'));
    expect(issues[0]!.fixes.every((f) => f.destructive === true)).toBe(true);
    expect(bestFix(issues[0]!)).toBeUndefined();
  });

  it('a rename is not offered over a value that is already set', () => {
    const issues = run(demo('  hardmode: true\n  hard_mode: false\n'));
    expect(issues.find((i) => i.option === 'hardmode')!.fixes.some((f) => f.label.startsWith('Rename'))).toBe(false);
  });

  it('removing a game from a mix keeps at least one positive weight', () => {
    const doc = YamlDocument.parse('name: P\ngame:\n  Demo Game: 0\n  Nope: 50\nDemo Game: {}\nNope: {}\n');
    const fix = validateDocument(doc, mini).find((i) => i.code === 'UNKNOWN_GAME')!.fixes[0]!;
    doc.applyAll(fix.edits);
    expect(doc.games()).toEqual(['Demo Game']);
  });
});

describe('odd files never crash the checker (found in review)', () => {
  it('an alias bomb, a circular anchor and prototype names are left alone', () => {
    const bomb = 'a: &a [x, x, x, x, x, x, x, x, x]\n' + Array.from({ length: 12 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(9).fill(`*${i === 0 ? 'a' : String.fromCharCode(97 + i)}`).join(', ')}]`).join('\n') + '\nname: P\ngame: Demo Game\nDemo Game: {}\n';
    expect(() => run(bomb)).not.toThrow();
    expect(() => run('name: P\ngame: constructor\nconstructor:\n  lives: 3\n')).not.toThrow();
    expect(run('name: P\ngame: constructor\nconstructor: {}\n').map((i) => i.code)).toEqual(['UNKNOWN_GAME']);
    expect(() => run(demo('  constructor: 1\n  __proto__: 2\n'))).not.toThrow();
  });
});

describe('mixed games and lists (found in the Plan 10 review)', () => {
  it('a game in the list with no options section is an error with a one-click fix, and a weight-0 game is not', () => {
    const doc = YamlDocument.parse('name: P\ngame:\n  Demo Game: 50\n  Other: 50\nDemo Game: {}\n');
    const schemaWithOther = { ...mini, games: { ...mini.games, Other: { ...mini.games['Demo Game']!, name: 'Other' } } };
    const issues = validateDocument(doc, schemaWithOther);
    expect(issues.map((i) => i.code)).toEqual(['MISSING_BLOCK']);
    doc.applyAll(issues[0]!.fixes[0]!.edits);
    expect(validateDocument(doc, schemaWithOther)).toEqual([]);
    const zero = YamlDocument.parse('name: P\ngame:\n  Demo Game: 50\n  Other: 0\nDemo Game: {}\n');
    expect(validateDocument(zero, schemaWithOther)).toEqual([]);
  });

  it('group names are fine in a set but not in a start inventory, which takes plain item names', () => {
    const game = real.games['A Link to the Past']!;
    const group = game.itemGroups[0]!;
    const asSet = YamlDocument.parse(`name: P\ngame: A Link to the Past\nA Link to the Past:\n  local_items: [${JSON.stringify(group)}]\n`);
    expect(validateDocument(asSet, real)).toEqual([]);
    const asCounter = YamlDocument.parse(`name: P\ngame: A Link to the Past\nA Link to the Past:\n  start_inventory:\n    ${JSON.stringify(group)}: 1\n`);
    expect(validateDocument(asCounter, real).map((i) => i.code)).toEqual(['UNKNOWN_NAME']);
  });
});
