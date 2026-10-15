import { describe, expect, it } from 'vitest';
import { applyPatch, DEFAULT_SETTINGS, parseSettings } from './settings';

describe('the first-run card setting', () => {
  it('starts as not seen', () => {
    expect(DEFAULT_SETTINGS.welcome.seen).toBe(false);
    expect(parseSettings(undefined).welcome.seen).toBe(false);
  });

  it('is read from a saved file, and only an exact true counts', () => {
    expect(parseSettings({ welcome: { seen: true } }).welcome.seen).toBe(true);
    for (const bad of ['true', 1, null, undefined, [true]]) expect(parseSettings({ welcome: { seen: bad } }).welcome.seen).toBe(false);
    expect(parseSettings({ welcome: true }).welcome.seen).toBe(false);
  });

  it('is changed by a patch in both directions, ignores bad values, and leaves everything else alone', () => {
    const start = parseSettings({ appearance: { theme: 'dark' } });
    const seen = applyPatch(start, { welcome: { seen: true } });
    expect(seen.welcome.seen).toBe(true);
    expect(seen.appearance.theme).toBe('dark');
    expect(applyPatch(seen, { welcome: { seen: false } }).welcome.seen).toBe(false);
    expect(applyPatch(seen, { welcome: { seen: 'no' } }).welcome.seen).toBe(true);
    expect(applyPatch(seen, {}).welcome.seen).toBe(true);
    expect(start.welcome.seen).toBe(false); // the input is not changed
  });
});
