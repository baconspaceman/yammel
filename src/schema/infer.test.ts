import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import { inferGameSchema } from './infer';

const TEMPLATE = `name: Player{number}
game: Odd Game
Odd Game:
  ################
  # Game Options #
  ################
  progression_balancing:
    # A system that moves progression earlier.
    #
    # You can define additional values between the minimum and maximum values.
    # Minimum value is 0
    # Maximum value is 99
    random: 0
    random-low: 0 # random value weighted towards lower values
    random-range-0-99: 0 # random value between 0 and 99
    disabled: 0 # equivalent to 0
    normal: 50 # equivalent to 50
    extreme: 0 # equivalent to 99

  accessibility:
    # Set rules for reachability.
    full: 50
    minimal: 0

  death_link:
    'false': 50
    'true': 0

  hearts:
    # Minimum value is 1
    # Maximum value is 20
    3: 50
    random: 0
    random-range-1-20: 0

  ###############
  # Area Access #
  ###############
  closed_forest:
    'on': 0
    deku_only: 0
    'off': 50

  local_items:
    # Forces these items to be in their native world.
    []

  start_inventory:
    {}

  plando_items:
    []
`;

function infer(text: string, game = 'Odd Game') {
  const doc = YamlDocument.parse(text);
  return inferGameSchema(game, doc.templateInfo(game));
}

describe('inferGameSchema', () => {
  const schema = infer(TEMPLATE);

  it('marks the game as read from the file and gives it no names', () => {
    expect(schema.inferred).toBe(true);
    expect(schema.items).toEqual([]);
    expect(schema.locations).toEqual([]);
  });

  it('reads a weighted range with named values from the file', () => {
    const o = schema.options['progression_balancing']!;
    expect(o.kind).toBe('named_range');
    expect([o.min, o.max]).toEqual([0, 99]);
    expect(o.specialNames).toEqual({ disabled: 0, normal: 50, extreme: 99 });
    expect(o.default).toBe(50);
    expect(o.description).toContain('A system that moves progression earlier.');
  });

  it('reads choices, and the heaviest one is the default', () => {
    const o = schema.options['accessibility']!;
    expect(o.kind).toBe('choice');
    expect(o.choices!.map((c) => c.key)).toEqual(['full', 'minimal']);
    expect(o.default).toBe('full');
  });

  it('reads a true/false pair as a toggle', () => {
    const o = schema.options['death_link']!;
    expect(o.kind).toBe('toggle');
    expect(o.default).toBe(false);
  });

  it('reads a plain number range and keeps the written limits', () => {
    const o = schema.options['hearts']!;
    expect(o.kind).toBe('range');
    expect([o.min, o.max, o.default]).toEqual([1, 20, 3]);
  });

  it('keeps on/off words as choices rather than a toggle', () => {
    const o = schema.options['closed_forest']!;
    expect(o.kind).toBe('choice');
    expect(o.choices!.map((c) => c.key)).toEqual(['on', 'deku_only', 'off']);
    expect(o.default).toBe('off');
  });

  it('knows the options every game has', () => {
    expect(schema.options['local_items']).toMatchObject({ kind: 'set', domain: 'items' });
    expect(schema.options['start_inventory']).toMatchObject({ kind: 'counter', domain: 'items' });
    expect(schema.options['plando_items']!.kind).toBe('plando_items');
  });

  it('groups options under the section banners', () => {
    expect(schema.groups.map((g) => g.name)).toEqual(['Game Options', 'Area Access']);
    expect(schema.groups[1]!.options).toEqual(['closed_forest', 'local_items', 'start_inventory', 'plando_items']);
  });

  it('opens a plain file with no template hints, one value per option', () => {
    const plain = infer('name: P\ngame: Plain\nPlain:\n  goal: ganon\n  death_link: true\n  amount: 7\n', 'Plain');
    expect(plain.options['goal']!.kind).toBe('free_text');
    expect(plain.options['death_link']!.kind).toBe('toggle');
    expect(plain.options['amount']!.kind).toBe('range');
    expect(plain.options['amount']!.default).toBe(7);
  });

  it('returns an empty game for a file with no options block', () => {
    const empty = infer('name: P\ngame: Empty\n', 'Empty');
    expect(empty.inferred).toBe(true);
    expect(Object.keys(empty.options)).toEqual([]);
  });
});

const REAL = 'C:/ProgramData/Archipelago/Players/Templates/Ship of Harkinian.yaml';
describe.skipIf(!existsSync(REAL))('a real Archipelago template of a custom world', () => {
  const text = existsSync(REAL) ? readFileSync(REAL, 'utf8') : '';
  const schema = infer(text, 'Ship of Harkinian');

  it('gives every option of the file an editor', () => {
    const doc = YamlDocument.parse(text);
    const keys = doc.templateInfo('Ship of Harkinian').map((o) => o.key);
    expect(Object.keys(schema.options)).toEqual([...new Set(keys)]);
    expect(keys.length).toBeGreaterThan(100);
    const other = Object.values(schema.options).filter((o) => o.kind === 'other').map((o) => o.key);
    expect(other).toEqual([]);
    expect(schema.groups.map((g) => g.name)).toContain('Area Access');
  });
});
