// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseCountRequest } from './countRequest';

describe('parseCountRequest', () => {
  it('accepts a game and a plain options object', () => {
    expect(parseCountRequest({ game: 'APQuest', options: { extra_starting_chest: true, list: [1, 2], map: { a: 1 } } })).toEqual({
      game: 'APQuest',
      options: { extra_starting_chest: true, list: [1, 2], map: { a: 1 } },
    });
  });

  it('accepts empty options', () => {
    expect(parseCountRequest({ game: 'G', options: {} })).toEqual({ game: 'G', options: {} });
  });

  it('rejects anything that is not an object with a game name and options', () => {
    for (const bad of [null, undefined, 'x', 5, [], { options: {} }, { game: 5, options: {} }, { game: '', options: {} }, { game: 'G' }, { game: 'G', options: [] }, { game: 'G', options: null }]) {
      expect(parseCountRequest(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('rejects a game name that is far too long', () => {
    expect(parseCountRequest({ game: 'x'.repeat(201), options: {} })).toBeNull();
  });

  it('rejects too many options or an oversized request', () => {
    const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, 1]));
    expect(parseCountRequest({ game: 'G', options: many })).toBeNull();
    expect(parseCountRequest({ game: 'G', options: { big: 'x'.repeat(250_000) } })).toBeNull();
  });

  it('rejects values that cannot be sent as JSON (functions, symbols, cycles)', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(parseCountRequest({ game: 'G', options: { f: () => 1 } })).toBeNull();
    expect(parseCountRequest({ game: 'G', options: { c: cycle } })).toBeNull();
  });

  it('rejects values nested absurdly deep, but accepts the depth real options use', () => {
    const nest = (levels: number): unknown => {
      let value: unknown = 1;
      for (let i = 0; i < levels; i += 1) value = [value];
      return value;
    };
    expect(parseCountRequest({ game: 'G', options: { ok: nest(6) } })).not.toBeNull();
    expect(parseCountRequest({ game: 'G', options: { deep: nest(40) } })).toBeNull();
    expect(parseCountRequest({ game: 'G', options: { deep: nest(5000) } })).toBeNull();
  });

  it('drops the prototype-pollution keys instead of passing them on', () => {
    const parsed = parseCountRequest(JSON.parse('{"game":"G","options":{"__proto__":{"x":1},"constructor":5,"ok":1}}'));
    expect(parsed).toEqual({ game: 'G', options: { ok: 1 } });
  });
});
