import { describe, expect, it } from 'vitest';
import { YamlDocument } from './document';
import { EditError } from './edits';
import { EditorSession } from '../renderer/state/session';

const SAMPLE = 'name: P\ngame: Demo Game\nDemo Game:\n  lives: 5\n';

describe('replaceText', () => {
  it('replaces the whole file and keeps the new text exactly as written, comments included', () => {
    const doc = YamlDocument.parse(SAMPLE);
    const text = '# my notes\nname: Q\ngame: Demo Game\nDemo Game:\n  lives: 9 # lots\n';
    doc.applyAll([{ op: 'replaceText', text }]);
    expect(doc.toString()).toBe(text);
    expect(doc.get('Demo Game', 'lives')).toBe(9);
    expect(doc.getMeta('name')).toBe('Q');
  });

  it('refuses text that is not a readable YAML, and changes nothing', () => {
    const doc = YamlDocument.parse(SAMPLE);
    expect(() => doc.applyAll([{ op: 'replaceText', text: 'name: [unclosed\n' }])).toThrow(EditError);
    expect(doc.toString()).toBe(SAMPLE);
  });

  it('cannot be mixed with other edits', () => {
    const doc = YamlDocument.parse(SAMPLE);
    expect(() => doc.applyAll([{ op: 'replaceText', text: SAMPLE }, { op: 'reset', game: 'Demo Game', option: 'lives' }])).toThrow(EditError);
    expect(() => doc.applyAll([{ op: 'reset', game: 'Demo Game', option: 'lives' }, { op: 'replaceText', text: SAMPLE }])).toThrow(EditError);
  });

  it('can repair a file that could not be edited before', () => {
    const doc = YamlDocument.parse('name: [unclosed\n');
    expect(doc.isValid).toBe(false);
    doc.applyAll([{ op: 'replaceText', text: SAMPLE }]);
    expect(doc.isValid).toBe(true);
  });

  it('is one undo step in a session, and does nothing for identical text', () => {
    const session = new EditorSession(YamlDocument.parse(SAMPLE));
    session.apply([{ op: 'replaceText', text: SAMPLE }]);
    expect(session.canUndo).toBe(false);
    session.apply([{ op: 'replaceText', text: SAMPLE.replace('5', '8') }]);
    expect(session.doc.get('Demo Game', 'lives')).toBe(8);
    session.undo();
    expect(session.doc.get('Demo Game', 'lives')).toBe(5);
    expect(session.canUndo).toBe(false);
  });
});

describe('setWeights writes the way people write by hand', () => {
  it('a switch gets true and false keys, numbers get number keys, names stay text, and all read back the same', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.applyAll([{ op: 'setWeights', game: 'Demo Game', option: 'hard_mode', weights: { true: 3, false: 1 } }, { op: 'setWeights', game: 'Demo Game', option: 'lives', weights: { '3': 50, '10': 25 }, numericKeys: true }, { op: 'setWeights', game: 'Demo Game', option: 'difficulty', weights: { easy: 1, hard: 2 } }]);
    const text = doc.toString();
    expect(text).toContain('hard_mode:\n    true: 3\n    false: 1');
    expect(text).toContain('lives:\n    3: 50\n    10: 25');
    expect(text).toContain('difficulty:\n    easy: 1\n    hard: 2');
    expect(text).not.toContain('"');
    const again = YamlDocument.parse(text);
    expect(again.get('Demo Game', 'hard_mode')).toEqual({ true: 3, false: 1 });
    expect(again.get('Demo Game', 'lives')).toEqual({ '3': 50, '10': 25 });
  });

  it('whole-number keys stay text unless the option is a number option (a choice may be named 1)', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.applyAll([{ op: 'setWeights', game: 'Demo Game', option: 'difficulty', weights: { '1': 1, '2': 1 } }]);
    expect(doc.toString()).toContain('"1": 1');
  });

  it('adding a game to the mix also creates its options section, so Archipelago can pick it', () => {
    const doc = YamlDocument.parse('name: P\ngame: Demo Game\nDemo Game: {}\n');
    doc.applyAll([{ op: 'setGameWeights', weights: { 'Demo Game': 50, Other: 50 } }]);
    expect(doc.toString()).toContain('Other: {}');
    doc.applyAll([{ op: 'setGameWeights', weights: { 'Demo Game': 50, Other: 50, Zero: 0 } }]);
    expect(doc.toString()).not.toContain('Zero: {}');
  });

  it('a mix of numbers and names stays as text keys', () => {
    const doc = YamlDocument.parse(SAMPLE);
    doc.applyAll([{ op: 'setWeights', game: 'Demo Game', option: 'lives', weights: { '3': 1, high: 1 } }]);
    expect(YamlDocument.parse(doc.toString()).get('Demo Game', 'lives')).toEqual({ '3': 1, high: 1 });
  });
});
