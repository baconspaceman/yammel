import { describe, expect, it, vi } from 'vitest';
import { YamlDocument } from '../../model/document';
import { EditError } from '../../model/edits';
import { EditorSession } from './session';

const TEXT = 'name: P\ngame: G\nG:\n  lives: 5\n';

function make(): EditorSession {
  return new EditorSession(YamlDocument.parse(TEXT));
}

describe('EditorSession', () => {
  it('starts clean with nothing to undo or redo', () => {
    const s = make();
    expect(s.dirty).toBe(false);
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.text).toBe(TEXT);
    expect(s.filePath).toBeNull();
  });

  it('applies edits, becomes dirty, and can undo and redo', () => {
    const s = make();
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
    expect(s.doc.get('G', 'lives')).toBe(9);
    expect(s.dirty).toBe(true);
    expect(s.canUndo).toBe(true);

    s.undo();
    expect(s.doc.get('G', 'lives')).toBe(5);
    expect(s.dirty).toBe(false);
    expect(s.canRedo).toBe(true);

    s.redo();
    expect(s.doc.get('G', 'lives')).toBe(9);
  });

  it('a new edit clears the redo history', () => {
    const s = make();
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
    s.undo();
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 2 }]);
    expect(s.canRedo).toBe(false);
  });

  it('ignores edits that change nothing (no undo step, no dirty flag)', () => {
    const s = make();
    s.apply([{ op: 'reset', game: 'G', option: 'absent' }]);
    expect(s.canUndo).toBe(false);
    expect(s.dirty).toBe(false);
    const listener = vi.fn();
    s.subscribe(listener);
    s.apply([{ op: 'reset', game: 'G', option: 'absent' }]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('leaves everything unchanged when an edit throws', () => {
    const s = make();
    expect(() =>
      s.apply([
        { op: 'set', game: 'G', option: 'lives', value: 9 },
        { op: 'setWeights', game: 'G', option: 'lives', weights: {} },
      ]),
    ).toThrow(EditError);
    expect(s.doc.get('G', 'lives')).toBe(5);
    expect(s.canUndo).toBe(false);
  });

  it('notifies subscribers on apply, undo and redo, and stops after unsubscribe', () => {
    const s = make();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
    s.undo();
    s.redo();
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    s.undo();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('changes version on every change so views can re-render', () => {
    const s = make();
    const v0 = s.version;
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
    expect(s.version).toBeGreaterThan(v0);
  });

  it('markSaved records the path and makes the saved text the clean state', () => {
    const s = make();
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
    s.markSaved('C:\\y\\p.yaml', s.text);
    expect(s.filePath).toBe('C:\\y\\p.yaml');
    expect(s.dirty).toBe(false);
    s.undo();
    expect(s.dirty).toBe(true);
  });

  it('stays dirty when more edits were made while the save was in progress', () => {
    const s = make();
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 9 }]);
    const written = s.text; // the text handed to the save
    s.apply([{ op: 'set', game: 'G', option: 'lives', value: 3 }]); // an edit during the save
    s.markSaved('C:\\y\\p.yaml', written);
    expect(s.dirty).toBe(true);
  });

  it('keeps a bounded undo history', () => {
    const s = new EditorSession(YamlDocument.parse(TEXT), null, 3);
    for (let i = 0; i < 6; i += 1) s.apply([{ op: 'set', game: 'G', option: 'lives', value: i + 10 }]);
    let undos = 0;
    while (s.canUndo) {
      s.undo();
      undos += 1;
    }
    expect(undos).toBe(3);
  });
});
