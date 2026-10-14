import { describe, expect, it } from 'vitest';
import { EditError } from './edits';
import { YamlDocument } from './document';

const SAMPLE = `# My Archipelago YAML
name: Bacon{NUMBER}
description: A deliberately long description line that is well over eighty characters wide so folding would show up
game: Demo Game
requires:
  version: 0.6.7

Demo Game:
  # how hard it is
  difficulty: hard # I like pain
  lives: 5
  hard_mode: true
  start_inventory:
    Key: 1
    Sword: 2
  local_items: [Key, Sword]

triggers:
  - option_category: Demo Game
    option_name: difficulty
    option_result: hard
    options:
      Demo Game:
        lives: 3
`;

describe('round trip', () => {
  it('writes back exactly what it read when nothing changed', () => {
    expect(YamlDocument.parse(SAMPLE).toString()).toBe(SAMPLE);
  });

  it('keeps comments, long lines and unknown keys after an edit', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'set', game: 'Demo Game', option: 'lives', value: 7 });
    const out = doc.toString();
    expect(out).toContain('# My Archipelago YAML');
    expect(out).toContain('# how hard it is');
    expect(out).toContain('difficulty: hard # I like pain');
    expect(out).toContain('so folding would show up');
    expect(out).toContain('triggers:');
    expect(out).toContain('  lives: 7\n');
  });
});

describe('parse problems', () => {
  it('reports a syntax error with a line number and is not valid', () => {
    const doc = YamlDocument.parse('name: x\nDemo Game: [1, 2\n');
    expect(doc.isValid).toBe(false);
    expect(doc.issues[0]?.line).toBeGreaterThanOrEqual(2);
  });

  it('explains multi-document files instead of losing documents', () => {
    const doc = YamlDocument.parse('name: a\n---\nname: b\n');
    expect(doc.isValid).toBe(false);
    expect(doc.issues[0]?.message).toContain('several YAML documents');
  });

  it('refuses to edit a YAML with errors', () => {
    const doc = YamlDocument.parse('a: [1, 2\n');
    expect(() => doc.apply({ op: 'set', game: 'G', option: 'x', value: 1 })).toThrow(EditError);
  });
});

describe('reading', () => {
  it('finds one game named as a plain string', () => {
    expect(YamlDocument.parse(SAMPLE).games()).toEqual(['Demo Game']);
  });

  it('finds several games named as weights', () => {
    const doc = YamlDocument.parse('game:\n  A: 50\n  B: 50\nA: {}\nB: {}\n');
    expect(doc.games()).toEqual(['A', 'B']);
  });

  it('reads plain, list, map and missing values', () => {
    const doc = YamlDocument.parse(SAMPLE);
    expect(doc.get('Demo Game', 'lives')).toBe(5);
    expect(doc.get('Demo Game', 'hard_mode')).toBe(true);
    expect(doc.get('Demo Game', 'local_items')).toEqual(['Key', 'Sword']);
    expect(doc.get('Demo Game', 'start_inventory')).toEqual({ Key: 1, Sword: 2 });
    expect(doc.get('Demo Game', 'nope')).toBeUndefined();
    expect(doc.has('Demo Game', 'lives')).toBe(true);
    expect(doc.has('Demo Game', 'nope')).toBe(false);
  });
});

