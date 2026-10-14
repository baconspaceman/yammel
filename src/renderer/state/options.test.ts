import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchemaFile } from '../../schema/load';
import type { OptionSchema } from '../../schema/types';
import {
  describeOption,
  formatDefault,
  parseWholeNumber,
  resetOption,
  searchGames,
  setOption,
  simpleGroups,
  summarizeValue,
} from './options';

const ALL = ['template', 'simple_ui', 'complex_ui', 'spoiler'] as const;

function opt(partial: Partial<OptionSchema> & Pick<OptionSchema, 'kind'>): OptionSchema {
  return {
    key: 'thing',
    displayName: 'Thing',
    description: 'A thing.',
    default: false,
    visibility: [...ALL],
    supportsWeighting: true,
    ...partial,
  };
}

const toggle = opt({ kind: 'toggle', default: false });
const choice = opt({
  kind: 'choice',
  default: 'easy',
  choices: [
    { key: 'easy', label: 'easy' },
    { key: 'hard', label: 'hard' },
    { key: 'off', label: 'off' },
  ],
  aliases: { difficult: 'hard' },
});
const range = opt({ kind: 'range', default: 5, min: 1, max: 10 });
const named = opt({ kind: 'named_range', default: 50, min: 0, max: 100, specialNames: { none: 0, all: 100 } });
const text = opt({ kind: 'free_text', default: 'hello' });
const textChoice = opt({ kind: 'text_choice', default: 'a', choices: [{ key: 'a', label: 'a' }] });
const setKind = opt({ kind: 'set', default: [], domain: 'items' });

describe('describeOption: absent values', () => {
  it('shows the default and is editable and unchanged', () => {
    for (const o of [toggle, choice, range, named, text, textChoice]) {
      const s = describeOption(o, undefined);
      expect(s.present).toBe(false);
      expect(s.value).toEqual(o.default);
      expect(s.editable).toBe(true);
      expect(s.changed).toBe(false);
    }
  });
});

describe('describeOption: toggle', () => {
  it('reads booleans and marks a non-default as changed', () => {
    expect(describeOption(toggle, true)).toMatchObject({ value: true, editable: true, changed: true });
    expect(describeOption(toggle, false)).toMatchObject({ value: false, editable: true, changed: false });
  });
  it('is not editable for random or odd text', () => {
    const s = describeOption(toggle, 'random');
    expect(s.editable).toBe(false);
    expect(s.note).toContain('random');
  });
});

describe('describeOption: choice', () => {
  it('reads a key, an alias and different capitalisation', () => {
    expect(describeOption(choice, 'hard')).toMatchObject({ value: 'hard', editable: true, changed: true });
    expect(describeOption(choice, 'difficult')).toMatchObject({ value: 'hard', editable: true });
    expect(describeOption(choice, 'HARD')).toMatchObject({ value: 'hard', editable: true });
  });
  it('maps YAML booleans back to a choice named off/on/yes/no', () => {
    expect(describeOption(choice, false)).toMatchObject({ value: 'off', editable: true });
  });
  it('is not editable for unknown text, random, or weights', () => {
    expect(describeOption(choice, 'banana').editable).toBe(false);
    expect(describeOption(choice, 'random').note).toContain('random');
    const weighted = describeOption(choice, { easy: 50, hard: 50 });
    expect(weighted.editable).toBe(false);
    expect(weighted.note).toContain('weighted');
    expect(weighted.changed).toBe(true);
  });
});

describe('describeOption: range and named range', () => {
  it('reads numbers and warns when outside the range', () => {
    expect(describeOption(range, 7)).toMatchObject({ value: 7, editable: true, changed: true });
    const out = describeOption(range, 99);
    expect(out.editable).toBe(true);
    expect(out.warning).toContain('between 1 and 10');
  });
  it('rejects fractions and text', () => {
    expect(describeOption(range, 2.5).editable).toBe(false);
    expect(describeOption(range, 'random-low').editable).toBe(false);
  });
  it('named range accepts a number or one of its names', () => {
    expect(describeOption(named, 20)).toMatchObject({ value: 20, editable: true });
    expect(describeOption(named, 'all')).toMatchObject({ value: 'all', editable: true });
    expect(describeOption(named, 'ALL')).toMatchObject({ value: 'all', editable: true });
    expect(describeOption(named, 'weird').editable).toBe(false);
  });
});

describe('describeOption: text and unsupported kinds', () => {
  it('free text and text choice accept strings', () => {
    expect(describeOption(text, 'world')).toMatchObject({ value: 'world', editable: true, changed: true });
    expect(describeOption(textChoice, 'custom')).toMatchObject({ value: 'custom', editable: true });
  });
  it('sets and other kinds are shown but not editable in simple mode', () => {
    const s = describeOption(setKind, ['Key']);
    expect(s.editable).toBe(false);
    expect(s.note).toContain('Raw tab');
    expect(s.changed).toBe(true);
  });
});

describe('edit builders and number parsing', () => {
  it('builds set and reset edits', () => {
    expect(setOption('G', range, 4)).toEqual({ op: 'set', game: 'G', option: 'thing', value: 4 });
    expect(resetOption('G', range)).toEqual({ op: 'reset', game: 'G', option: 'thing' });
  });
  it('parses whole numbers inside a range', () => {
    expect(parseWholeNumber(' 7 ', 1, 10)).toEqual({ ok: true, value: 7 });
    expect(parseWholeNumber('-3', -5, 5)).toEqual({ ok: true, value: -3 });
    expect(parseWholeNumber('', 1, 10)).toMatchObject({ ok: false });
    expect(parseWholeNumber('2.5', 1, 10)).toMatchObject({ ok: false, message: 'Enter a whole number.' });
    expect(parseWholeNumber('11', 1, 10)).toMatchObject({ ok: false, message: 'Must be between 1 and 10.' });
  });
  it('summarizes values compactly', () => {
    expect(summarizeValue('abc')).toBe('abc');
    expect(summarizeValue({ a: 1 })).toBe('{"a":1}');
    expect(summarizeValue('x'.repeat(300)).length).toBeLessThanOrEqual(121);
  });
});

