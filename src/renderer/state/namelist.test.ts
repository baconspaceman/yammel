import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../../model/document';
import { parseSchemaFile } from '../../schema/load';
import { validateDocument } from '../../validate/validate';
import { countOf, entriesOf, isNameListKind, nameEdit, namePool, suggest } from './namelist';

const schema = parseSchemaFile(readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8'));
const alttp = schema.games['A Link to the Past']!;
const set = alttp.options['local_items']!;
const counter = alttp.options['start_inventory']!;
const itemLinks = alttp.options['item_links']!;

describe('entriesOf', () => {
  it('reads a set as names and a counter as counts, and nothing as empty', () => {
    expect(entriesOf(set, ['A', 'B', 'A'])).toEqual({ type: 'names', names: ['A', 'B'] });
    expect(entriesOf(counter, { Bow: 2 })).toEqual({ type: 'counts', counts: { Bow: 2 } });
    expect(entriesOf(set, undefined)).toEqual({ type: 'names', names: [] });
    expect(entriesOf(counter, null)).toEqual({ type: 'counts', counts: {} });
  });

  it('refuses what it cannot show: settings inside a list, text counts, the wrong shape', () => {
    expect(entriesOf(itemLinks, [{ name: 'x', item_pool: ['a'] }])).toBeNull();
    expect(entriesOf(counter, { Bow: 'many' })).toBeNull();
    expect(entriesOf(counter, { Bow: -1 })).toBeNull();
    expect(entriesOf(counter, ['Bow'])).toBeNull();
    expect(entriesOf(set, { a: 1 })).toBeNull();
  });

  it('knows which kinds are lists', () => {
    expect(isNameListKind(set) && isNameListKind(counter)).toBe(true);
    expect(isNameListKind(alttp.options['goal']!)).toBe(false);
  });
});

describe('suggest', () => {
  const pool = ['Bow', 'Silver Bow', 'Bombos', 'Hookshot', 'Bottle'];
  it('puts names that start with the text first, then names that contain it, never repeating chosen ones', () => {
    expect(suggest(pool, 'bo', new Set())).toEqual(['Bow', 'Bombos', 'Bottle', 'Silver Bow']);
    expect(suggest(pool, 'bo', new Set(['Bow']))).toEqual(['Bombos', 'Bottle', 'Silver Bow']);
    expect(suggest(pool, '', new Set())).toEqual([]);
    expect(suggest(pool, 'zzz', new Set())).toEqual([]);
    expect(suggest(pool, 'bo', new Set(), 2)).toHaveLength(2);
  });

  it('is quick on a big game', () => {
    const big = Object.values(schema.games).reduce((a, g) => (g.items.length > a.items.length ? g : a));
    const started = Date.now();
    for (let i = 0; i < 200; i += 1) suggest(namePool(big, 'items'), 'a', new Set());
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('nameEdit', () => {
  it('writes a list, a count map, or removes the option when nothing is left', () => {
    expect(nameEdit('G', set, { type: 'names', names: ['A'] })).toEqual({ op: 'set', game: 'G', option: 'local_items', value: ['A'] });
    expect(nameEdit('G', counter, { type: 'counts', counts: { Bow: 1 } })).toEqual({ op: 'set', game: 'G', option: 'start_inventory', value: { Bow: 1 } });
    expect(nameEdit('G', set, { type: 'names', names: [] })).toEqual({ op: 'reset', game: 'G', option: 'local_items' });
    expect(nameEdit('G', counter, { type: 'counts', counts: {} })).toEqual({ op: 'reset', game: 'G', option: 'start_inventory' });
  });

  it('what it writes for real names passes the validator', () => {
    const doc = YamlDocument.empty(alttp.name);
    const item = alttp.items[0]!;
    doc.applyAll([nameEdit(alttp.name, set, { type: 'names', names: [item] }), nameEdit(alttp.name, counter, { type: 'counts', counts: { [item]: 3 } })]);
    expect(validateDocument(doc, schema)).toEqual([]);
    expect(countOf({ type: 'names', names: ['a', 'b'] })).toBe(2);
  });
});