describe('editing', () => {
  it('replaces a value and keeps its trailing comment', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'set', game: 'Demo Game', option: 'difficulty', value: 'easy' });
    expect(doc.toString()).toContain('difficulty: easy # I like pain');
  });

  it('adds a missing option to the game block', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'set', game: 'Demo Game', option: 'new_thing', value: false });
    expect(doc.get('Demo Game', 'new_thing')).toBe(false);
    expect(doc.toString()).toMatch(/Demo Game:\n[\s\S]*new_thing: false/);
  });

  it('fills an empty game block', () => {
    const doc = YamlDocument.parse('name: P\ngame: G\nG:\n');
    doc.apply({ op: 'set', game: 'G', option: 'x', value: 1 });
    expect(doc.toString()).toContain('G:\n  x: 1');
  });

  it('creates the game block when it is missing', () => {
    const doc = YamlDocument.parse('name: P\ngame: G\n');
    doc.apply({ op: 'set', game: 'G', option: 'x', value: 'y' });
    expect(doc.get('G', 'x')).toBe('y');
  });

  it('resets an option by removing it, and ignores one that is absent', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'reset', game: 'Demo Game', option: 'lives' });
    expect(doc.has('Demo Game', 'lives')).toBe(false);
    doc.apply({ op: 'reset', game: 'Demo Game', option: 'lives' });
    expect(doc.has('Demo Game', 'hard_mode')).toBe(true);
  });

  it('writes weights as a map', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'setWeights', game: 'Demo Game', option: 'difficulty', weights: { easy: 25, hard: 75 } });
    expect(doc.get('Demo Game', 'difficulty')).toEqual({ easy: 25, hard: 75 });
    expect(doc.toString()).toContain('difficulty:\n    easy: 25\n    hard: 75');
  });

  it('rejects weights that are all zero or negative', () => {
    const doc = YamlDocument.parse(SAMPLE);
    const edit = { op: 'setWeights', game: 'Demo Game', option: 'difficulty' } as const;
    expect(() => doc.apply({ ...edit, weights: { easy: 0, hard: 0 } })).toThrow(EditError);
    expect(() => doc.apply({ ...edit, weights: { easy: -1, hard: 5 } })).toThrow(EditError);
    expect(doc.toString()).toBe(SAMPLE);
  });

  it('applies a batch all-or-nothing', () => {
    const doc = YamlDocument.parse(SAMPLE);
    expect(() =>
      doc.applyAll([
        { op: 'set', game: 'Demo Game', option: 'lives', value: 9 },
        { op: 'setWeights', game: 'Demo Game', option: 'difficulty', weights: {} },
      ]),
    ).toThrow(EditError);
    expect(doc.get('Demo Game', 'lives')).toBe(5);
  });

  it('refuses to write options into a game name that holds a plain value', () => {
    const doc = YamlDocument.parse('name: P\nG: 5\n');
    expect(() => doc.apply({ op: 'set', game: 'G', option: 'x', value: 1 })).toThrow(EditError);
  });
});

describe('reset is consistent with set', () => {
  const reset = { op: 'reset', game: 'G', option: 'x' } as const;

  it.each([
    ['an empty file', ''],
    ['a comment-only file', '# hi\n'],
    ['a missing game block', 'name: P\n'],
    ['a null game block', 'G:\n'],
    ['an absent option', 'G:\n  y: 1\n'],
  ])('is a silent no-op for %s', (_label, text) => {
    const doc = YamlDocument.parse(text);
    expect(() => doc.apply(reset)).not.toThrow();
    expect(doc.toString()).toBe(text);
  });

  it('throws EditError when the game block is a plain value', () => {
    const doc = YamlDocument.parse('G: 5\n');
    expect(() => doc.apply(reset)).toThrow(EditError);
  });

  it('throws EditError when the top level is a list, for reset and set', () => {
    const doc = YamlDocument.parse('- a\n');
    expect(() => doc.apply(reset)).toThrow(EditError);
    expect(() => doc.apply({ op: 'set', game: 'G', option: 'x', value: 1 })).toThrow(EditError);
  });
});

