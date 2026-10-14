import { describe, expect, it } from 'vitest';
import { isSendableSnapshot, MAX_ACTION_TEXT, parseHelperAction } from './popout';

describe('parseHelperAction', () => {
  it('accepts exactly the known actions, with only their own fields', () => {
    expect(parseHelperAction({ type: 'send', text: 'make it harder', viaChip: true, extra: 'x' })).toEqual({ type: 'send', text: 'make it harder', viaChip: true });
    expect(parseHelperAction({ type: 'send', text: 'hi' })).toEqual({ type: 'send', text: 'hi', viaChip: false });
    expect(parseHelperAction({ type: 'helper', id: 'codex' })).toEqual({ type: 'helper', id: 'codex' });
    expect(parseHelperAction({ type: 'apply', proposalId: 'p1', sneaky: 1 })).toEqual({ type: 'apply', proposalId: 'p1' });
    expect(parseHelperAction({ type: 'skip', proposalId: 'p1' })).toEqual({ type: 'skip', proposalId: 'p1' });
    expect(parseHelperAction({ type: 'point', game: 'G', option: 'o' })).toEqual({ type: 'point', game: 'G', option: 'o' });
    expect(parseHelperAction({ type: 'clear' })).toEqual({ type: 'clear' });
  });

  it('refuses everything else', () => {
    for (const bad of [null, undefined, 'send', 5, [], {}, { type: 'delete' }, { type: 'send' }, { type: 'send', text: '' }, { type: 'send', text: '   ' }, { type: 'send', text: 5 }, { type: 'apply' }, { type: 'apply', proposalId: 5 }, { type: 'point', game: 'G' }, { type: 'helper', id: '' }]) {
      expect(parseHelperAction(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('refuses text that is too long or has a null character', () => {
    expect(parseHelperAction({ type: 'send', text: 'x'.repeat(MAX_ACTION_TEXT) })).not.toBeNull();
    expect(parseHelperAction({ type: 'send', text: 'x'.repeat(MAX_ACTION_TEXT + 1) })).toBeNull();
    expect(parseHelperAction({ type: 'send', text: 'a\u0000b' })).toBeNull();
    expect(parseHelperAction({ type: 'apply', proposalId: 'p'.repeat(201) })).toBeNull();
  });
});

describe('isSendableSnapshot', () => {
  const ok = { entries: [], starters: [], busy: false, helpers: [], helperId: 'guide', note: '', settled: [] };

  it('accepts a plain snapshot and refuses anything shaped differently', () => {
    expect(isSendableSnapshot(ok)).toBe(true);
    for (const bad of [null, 'x', [], {}, { ...ok, entries: 'x' }, { ...ok, busy: 'no' }, { ...ok, helperId: 5 }, { ...ok, settled: null }]) expect(isSendableSnapshot(bad)).toBe(false);
  });

  it('refuses one that is far too large, or cannot be turned into text', () => {
    expect(isSendableSnapshot({ ...ok, note: 'x'.repeat(2_000_000) })).toBe(false);
    const loop: Record<string, unknown> = { ...ok };
    loop['self'] = loop;
    expect(isSendableSnapshot(loop)).toBe(false);
  });
});
