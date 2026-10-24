import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../difficulty/testGame';
import type { OptionSchema } from '../schema/types';
import { parseAssignments, parseOptionValue } from './values';

const O = TEST_GAME.options as Record<string, OptionSchema>;
const toggle = O['death_link']!;
const choice = O['mode']!; // easy / normal / hard / off, alias simple -> easy
const lives = O['lives']!; // range 1..9
const balancing = O['balancing']!; // named range 0..100, special names disabled and extreme
const notes = O['notes']!;
const textChoice: OptionSchema = { ...choice, key: 'sprite', kind: 'text_choice', choices: [{ key: 'human', label: 'Human' }, { key: 'duck', label: 'Duck' }] };
const setKind: OptionSchema = { ...notes, key: 'items', kind: 'set' };

const ok = (value: unknown) => ({ ok: true, value });

describe('parseOptionValue', () => {
  it('reads switch words in any case', () => {
    for (const word of ['true', 'ON', 'Yes', 'enabled', '1']) expect(parseOptionValue(toggle, word)).toEqual(ok(true));
    for (const word of ['false', 'OFF', 'no', 'disabled', '0']) expect(parseOptionValue(toggle, word)).toEqual(ok(false));
  });

  it('refuses other switch words and says what is allowed', () => {
    const result = parseOptionValue(toggle, 'maybe');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe('death_link: "maybe" is not a switch value. Use true or false (or on, off, yes, no), or random.');
  });

  it('reads a choice by key or alias, in any case, and refuses others with the list', () => {
    expect(parseOptionValue(choice, 'hard')).toEqual(ok('hard'));
    expect(parseOptionValue(choice, 'HARD')).toEqual(ok('hard'));
    expect(parseOptionValue(choice, 'simple')).toEqual(ok('easy'));
    const result = parseOptionValue(choice, 'brutal');
    expect(!result.ok && result.message).toBe('mode: "brutal" is not one of its choices (easy, normal, hard, off), or random.');
  });

  it('keeps a text choice a free text, using the choice key when it matches one', () => {
    expect(parseOptionValue(textChoice, 'DUCK')).toEqual(ok('duck'));
    expect(parseOptionValue(textChoice, 'Bob')).toEqual(ok('Bob'));
  });

  it('reads whole numbers inside the range and refuses others', () => {
    expect(parseOptionValue(lives, '5')).toEqual(ok(5));
    expect(parseOptionValue(lives, ' 9 ')).toEqual(ok(9));
    expect(parseOptionValue(lives, '0').ok).toBe(false);
    expect(parseOptionValue(lives, '10').ok).toBe(false);
    expect(parseOptionValue(lives, '3.5').ok).toBe(false);
    expect(parseOptionValue(lives, '0x5').ok).toBe(false);
    expect(parseOptionValue(lives, 'many').ok).toBe(false);
    const outside = parseOptionValue(lives, '12');
    expect(!outside.ok && outside.message).toBe('lives: 12 is outside its range 1 to 9.');
  });

  it('reads a named range by number or by its special name', () => {
    expect(parseOptionValue(balancing, '50')).toEqual(ok(50));
    expect(parseOptionValue(balancing, 'EXTREME')).toEqual(ok('extreme'));
    const bad = parseOptionValue(balancing, 'huge');
    expect(!bad.ok && bad.message).toContain('one of disabled, extreme');
  });

  it('accepts Archipelago random forms and writes them in canonical form', () => {
    expect(parseOptionValue(toggle, 'random')).toEqual(ok('random'));
    expect(parseOptionValue(choice, 'Random')).toEqual(ok('random'));
    expect(parseOptionValue(lives, 'random-HIGH')).toEqual(ok('random-high'));
    expect(parseOptionValue(lives, 'random-range-3-7')).toEqual(ok('random-range-3-7'));
    expect(parseOptionValue(lives, 'random-range-7-3')).toEqual(ok('random-range-3-7'));
  });

  it('refuses a random form the option does not accept', () => {
    expect(parseOptionValue(toggle, 'Random').ok).toBe(false); // Archipelago refuses this case on a switch
    expect(parseOptionValue(choice, 'random-low').ok).toBe(false);
    expect(parseOptionValue(lives, 'random-range-0-5').ok).toBe(false); // below the minimum
  });

  it('takes free text as it is, and refuses kinds it cannot set yet', () => {
    expect(parseOptionValue(notes, 'hello world')).toEqual(ok('hello world'));
    const result = parseOptionValue(setKind, 'a,b');
    expect(!result.ok && result.message).toContain('use a JSON array of names');
  });

  it('reads OptionSet arrays, preserving names, validating keys and removing duplicates', () => {
    const exclusions = { ...setKind, validKeys: ['Crabs', 'Hover Blasters'] };
    expect(parseOptionValue(exclusions, '["Crabs","Hover Blasters","Crabs"]')).toEqual(ok(['Crabs', 'Hover Blasters']));
    expect(parseOptionValue(exclusions, '[]')).toEqual(ok([]));
    expect(parseOptionValue(exclusions, '["Not a minigame"]').ok).toBe(false);
    expect(parseOptionValue(exclusions, '[1]').ok).toBe(false);
    expect(parseOptionValue(exclusions, '{}').ok).toBe(false);
    expect(parseOptionValue(setKind, '["a\\u0000b"]').ok).toBe(false);
    expect(parseOptionValue(setKind, '["a,b"]').ok).toBe(true);
  });

  it('refuses text containing characters PyYAML reads as line breaks or controls, which would change or break the YAML', () => {
    for (const bad of ['a\u2028b', 'a\u2029b', 'a\u0085b', 'a\u0000b', 'a\u0007b', 'a\u007fb', 'a\u009fb']) {
      for (const option of [notes, textChoice]) {
        const result = parseOptionValue(option, bad);
        expect(result.ok, `${option.key} ${JSON.stringify(bad)}`).toBe(false);
        expect(!result.ok && result.message).toBe(`${option.key}: the text contains a character that cannot be written safely into a YAML (a control or line-separator character).`);
      }
    }
  });

  it('keeps ordinary text, including punctuation, accents, emoji-free symbols and a line break', () => {
    for (const fine of ['a: b # c', 'caf\u00e9', '12:30', '{x}', '- item', 'a\nb', "it's", '"quoted"', '\u65e5\u672c\u8a9e']) {
      expect(parseOptionValue(notes, fine), JSON.stringify(fine)).toEqual({ ok: true, value: fine });
    }
  });

  it('refuses an empty value', () => {
    expect(parseOptionValue(lives, '  ')).toEqual({ ok: false, message: 'lives: the value is empty.' });
  });
});

