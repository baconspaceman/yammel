import { describe, expect, it } from 'vitest';
import { YamlDocument } from './document';
import { changeKey, newTrigger, readTriggers, splitChangeKey, triggersEdit, triggerToPlain } from './triggers';

const GAME = 'A Link to the Past';

const SAMPLE = `name: Tester
game: A Link to the Past
A Link to the Past:
  goal: ganon
  # keep this note
  mode: open
  triggers:
    - option_category: A Link to the Past
      option_name: goal
      option_result: ganon
      percentage: 50
      options:
        A Link to the Past:
          swordless: true
          +start_inventory:
            - Bow
`;

describe('splitChangeKey / changeKey', () => {
  it('reads the + and - merge prefixes', () => {
    expect(splitChangeKey('swordless')).toEqual({ mode: 'set', option: 'swordless' });
    expect(splitChangeKey('+start_inventory')).toEqual({ mode: 'add', option: 'start_inventory' });
    expect(splitChangeKey('-start_inventory')).toEqual({ mode: 'remove', option: 'start_inventory' });
  });

  it('writes them back the same way', () => {
    for (const key of ['swordless', '+start_inventory', '-start_inventory']) expect(changeKey(splitChangeKey(key))).toBe(key);
  });
});

describe('readTriggers', () => {
  it('reads a trigger from a real YAML', () => {
    const doc = YamlDocument.parse(SAMPLE);
    const { triggers, problem } = readTriggers(doc.get(GAME, 'triggers'), GAME);
    expect(problem).toBeNull();
    expect(triggers).toHaveLength(1);
    const trigger = triggers[0]!;
    expect(trigger).toMatchObject({ category: GAME, option: 'goal', result: 'ganon', percentage: 50, editable: true });
    expect(trigger.changes).toEqual([
      { category: GAME, mode: 'set', option: 'swordless', value: true },
      { category: GAME, mode: 'add', option: 'start_inventory', value: ['Bow'] },
    ]);
  });

  it('says nothing is there when there are no triggers', () => {
    expect(readTriggers(undefined, GAME)).toEqual({ triggers: [], problem: null });
    expect(readTriggers(null, GAME)).toEqual({ triggers: [], problem: null });
    expect(readTriggers([], GAME).triggers).toEqual([]);
  });

  it('reports triggers that are not a list, and leaves it at that', () => {
    expect(readTriggers({ a: 1 }, GAME).problem).toMatch(/not a list/);
    expect(readTriggers('x', GAME).triggers).toEqual([]);
  });

  it('treats a trigger that the controls cannot show as not editable', () => {
    const cases: unknown[] = [
      'text',
      { option_name: 'goal', option_result: 'ganon', options: {} }, // no option_category: looks in the wrong place
      { option_category: 'Other Game', option_name: 'goal', option_result: 'ganon', options: {} },
      { option_category: GAME, option_name: { goal: 50 }, option_result: 'ganon', options: {} },
      { option_category: GAME, option_name: 'goal', option_result: ['a', 'b'], options: {} },
      { option_category: GAME, option_name: 'goal', option_result: 'ganon', options: { '': { name: 'x' } } },
      { option_category: GAME, option_name: 'goal', option_result: 'ganon', options: [] },
      { option_category: GAME, option_name: 'goal', option_result: 'ganon', percentage: { 10: 1 }, options: {} },
    ];
    for (const entry of cases) expect(readTriggers([entry], GAME).triggers[0]!.editable, JSON.stringify(entry)).toBe(false);
  });

  it('keeps keys it does not know', () => {
    const entry = { option_category: GAME, option_name: 'goal', option_result: 'ganon', options: {}, note: 'mine' };
    const trigger = readTriggers([entry], GAME).triggers[0]!;
    expect(trigger.extra).toEqual({ note: 'mine' });
    expect((triggerToPlain(trigger) as Record<string, unknown>)['note']).toBe('mine');
  });
});

describe('writing triggers', () => {
  it('writes back an untouched list as the same data', () => {
    const doc = YamlDocument.parse(SAMPLE);
    const { triggers } = readTriggers(doc.get(GAME, 'triggers'), GAME);
    expect(triggers.map(triggerToPlain)).toEqual(doc.get(GAME, 'triggers'));
  });

  it('writes a trigger that is not editable exactly as it was read', () => {
    const odd = { option_name: 'goal', option_result: 'ganon', options: { '': { name: 'x' } }, extra_thing: [1, 2] };
    const [trigger] = readTriggers([odd], GAME).triggers;
    expect(triggerToPlain(trigger!)).toBe(trigger!.raw);
    expect(triggerToPlain(trigger!)).toEqual(odd);
  });

  it('applies through the document: the rest of the file and its comments stay', () => {
    const doc = YamlDocument.parse(SAMPLE);
    const { triggers } = readTriggers(doc.get(GAME, 'triggers'), GAME);
    const next = { ...triggers[0]!, percentage: 25 };
    doc.apply(triggersEdit(GAME, [next]));
    const text = doc.toString();
    expect(text).toContain('# keep this note');
    expect(text).toContain('percentage: 25');
    expect(text).toContain('goal: ganon');
    expect(readTriggers(YamlDocument.parse(text).get(GAME, 'triggers'), GAME).triggers[0]!.percentage).toBe(25);
  });

  it('adds a first trigger to a block that has none', () => {
    const doc = YamlDocument.parse('name: T\ngame: A Link to the Past\nA Link to the Past:\n  goal: ganon\n');
    const added = { ...newTrigger(GAME, 'goal', 'ganon'), changes: [{ category: GAME, mode: 'set' as const, option: 'swordless', value: true }] };
    doc.apply(triggersEdit(GAME, [added]));
    const round = readTriggers(YamlDocument.parse(doc.toString()).get(GAME, 'triggers'), GAME).triggers;
    expect(round).toHaveLength(1);
    expect(round[0]).toMatchObject({ option: 'goal', result: 'ganon', percentage: null, editable: true });
    expect(round[0]!.changes).toEqual(added.changes);
    expect(doc.toString()).not.toContain('percentage');
  });

  it('removing the last trigger removes the key', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply(triggersEdit(GAME, []));
    expect(doc.has(GAME, 'triggers')).toBe(false);
    expect(doc.toString()).toContain('goal: ganon');
  });

  it('writes yes and no as true and false, and numbers as numbers', () => {
    const doc = YamlDocument.parse('name: T\ngame: A Link to the Past\nA Link to the Past: {}\n');
    const trigger = { ...newTrigger(GAME, 'swordless', true), changes: [{ category: GAME, mode: 'set' as const, option: 'pyramid_open', value: 3 }] };
    doc.apply(triggersEdit(GAME, [trigger]));
    expect(doc.toString()).toMatch(/option_result: true/);
    expect(doc.toString()).toMatch(/pyramid_open: 3/);
  });
});