describe('searching', () => {
  const fixture = parseSchemaFile(
    readFileSync(new URL('../../../tests/fixtures/mini-schema.json', import.meta.url), 'utf8'),
  );
  const game = fixture.games['Demo Game']!;

  it('lists the simple-mode options of each group', () => {
    const groups = simpleGroups(game, '');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.options.map((o) => o.key)).toEqual(['difficulty', 'lives', 'hard_mode']);
  });
  it('hides options that are not visible in simple mode', () => {
    const copy = structuredClone(game);
    copy.options['lives']!.visibility = ['template'];
    expect(simpleGroups(copy, '')[0]!.options.map((o) => o.key)).toEqual(['difficulty', 'hard_mode']);
  });
  it('filters by every word in name, key or description and drops empty groups', () => {
    expect(simpleGroups(game, 'hard')[0]!.options.map((o) => o.key)).toEqual(['difficulty', 'hard_mode']);
    expect(simpleGroups(game, 'starting lives')[0]!.options.map((o) => o.key)).toEqual(['lives']);
    expect(simpleGroups(game, 'zzz')).toEqual([]);
  });
  it('finds games by name, case-insensitively, hiding hidden games', () => {
    const copy = structuredClone(fixture);
    copy.games['Secret'] = { ...structuredClone(game), name: 'Secret', hidden: true };
    expect(searchGames(copy, 'demo').map((g) => g.name)).toEqual(['Demo Game']);
    expect(searchGames(copy, '').map((g) => g.name)).toEqual(['Demo Game']);
  });
});

describe('formatDefault', () => {
  it('describes defaults in plain words', () => {
    expect(formatDefault(opt({ kind: 'toggle', default: true }))).toBe('On');
    expect(formatDefault(opt({ kind: 'toggle', default: false }))).toBe('Off');
    expect(formatDefault(choice)).toBe('easy');
    expect(formatDefault(opt({ ...choice, default: 'hard', choices: [{ key: 'hard', label: 'Hard Mode' }] }))).toBe('Hard Mode');
    expect(formatDefault(range)).toBe('5');
    expect(formatDefault(text)).toBe('hello');
  });
  it('says nothing for empty text and for kinds Simple mode cannot edit', () => {
    expect(formatDefault(opt({ kind: 'free_text', default: '' }))).toBeNull();
    expect(formatDefault(setKind)).toBeNull();
  });
});

describe('named range with special values outside min..max', () => {
  const grubs = opt({ kind: 'named_range', default: 46, min: 1, max: 46, specialNames: { all: -1 } });
  const costs = opt({ kind: 'named_range', default: -1, min: 5, max: 99, specialNames: { default: -1 } });

  it('shows a number equal to a special value as that name, with no range warning', () => {
    const s = describeOption(grubs, -1);
    expect(s).toMatchObject({ value: 'all', editable: true, changed: true });
    expect(s.warning).toBeUndefined();
  });
  it('still warns for a number that is neither in range nor special', () => {
    expect(describeOption(grubs, -7).warning).toContain('between 1 and 46');
  });
  it('shows the special name for an absent option whose default is a special value', () => {
    expect(describeOption(costs, undefined)).toMatchObject({ value: 'default', editable: true, changed: false, present: false });
    expect(describeOption(grubs, undefined)).toMatchObject({ value: 46, changed: false });
  });
  it('does not mark a present special value as changed when it is the default', () => {
    expect(describeOption(costs, -1)).toMatchObject({ value: 'default', changed: false });
  });
  it('formats a special default as its name and number', () => {
    expect(formatDefault(costs)).toBe('default (-1)');
    expect(formatDefault(grubs)).toBe('46');
    expect(formatDefault(opt({ kind: 'named_range', default: 46, min: 1, max: 46, specialNames: { all: 46 } }))).toBe('all (46)');
  });
});

describe('random detection depends on the kind', () => {
  it('never treats free text as random', () => {
    const s = describeOption(text, 'Randomizer fan');
    expect(s).toMatchObject({ value: 'Randomizer fan', editable: true });
    expect(describeOption(text, 'random').editable).toBe(true);
  });
  it('treats only the exact word as random for a text choice', () => {
    expect(describeOption(textChoice, 'Randomizer fan').editable).toBe(true);
    expect(describeOption(textChoice, 'random_thing').editable).toBe(true);
    expect(describeOption(textChoice, ' Random ').editable).toBe(false);
  });
  it('keeps the prefix rule for toggle, choice, range and named range', () => {
    for (const o of [toggle, choice, range, named]) {
      expect(describeOption(o, 'random-low').editable).toBe(false);
      expect(describeOption(o, 'Random').editable).toBe(false);
    }
  });
  it('shows a choice whose real key starts with random', () => {
    const c = opt({ kind: 'choice', default: 'random_balanced', choices: [{ key: 'random_balanced', label: 'x' }, { key: 'a', label: 'a' }] });
    expect(describeOption(c, 'random_balanced')).toMatchObject({ value: 'random_balanced', editable: true, changed: false });
  });
});