describe('YAML 1.1 reading, as Archipelago (PyYAML) does', () => {
  it('reads unquoted on/off/yes/no as booleans and quoted ones as strings', () => {
    const doc = YamlDocument.parse('G:\n  a: off\n  b: yes\n  c: "off"\n  d: no\n  e: on\n');
    expect(doc.get('G', 'a')).toBe(false);
    expect(doc.get('G', 'b')).toBe(true);
    expect(doc.get('G', 'c')).toBe('off');
    expect(doc.get('G', 'd')).toBe(false);
    expect(doc.get('G', 'e')).toBe(true);
  });

  it('writes the string "off" quoted so it reads back as a string', () => {
    const doc = YamlDocument.parse('G:\n  a: 1\n');
    doc.apply({ op: 'set', game: 'G', option: 'a', value: 'off' });
    doc.apply({ op: 'set', game: 'G', option: 'b', value: 'yes' });
    expect(doc.toString()).toMatch(/a: ["']off["']/);
    const back = YamlDocument.parse(doc.toString());
    expect(back.get('G', 'a')).toBe('off');
    expect(back.get('G', 'b')).toBe('yes');
  });

  it('behaves the same for empty() documents', () => {
    const doc = YamlDocument.empty('G');
    doc.apply({ op: 'set', game: 'G', option: 'a', value: 'off' });
    expect(doc.toString()).toMatch(/a: ["']off["']/);
    expect(YamlDocument.parse(doc.toString()).get('G', 'a')).toBe('off');
  });

  // Known difference: the yaml library's 1.1 mode reads y/n as booleans, PyYAML does not.
  // Pinned here so a library change is noticed; writing the strings quoted is the safe side.
  it('documents how y and n behave in the library 1.1 mode', () => {
    const doc = YamlDocument.parse('G:\n  a: y\n  b: n\n');
    expect([doc.get('G', 'a'), doc.get('G', 'b')]).toEqual([true, false]);
    doc.apply({ op: 'set', game: 'G', option: 'a', value: 'y' });
    expect(YamlDocument.parse(doc.toString()).get('G', 'a')).toBe('y');
  });
});

describe('no-op edits keep the original text', () => {
  it('resetting an absent option leaves the text byte-identical', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'reset', game: 'Demo Game', option: 'nope' });
    expect(doc.toString()).toBe(SAMPLE);
  });

  it('setting an option to its current value leaves the text byte-identical', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'set', game: 'Demo Game', option: 'lives', value: 5 });
    doc.apply({ op: 'set', game: 'Demo Game', option: 'difficulty', value: 'hard' });
    expect(doc.toString()).toBe(SAMPLE);
  });

  it('a no-op edit does not normalise irregular formatting', () => {
    const text = 'G:\n  a:    1   # odd spacing\n\n\n  b: [1,   2]\n';
    const doc = YamlDocument.parse(text);
    doc.apply({ op: 'set', game: 'G', option: 'a', value: 1 });
    doc.apply({ op: 'reset', game: 'G', option: 'nope' });
    expect(doc.toString()).toBe(text);
  });

  it('changing only lives from 5 to 7 replaces exactly that one line', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.apply({ op: 'set', game: 'Demo Game', option: 'lives', value: 7 });
    expect(doc.toString()).toBe(SAMPLE.replace('  lives: 5\n', '  lives: 7\n'));
  });
});

describe('construction', () => {
  it('clone is independent of the original', () => {
    const original = YamlDocument.parse(SAMPLE);
    const copy = original.clone();
    copy.apply({ op: 'set', game: 'Demo Game', option: 'lives', value: 1 });
    expect(original.get('Demo Game', 'lives')).toBe(5);
    expect(copy.get('Demo Game', 'lives')).toBe(1);
  });

  it('empty() makes a parsable YAML for one game that edits cleanly', () => {
    const doc = YamlDocument.empty('Demo Game', 'Bacon');
    doc.apply({ op: 'set', game: 'Demo Game', option: 'lives', value: 3 });
    const reparsed = YamlDocument.parse(doc.toString());
    expect(reparsed.isValid).toBe(true);
    expect(reparsed.games()).toEqual(['Demo Game']);
    expect(reparsed.get('Demo Game', 'lives')).toBe(3);
    expect(doc.toString()).toContain('name: Bacon');
  });

  it('emptyMulti() mixes games at equal weight with an options block for each, and edits cleanly', () => {
    const doc = YamlDocument.emptyMulti(['Alpha', 'Beta', 'Alpha'], 'Mixer');
    expect(doc.games()).toEqual(['Alpha', 'Beta']);
    doc.apply({ op: 'set', game: 'Beta', option: 'lives', value: 2 });
    const reparsed = YamlDocument.parse(doc.toString());
    expect(reparsed.isValid).toBe(true);
    expect(reparsed.games()).toEqual(['Alpha', 'Beta']);
    expect(reparsed.get('Beta', 'lives')).toBe(2);
    expect(doc.toString()).toContain('game:\n  Alpha: 50\n  Beta: 50\n');
  });

  it('emptyMulti() with one game is the same as empty(), and with none is refused', () => {
    expect(YamlDocument.emptyMulti(['Solo'], 'P').toString()).toBe(YamlDocument.empty('Solo', 'P').toString());
    expect(() => YamlDocument.emptyMulti([])).toThrow();
  });
});
