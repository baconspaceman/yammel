import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import { parseSchemaFile } from '../schema/load';
import { validateDocument } from './validate';
import type { Issue } from './types';

const real = parseSchemaFile(readFileSync(new URL('../../data/schema.json', import.meta.url), 'utf8'));
const AQ = 'APQuest';
const LTTP = 'A Link to the Past';

const aq = (body: string) => `name: P\ngame: ${AQ}\n${AQ}:\n  plando_items:\n${body}`;
const lttp = (body: string) => `name: P\ngame: ${LTTP}\n${LTTP}:\n  plando_connections:\n${body}`;
const check = (text: string): Issue[] => validateDocument(YamlDocument.parse(text), real);
const codes = (text: string) => check(text).filter((issue) => issue.code.startsWith('PLANDO')).map((issue) => issue.code);

function fixed(text: string, code: string): string {
  const doc = YamlDocument.parse(text);
  const issue = validateDocument(doc, real).find((i) => i.code === code)!;
  expect(issue, code).toBeDefined();
  expect(issue.fixes.length, `${code} has a fix`).toBeGreaterThan(0);
  doc.applyAll(issue.fixes[0]!.edits);
  return doc.toString();
}

describe('item plando that Archipelago accepts', () => {
  it('has no problems', () => {
    for (const body of [
      '    - item: Sword\n      location: Bottom Left Chest\n',
      '    - items: [Sword, Hammer]\n      locations: [Bottom Left Chest, Top Middle Chest]\n',
      '    - item: Sword\n',
      '    - items:\n        Sword: 1\n        Hammer: 1\n      locations: [Bottom Left Chest, Top Middle Chest]\n',
      '    - items: [Everything]\n      location: Bottom Left Chest\n',
      '    - item: Sword\n      locations: [Everywhere]\n',
      '    - item: Sword\n      location: early_locations\n',
      '    - item: Sword\n      location: Nowhere Chest\n      world: 2\n', // another player's game: its names cannot be checked here
      '    - item: Sword\n      force: silent\n      from_pool: false\n      percentage: 50\n      count: 1\n',
    ]) {
      expect(codes(aq(body)), body).toEqual([]);
    }
  });
});

describe('item plando that Archipelago stops on', () => {
  it('plando that is not a list or an entry that is not a block', () => {
    expect(codes(`name: P\ngame: ${AQ}\n${AQ}:\n  plando_items: Sword\n`)).toEqual(['PLANDO_NOT_LIST']);
    expect(codes(aq('    - Sword\n'))).toEqual(['PLANDO_ENTRY_NOT_MAP']);
  });

  it('no item', () => {
    expect(codes(aq('    - location: Bottom Left Chest\n'))).toContain('PLANDO_NO_ITEM');
  });

  it('an item that does not exist, with a fix to the closest name', () => {
    const text = aq('    - item: Swrod\n      location: Bottom Left Chest\n');
    expect(codes(text)).toContain('PLANDO_UNKNOWN_ITEM');
    expect(fixed(text, 'PLANDO_UNKNOWN_ITEM')).toContain('item: Sword');
    const listed = aq('    - items: [Swrod, Hammer]\n      locations: [Bottom Left Chest, Top Middle Chest]\n');
    expect(fixed(listed, 'PLANDO_UNKNOWN_ITEM')).toMatch(/Sword/);
    const counted = aq('    - items:\n        Swrod: 2\n      location: Bottom Left Chest\n');
    expect(fixed(counted, 'PLANDO_UNKNOWN_ITEM')).toMatch(/Sword: 2/);
  });

  it('a bad percentage, force or from_pool', () => {
    expect(codes(aq('    - item: Sword\n      percentage: 150\n'))).toContain('PLANDO_PERCENT');
    expect(fixed(aq('    - item: Sword\n      percentage: 150\n'), 'PLANDO_PERCENT')).toContain('percentage: 100');
    expect(codes(aq('    - item: Sword\n      percentage: 12.5\n'))).toContain('PLANDO_PERCENT');
    expect(codes(aq('    - item: Sword\n      force: maybe\n'))).toContain('PLANDO_FORCE');
    expect(fixed(aq('    - item: Sword\n      force: maybe\n'), 'PLANDO_FORCE')).toContain('force: silent');
    expect(codes(aq('    - item: Sword\n      from_pool: sometimes\n'))).toContain('PLANDO_FROM_POOL');
  });

  it('a location that is not a name or list', () => {
    expect(codes(aq('    - item: Sword\n      locations: 5\n'))).toContain('PLANDO_LOCATION_SHAPE');
  });

  it('items of the wrong shape', () => {
    expect(codes(aq('    - items: 7\n      location: Bottom Left Chest\n'))).toContain('PLANDO_ITEMS_SHAPE');
  });
});