describe('parseAssignments', () => {
  it('turns key=value pairs into option values', () => {
    expect(parseAssignments(TEST_GAME, ['death_link=on', 'lives=3', 'mode=Hard'])).toEqual({
      ok: true,
      values: { death_link: true, lives: 3, mode: 'hard' },
    });
  });

  it('keeps an equals sign inside the value, and finds an option in any case', () => {
    expect(parseAssignments(TEST_GAME, ['NOTES=a=b'])).toEqual({ ok: true, values: { notes: 'a=b' } });
  });

  it('refuses things that are not key=value', () => {
    expect(parseAssignments(TEST_GAME, ['death_link'])).toEqual({ ok: false, message: '"death_link" is not key=value.' });
    expect(parseAssignments(TEST_GAME, ['=on'])).toEqual({ ok: false, message: '"=on" is not key=value.' });
  });

  it('refuses an unknown option and suggests close ones', () => {
    const result = parseAssignments(TEST_GAME, ['death=on']);
    expect(result).toEqual({ ok: false, message: 'Test Game has no option "death". Did you mean death_link?' });
    expect(parseAssignments(TEST_GAME, ['zzz=1'])).toEqual({ ok: false, message: 'Test Game has no option "zzz".' });
  });

  it('refuses an option set twice, and a bad value by name', () => {
    expect(parseAssignments(TEST_GAME, ['lives=2', 'lives=3'])).toEqual({ ok: false, message: 'lives is set twice.' });
    const result = parseAssignments(TEST_GAME, ['lives=99']);
    expect(result).toEqual({ ok: false, message: 'lives: 99 is outside its range 1 to 9.' });
  });

  it('accepts an empty list', () => {
    expect(parseAssignments(TEST_GAME, [])).toEqual({ ok: true, values: {} });
  });
});
