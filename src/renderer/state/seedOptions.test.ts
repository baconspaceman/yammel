import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../../model/document';
import { parseSchemaFile } from '../../schema/load';
import { countKey, engineOptionsFor } from './seedOptions';

const schema = parseSchemaFile(readFileSync(new URL('../../../tests/fixtures/mini-schema.json', import.meta.url), 'utf8'));
const game = schema.games['Demo Game']!;

describe('engineOptionsFor', () => {
  it('collects only the options the YAML actually sets', () => {
    const doc = YamlDocument.parse('name: P\ngame: Demo Game\nDemo Game:\n  lives: 7\n  hard_mode: true\n');
    expect(engineOptionsFor(doc, 'Demo Game', game)).toEqual({ lives: 7, hard_mode: true });
  });

  it('is empty for a YAML with no options', () => {
    expect(engineOptionsFor(YamlDocument.empty('Demo Game'), 'Demo Game', game)).toEqual({});
  });

  it('ignores options the game does not have, and empty values', () => {
    const doc = YamlDocument.parse('game: Demo Game\nDemo Game:\n  lives: 3\n  nope: 1\n  difficulty:\n');
    expect(engineOptionsFor(doc, 'Demo Game', game)).toEqual({ lives: 3 });
  });

  it('leaves plando out, because it cannot change the number of checks', () => {
    const plando = { ...game, options: { ...game.options, plando_items: { key: 'plando_items', kind: 'plando_items' as const, displayName: 'Plando Items', description: '', default: [], visibility: [], supportsWeighting: false } } };
    const doc = YamlDocument.parse('game: Demo Game\nDemo Game:\n  lives: 3\n  plando_items:\n    - item: Sword\n');
    expect(engineOptionsFor(doc, 'Demo Game', plando)).toEqual({ lives: 3 });
  });

  it('passes weighted and random values through as written, so the engine can report them', () => {
    const doc = YamlDocument.parse('game: Demo Game\nDemo Game:\n  lives: random\n  difficulty:\n    easy: 50\n    hard: 50\n');
    expect(engineOptionsFor(doc, 'Demo Game', game)).toEqual({ lives: 'random', difficulty: { easy: 50, hard: 50 } });
  });

  it('reads the block of the chosen game in a multi-game YAML', () => {
    const doc = YamlDocument.parse('game:\n  Demo Game: 50\n  Other: 50\nDemo Game:\n  lives: 2\nOther:\n  lives: 9\n');
    expect(engineOptionsFor(doc, 'Demo Game', game)).toEqual({ lives: 2 });
  });
});

describe('countKey', () => {
  it('is the same for the same options in any order, and differs for different values or games', () => {
    expect(countKey('G', { a: 1, b: 2 })).toBe(countKey('G', { b: 2, a: 1 }));
    expect(countKey('G', { a: 1 })).not.toBe(countKey('G', { a: 2 }));
    expect(countKey('G', { a: 1 })).not.toBe(countKey('H', { a: 1 }));
  });

  it('treats nested objects by content, not by key order', () => {
    expect(countKey('G', { w: { x: 1, y: 2 } })).toBe(countKey('G', { w: { y: 2, x: 1 } }));
  });
});