describe('item plando that never works as written', () => {
  it('an unknown location is quietly skipped, unless force is true', () => {
    const soft = check(aq('    - item: Sword\n      location: Nowhere Chest\n')).find((i) => i.code === 'PLANDO_UNKNOWN_LOCATION')!;
    expect(soft.severity).toBe('warning');
    const hard = check(aq('    - item: Sword\n      location: Nowhere Chest\n      force: true\n')).find((i) => i.code === 'PLANDO_UNKNOWN_LOCATION')!;
    expect(hard.severity).toBe('error');
  });

  it('suggests the closest location', () => {
    const text = aq('    - item: Sword\n      location: Bottom Left Chst\n');
    expect(fixed(text, 'PLANDO_UNKNOWN_LOCATION')).toContain('location: Bottom Left Chest');
  });

  it('a count above the items named', () => {
    const text = aq('    - items: [Sword, Hammer]\n      locations: [Bottom Left Chest, Top Middle Chest]\n      count: 5\n');
    expect(codes(text)).toContain('PLANDO_COUNT');
    expect(fixed(text, 'PLANDO_COUNT')).toContain('count: 2');
  });
});

describe('connection plando', () => {
  it('accepts connections with names that exist, ignoring capitals', () => {
    expect(codes(lttp("    - entrance: Hyrule Castle Entrance (South)\n      exit: Sanctuary\n"))).toEqual([]);
    expect(codes(lttp("    - entrance: HYRULE CASTLE ENTRANCE (SOUTH)\n      exit: sanctuary\n      direction: exit\n      percentage: 50\n"))).toEqual([]);
  });

  it('stops on missing, unknown or repeated names and a wrong direction', () => {
    expect(codes(lttp('    - entrance: Hyrule Castle Entrance (South)\n'))).toContain('PLANDO_CONNECTION_MISSING');
    expect(codes(lttp('    - entrance: Hyrule Castle Entrance (Soth)\n      exit: Sanctuary\n'))).toContain('PLANDO_UNKNOWN_CONNECTION');
    expect(fixed(lttp('    - entrance: Hyrule Castle Entrance (Soth)\n      exit: Sanctuary\n'), 'PLANDO_UNKNOWN_CONNECTION')).toMatch(/entrance: hyrule castle entrance \(south\)/i);
    const twice = lttp('    - entrance: Hyrule Castle Entrance (South)\n      exit: Sanctuary\n    - entrance: Hyrule Castle Entrance (South)\n      exit: Sanctuary\n');
    expect(codes(twice)).toContain('PLANDO_DUPLICATE');
    expect(codes(lttp('    - entrance: Hyrule Castle Entrance (South)\n      exit: Sanctuary\n      direction: sideways\n'))).toContain('PLANDO_DIRECTION');
    expect(codes(lttp('    - entrance: Hyrule Castle Entrance (South)\n      exit: Sanctuary\n      percentage: often\n'))).toContain('PLANDO_PERCENT');
  });

  it('allows one exit to be used twice where the game allows it', () => {
    const tunic = Object.values(real.games).find((game) => game.options['plando_connections']?.duplicateExits === true)!;
    const option = tunic.options['plando_connections']!;
    const [a, b] = option.entrances!;
    const exit = option.exits![0]!;
    const text = `name: P\ngame: ${tunic.name}\n${tunic.name}:\n  plando_connections:\n    - entrance: ${a}\n      exit: ${exit}\n    - entrance: ${b}\n      exit: ${exit}\n`;
    expect(codes(text)).not.toContain('PLANDO_DUPLICATE');
  });
});

describe('the real data', () => {
  it('every game with connection plando lists its entrances and exits', () => {
    const games = Object.values(real.games).filter((game) => Object.values(game.options).some((o) => o.kind === 'plando_connections'));
    expect(games.length).toBeGreaterThanOrEqual(5);
    for (const game of games) {
      for (const option of Object.values(game.options).filter((o) => o.kind === 'plando_connections')) {
        expect(option.entrances!.length, `${game.name} ${option.key}`).toBeGreaterThan(0);
        expect(option.exits!.length).toBeGreaterThan(0);
      }
    }
  });

  it('never throws on any game with a plando option set to odd values', () => {
    for (const game of Object.values(real.games)) {
      for (const option of Object.values(game.options).filter((o) => o.kind.startsWith('plando'))) {
        for (const value of ['[]', '[1, 2]', '{a: 1}', 'text', '[{}]', '[{item: x}]']) {
          const text = `name: P\ngame: ${game.name}\n${game.name}:\n  ${option.key}: ${value}\n`;
          expect(() => check(text), `${game.name} ${option.key} ${value}`).not.toThrow();
        }
      }
    }
  });
});
