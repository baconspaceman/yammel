import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YamlDocument } from '../../model/document';
import { parseSchemaFile } from '../../schema/load';
import type { OptionSchema } from '../../schema/types';
import { validateDocument } from '../../validate/validate';
import { addableValues, canWeigh, initialWeights, percentages, setWeightsEdit, valueLabel, weightsOf, weightsProblem } from './weights';

const schema = parseSchemaFile(readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8'));
const alttp = schema.games['A Link to the Past']!;
const toggle = alttp.options['swordless']!;
const choice = alttp.options['goal']!;
const range = alttp.options['crystals_needed_for_ganon']!;
const named = Object.values(schema.games['Stardew Valley']!.options).find((o) => o.kind === 'named_range' && o.specialNames !== undefined)!;

describe('weightsOf', () => {
  it('reads a weights map for a weighable option, and nothing else', () => {
    expect(weightsOf(toggle, { true: 50, false: 25 })).toEqual({ true: 50, false: 25 });
    expect(weightsOf(toggle, true)).toBeNull();
    expect(weightsOf(toggle, {})).toBeNull();
    expect(weightsOf(toggle, { true: 'lots' })).toBeNull();
    expect(weightsOf(toggle, { true: -1 })).toBeNull();
    expect(weightsOf(toggle, { true: 0.5, false: 1 })).toBeNull(); // Archipelago cuts a fractional weight, so the Raw tab handles those
    expect(weightsOf(alttp.options['local_items']!, { a: 1 })).toBeNull(); // sets are not weighted
  });

  it('knows which options can be weighted', () => {
    expect(canWeigh(toggle) && canWeigh(choice) && canWeigh(range)).toBe(true);
    expect(canWeigh(alttp.options['local_items']!)).toBe(false);
    expect(canWeigh({ ...toggle, supportsWeighting: false } as OptionSchema)).toBe(false);
  });
});

describe('initialWeights', () => {
  it('starts a switch at 50/50', () => {
    expect(initialWeights(toggle, true)).toEqual({ true: 50, false: 50 });
  });

  it('starts a choice with the current value and one other', () => {
    const keys = choice.choices!.map((c) => c.key);
    const start = initialWeights(choice, keys[1]);
    expect(Object.keys(start)).toHaveLength(2);
    expect(start[keys[1]!]).toBe(50);
  });

  it('starts a number with its current value and the far end, inside the range', () => {
    expect(initialWeights(range, 3)).toEqual({ '3': 50, '0': 50 });
    expect(initialWeights(range, undefined)).toEqual({ '7': 50, '0': 50 });
    expect(initialWeights(range, 0)).toEqual({ '0': 50, '7': 50 });
  });

  it('every start is something Archipelago accepts, for every weighable option of every game', () => {
    const problems: string[] = [];
    for (const game of Object.values(schema.games).filter((g) => !g.hidden)) {
      for (const option of Object.values(game.options)) {
        if (!canWeigh(option)) continue;
        const doc = YamlDocument.empty(game.name);
        doc.applyAll([setWeightsEdit(game.name, option, initialWeights(option, undefined))]);
        for (const issue of validateDocument(doc, schema)) problems.push(`${game.name}.${option.key}: ${issue.message}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('addableValues', () => {
  it('lists what is not there yet', () => {
    expect(addableValues(toggle, { true: 1 })).toEqual([{ key: 'false', label: 'Off' }]);
    expect(addableValues(toggle, { true: 1, false: 1 })).toEqual([]);
    const first = choice.choices![0]!;
    expect(addableValues(choice, { [first.key]: 1 }).map((v) => v.key)).not.toContain(first.key);
    expect(addableValues(named, {}).map((v) => v.key)).toEqual(Object.keys(named.specialNames!));
  });
});

describe('labels, percentages and problems', () => {
  it('shows On and Off for a switch and a choice\'s own label', () => {
    expect(valueLabel(toggle, 'true')).toBe('On');
    expect(valueLabel(toggle, 'False')).toBe('Off');
    const c = choice.choices![0]!;
    expect(valueLabel(choice, c.key)).toBe(c.label);
    expect(valueLabel(range, '5')).toBe('5');
  });

  it('turns weights into percentages, and zeros when the total is zero', () => {
    expect(percentages({ a: 1, b: 3 })).toEqual({ a: 25, b: 75 });
    expect(percentages({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });

  it('says why weights cannot be saved', () => {
    expect(weightsProblem({})).toContain('at least one value');
    expect(weightsProblem({ a: 0 })).toContain('above 0');
    expect(weightsProblem({ a: 0, b: 2 })).toBeNull();
  });
});
