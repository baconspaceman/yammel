import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../model/document';
import type { GameSchema } from '../schema/types';
import { addPreset, captureOptions, parsePresets, presetEdits, readableValue, removePreset } from './presets';
import type { OptionSchema } from '../schema/types';

const GAME = { name: 'Demo', options: { a: {}, b: {}, c: {} } } as unknown as GameSchema;
const ids = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

describe('parsePresets', () => {
  it('drops damaged entries one at a time and keeps the good ones', () => {
    const state = parsePresets({
      presets: [
        { id: '1', name: ' Easy ', game: 'Demo', values: { a: 1 }, savedAt: 'x' },
        { id: '1', name: 'Dup id', game: 'Demo', values: {} },
        { id: '2', name: '', game: 'Demo', values: {} },
        { id: '3', name: 'No game', values: {} },
        { id: '4', name: 'Bad values', game: 'Demo', values: [1, 2] },
        'nonsense',
      ],
    });
    expect(state.presets.map((p) => p.name)).toEqual(['Easy']);
    expect(parsePresets(undefined)).toEqual({ presets: [] });
    expect(parsePresets({ presets: 'x' })).toEqual({ presets: [] });
  });

  it('shortens long names and refuses huge values', () => {
    const big = { id: '9', name: 'x'.repeat(200), game: 'Demo', values: { a: 'y'.repeat(200_000) } };
    expect(parsePresets({ presets: [big] }).presets).toHaveLength(0);
    expect(parsePresets({ presets: [{ ...big, values: { a: 1 } }] }).presets[0]!.name).toHaveLength(60);
  });
});

describe('presetEdits and captureOptions', () => {
  it('only touches options the game has, and leaves the rest alone', () => {
    expect(presetEdits(GAME, { a: 1, zzz: 2 })).toEqual([{ op: 'set', game: 'Demo', option: 'a', value: 1 }]);
  });

  it('captures only what is written in the YAML, including weights', () => {
    const doc = YamlDocument.parse('name: P\ngame: Demo\nDemo:\n  a: 5\n  b:\n    1: 50\n    2: 50\n');
    expect(captureOptions(doc, GAME)).toEqual({ a: 5, b: { 1: 50, 2: 50 } });
  });

  it('a captured preset can be applied back to a fresh YAML', () => {
    const doc = YamlDocument.parse('name: P\ngame: Demo\nDemo:\n  a: 5\n  c: true\n');
    const values = captureOptions(doc, GAME);
    const fresh = YamlDocument.empty('Demo');
    fresh.applyAll(presetEdits(GAME, values));
    expect(captureOptions(fresh, GAME)).toEqual({ a: 5, c: true });
  });
});

describe('readableValue', () => {
  const choice = { kind: 'choice', choices: [{ key: 'a', label: 'A', value: 0 }, { key: 'b', label: 'B', value: 5 }] } as unknown as OptionSchema;
  const toggle = { kind: 'toggle' } as unknown as OptionSchema;

  it('writes a choice by name when the preset stores its number', () => {
    expect(readableValue(choice, 5)).toBe('b');
    expect(readableValue(choice, 'random')).toBe('random');
    expect(readableValue(choice, 9)).toBe(9); // unknown number: written as it came
  });

  it('writes 0/1 and "true"/"false" for a switch as true/false, and leaves "random" alone', () => {
    expect(readableValue(toggle, 1)).toBe(true);
    expect(readableValue(toggle, 0)).toBe(false);
    expect(readableValue(toggle, 'true')).toBe(true);
    expect(readableValue(toggle, 'random')).toBe('random');
  });

  it('every real preset value in the shipped schema ends up a name or a plain value the card can show', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = JSON.parse(readFileSync('data/schema.json', 'utf8')) as { games: Record<string, GameSchema> };
    let numbersLeft = 0;
    for (const game of Object.values(schema.games)) {
      for (const values of Object.values(game.presets)) {
        for (const edit of presetEdits(game, values)) {
          const option = game.options[(edit as { option: string }).option]!;
          if (option.kind === 'choice' && typeof (edit as { value: unknown }).value === 'number') numbersLeft += 1;
        }
      }
    }
    expect(numbersLeft).toBe(0);
  });
});

describe('addPreset / removePreset', () => {
  it('replaces a preset with the same name for the same game, keeps the id, and adds others', () => {
    const make = ids();
    let state = addPreset({ presets: [] }, { name: 'Easy', game: 'Demo', values: { a: 1 }, savedAt: '1' }, make);
    state = addPreset(state, { name: 'easy', game: 'Demo', values: { a: 2 }, savedAt: '2' }, make);
    state = addPreset(state, { name: 'Easy', game: 'Other', values: {}, savedAt: '3' }, make);
    expect(state.presets.map((p) => [p.id, p.game, p.values])).toEqual([
      ['id1', 'Demo', { a: 2 }],
      ['id2', 'Other', {}],
    ]);
    expect(removePreset(state, 'id1').presets.map((p) => p.id)).toEqual(['id2']);
  });
});
