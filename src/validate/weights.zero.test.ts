import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import type { GameSchema, OptionSchema, SchemaFile } from '../schema/types';
import { validateDocument } from './validate';

const range: OptionSchema = {
  key: 'clock',
  kind: 'range',
  displayName: 'Clock',
  description: '',
  default: 4,
  visibility: ['template'],
  supportsWeighting: true,
  min: -60,
  max: 60,
};
const odd: OptionSchema = { ...range, key: 'sets', displayName: 'Sets', default: 0, min: 3, max: 28 };
const worded: OptionSchema = { ...range, key: 'gil', displayName: 'Gil', kind: 'named_range', default: 1000, min: 0, max: 51000, specialNames: {}, extraWords: ['individually-randomized'] };
const game: GameSchema = {
  name: 'Clocks',
  hidden: false,
  groups: [{ name: 'Options', collapsed: false, options: ['clock', 'sets', 'gil'] }],
  options: { clock: range, sets: odd, gil: worded },
  presets: {},
  items: [],
  locations: [],
  itemGroups: [],
  locationGroups: [],
};
const schema: SchemaFile = { apVersion: '0.6.8', extractedAt: '', games: { Clocks: game }, errors: [] };
const issues = (body: string) => validateDocument(YamlDocument.parse(`name: P\ngame: Clocks\nClocks:\n${body}`), schema);

describe('weighted values Archipelago never picks', () => {
  it('a value with weight 0 is not checked (Archipelago only reads the value it picks)', () => {
    expect(issues('  clock:\n    4: 50\n    random-range--60-60: 0\n')).toEqual([]);
  });

  it('the same value with a weight above 0 is still reported', () => {
    expect(issues('  clock:\n    4: 50\n    random-range--60-60: 10\n').map((i) => i.code)).toContain('BAD_WEIGHTED_VALUE');
  });

  it('every weight 0 is still an error: Archipelago stops with "weighted as zero"', () => {
    expect(issues('  clock:\n    4: 0\n    5: 0\n').map((i) => i.code)).toContain('ALL_WEIGHTS_ZERO');
  });
});

describe("values the world itself allows", () => {
  it("accepts the world's own default outside the stated range", () => {
    expect(issues('  sets: 0\n')).toEqual([]);
    expect(issues('  sets: 1\n').map((i) => i.code)).toEqual(['BAD_VALUE']);
  });

  it('accepts a word the world lists without a number', () => {
    expect(issues('  gil: individually-randomized\n')).toEqual([]);
    expect(issues('  gil:\n    individually-randomized: 50\n    1000: 50\n')).toEqual([]);
  });
});

describe('meta files', () => {
  it('says a meta.yaml is a meta file rather than asking for a game line', () => {
    const found = validateDocument(YamlDocument.parse('meta_description: x\nnull:\n  progression_balancing:\n    normal: 1\n'), schema);
    expect(found[0]!.message).toContain('meta file');
  });
});
