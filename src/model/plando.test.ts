import { describe, expect, it } from 'vitest';
import { YamlDocument } from './document';
import { connectionPlandoToPlain, itemPlandoToPlain, newConnectionPlando, newItemPlando, newTextPlando, plandoEdit, readConnectionPlando, readItemPlando, readTextPlando, textPlandoToPlain } from './plando';

const GAME = 'A Link to the Past';

const ITEMS = `name: T
game: A Link to the Past
A Link to the Past:
  # keep this note
  goal: ganon
  plando_items:
    - item: Hookshot
      location: Link's House
    - items:
        Bow: 1
        Arrow Upgrade (+5): 2
      locations:
        - Sanctuary
        - Mushroom
      world: true
      from_pool: false
      force: true
      count: 2
      percentage: 50
`;

describe('readItemPlando', () => {
  it('reads single and plural forms', () => {
    const { entries, problem } = readItemPlando(YamlDocument.parse(ITEMS).get(GAME, 'plando_items'));
    expect(problem).toBeNull();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ items: { type: 'names', names: ['Hookshot'] }, locations: ["Link's House"], world: false, fromPool: true, force: 'silent', count: null, percentage: null, editable: true });
    expect(entries[1]).toMatchObject({
      items: { type: 'counts', counts: { Bow: 1, 'Arrow Upgrade (+5)': 2 } },
      locations: ['Sanctuary', 'Mushroom'],
      world: true,
      fromPool: false,
      force: true,
      count: 2,
      percentage: 50,
      editable: true,
    });
  });

  it('treats a missing value as an empty list and anything else that is not a list as a problem', () => {
    expect(readItemPlando(undefined)).toEqual({ entries: [], problem: null });
    expect(readItemPlando({ a: 1 }).problem).toMatch(/not a list/);
    expect(readItemPlando('Sword').entries).toEqual([]);
  });

  it('leaves out of reach what the controls cannot show, and writes it back as it was', () => {
    const odd: unknown[] = [
      'text',
      { item: 'Bow', location: 'X', world: [1, 2] },
      { items: { Bow: true }, locations: ['X'] },
      { item: 'Bow', location: 'X', count: { min: 'a' } },
      { item: 'Bow', force: 'maybe' },
      { item: 'Bow', percentage: 12.5 },
      { item: 'Bow', locations: 5 },
    ];
    for (const entry of odd) {
      const [read] = readItemPlando([entry]).entries;
      expect(read!.editable, JSON.stringify(entry)).toBe(false);
      expect(itemPlandoToPlain(read!)).toBe(entry);
    }
  });

  it('keeps keys it does not know', () => {
    const [read] = readItemPlando([{ item: 'Bow', location: 'X', note: 'mine' }]).entries;
    expect(read!.extra).toEqual({ note: 'mine' });
    expect((itemPlandoToPlain(read!) as Record<string, unknown>)['note']).toBe('mine');
  });

  it('reads "Everywhere" as no particular location', () => {
    expect(readItemPlando([{ item: 'Bow', locations: ['Everywhere'] }]).entries[0]!.locations).toEqual([]);
  });
});

describe('writing item plando', () => {
  it('writes only what differs from the defaults', () => {
    expect(itemPlandoToPlain(newItemPlando('Bow', 'Sanctuary'))).toEqual({ item: 'Bow', location: 'Sanctuary' });
    expect(itemPlandoToPlain({ ...newItemPlando('Bow'), fromPool: false, force: true, world: 3, percentage: 25 })).toEqual({ item: 'Bow', world: 3, from_pool: false, force: true, percentage: 25 });
  });

  it('uses the plural forms when a count is written or there is more than one', () => {
    expect(itemPlandoToPlain({ ...newItemPlando('Bow', 'Sanctuary'), count: 1 })).toEqual({ items: ['Bow'], locations: ['Sanctuary'], count: 1 });
    expect(itemPlandoToPlain({ ...newItemPlando('Bow'), items: { type: 'names', names: ['Bow', 'Hookshot'] }, locations: ['A', 'B'] })).toEqual({ items: ['Bow', 'Hookshot'], locations: ['A', 'B'] });
    expect(itemPlandoToPlain({ ...newItemPlando(), items: { type: 'counts', counts: { Bow: 2 } } })).toEqual({ items: { Bow: 2 } });
  });

  it('round-trips through the document, keeping comments and the rest of the file', () => {
    const doc = YamlDocument.parse(ITEMS);
    const { entries } = readItemPlando(doc.get(GAME, 'plando_items'));
    doc.apply(plandoEdit(GAME, 'plando_items', [...entries.map(itemPlandoToPlain), itemPlandoToPlain(newItemPlando('Bow', 'Sanctuary'))]));
    const text = doc.toString();
    expect(text).toContain('# keep this note');
    expect(text).toContain('goal: ganon');
    const again = readItemPlando(YamlDocument.parse(text).get(GAME, 'plando_items')).entries;
    expect(again).toHaveLength(3);
    expect(again[1]).toMatchObject({ world: true, fromPool: false, force: true, count: 2, percentage: 50 });
    expect(again[2]).toMatchObject({ items: { type: 'names', names: ['Bow'] }, locations: ['Sanctuary'] });
  });

  it('removing the last entry removes the option', () => {
    const doc = YamlDocument.parse(ITEMS);
    doc.apply(plandoEdit(GAME, 'plando_items', []));
    expect(doc.has(GAME, 'plando_items')).toBe(false);
  });
});

describe('connection plando', () => {
  const TEXT = `name: T\ngame: A Link to the Past\nA Link to the Past:\n  plando_connections:\n    - entrance: Links House\n      exit: Hyrule Castle Main Gate\n    - entrance: Sanctuary\n      exit: Skull Woods Final Section\n      direction: exit\n      percentage: 40\n`;

  it('reads and writes entries', () => {
    const { entries } = readConnectionPlando(YamlDocument.parse(TEXT).get(GAME, 'plando_connections'));
    expect(entries[0]).toMatchObject({ entrance: 'Links House', exit: 'Hyrule Castle Main Gate', direction: 'both', percentage: null, editable: true });
    expect(entries[1]).toMatchObject({ direction: 'exit', percentage: 40 });
    expect(connectionPlandoToPlain(entries[0]!)).toEqual({ entrance: 'Links House', exit: 'Hyrule Castle Main Gate' });
    expect(connectionPlandoToPlain(entries[1]!)).toEqual({ entrance: 'Sanctuary', exit: 'Skull Woods Final Section', direction: 'exit', percentage: 40 });
  });

  it('keeps entries it cannot show exactly as they were', () => {
    const odd: unknown[] = [{ entrance: ['A', 'B'], exit: 'C' }, { entrance: 'A', exit: 'B', direction: 'sideways' }, 'x'];
    for (const entry of odd) {
      const [read] = readConnectionPlando([entry]).entries;
      expect(read!.editable).toBe(false);
      expect(connectionPlandoToPlain(read!)).toBe(entry);
    }
  });

  it('adds an entry through the document', () => {
    const doc = YamlDocument.parse('name: T\ngame: A Link to the Past\nA Link to the Past: {}\n');
    doc.apply(plandoEdit(GAME, 'plando_connections', [connectionPlandoToPlain(newConnectionPlando('Links House', 'Sanctuary'))]));
    expect(readConnectionPlando(doc.get(GAME, 'plando_connections')).entries[0]).toMatchObject({ entrance: 'Links House', exit: 'Sanctuary' });
  });
});

describe('item plando ranges and lists of worlds', () => {
  it('reads and writes a count range and a list of players', () => {
    const entry = { items: ['Bow', 'Hookshot', 'Fire Rod'], locations: ['A', 'B'], count: { min: 1, max: 2 }, world: ['Alice', 'Bob'] };
    const [read] = readItemPlando([entry]).entries;
    expect(read).toMatchObject({ editable: true, count: { min: 1, max: 2 }, world: ['Alice', 'Bob'] });
    expect(itemPlandoToPlain(read!)).toEqual(entry);
    const onlyMax = readItemPlando([{ item: 'Bow', count: { max: 3 } }]).entries[0]!;
    expect(onlyMax.count).toEqual({ max: 3 });
    expect(itemPlandoToPlain(onlyMax)).toEqual({ items: ['Bow'], count: { max: 3 } });
  });

  it('reads a world of null as everyone', () => {
    const [read] = readItemPlando([{ item: 'Bow', world: null }]).entries;
    expect(read!.world).toBeNull();
    expect((itemPlandoToPlain(read!) as Record<string, unknown>)['world']).toBeNull();
  });
});

describe('text plando', () => {
  const TEXT = 'name: T\ngame: A Link to the Past\nA Link to the Past:\n  plando_texts:\n    - at: sign_north_of_links_house\n      text: Hello there\n    - at: aginah\n      text:\n        - First line\n        - Second line\n      percentage: 30\n';

  it('reads one line as text and several as a list', () => {
    const { entries } = readTextPlando(YamlDocument.parse(TEXT).get(GAME, 'plando_texts'));
    expect(entries[0]).toMatchObject({ at: 'sign_north_of_links_house', text: ['Hello there'], percentage: null, editable: true });
    expect(entries[1]).toMatchObject({ at: 'aginah', text: ['First line', 'Second line'], percentage: 30 });
    expect(textPlandoToPlain(entries[0]!)).toEqual({ at: 'sign_north_of_links_house', text: 'Hello there' });
    expect(textPlandoToPlain(entries[1]!)).toEqual({ at: 'aginah', text: ['First line', 'Second line'], percentage: 30 });
  });

  it('keeps what it cannot show exactly as it was', () => {
    const odd: unknown[] = [{ at: { a: 1, b: 2 }, text: 'x' }, { at: 'aginah', text: { one: 1 } }, 'text', { at: 'aginah', text: 5 }];
    for (const entry of odd) {
      const [read] = readTextPlando([entry]).entries;
      expect(read!.editable, JSON.stringify(entry)).toBe(false);
      expect(textPlandoToPlain(read!)).toBe(entry);
    }
    expect(readTextPlando({ a: 1 }).problem).toMatch(/not a list/);
  });

  it('adds one through the document', () => {
    const doc = YamlDocument.parse('name: T\ngame: A Link to the Past\nA Link to the Past: {}\n');
    doc.apply(plandoEdit(GAME, 'plando_texts', [textPlandoToPlain({ ...newTextPlando('aginah'), text: ['Hi'] })]));
    expect(readTextPlando(doc.get(GAME, 'plando_texts')).entries[0]).toMatchObject({ at: 'aginah', text: ['Hi'] });
  });
});
