import { describe, expect, it } from 'vitest';
import { applyPatch, DEFAULT_SETTINGS, parseSettings, THEME_CHOICES } from './settings';

describe('the look setting', () => {
  it('starts as "same as the computer" and has exactly three choices', () => {
    expect(DEFAULT_SETTINGS.appearance.theme).toBe('system');
    expect(THEME_CHOICES).toEqual(['system', 'light', 'dark']);
  });

  it('is read from a saved file, and anything else becomes "system"', () => {
    expect(parseSettings({ appearance: { theme: 'dark' } }).appearance.theme).toBe('dark');
    expect(parseSettings({ appearance: { theme: 'light' } }).appearance.theme).toBe('light');
    for (const bad of ['purple', 5, null, undefined, ['dark']]) expect(parseSettings({ appearance: { theme: bad } }).appearance.theme).toBe('system');
    expect(parseSettings({ appearance: 'dark' }).appearance.theme).toBe('system');
    expect(parseSettings(undefined).appearance.theme).toBe('system');
  });

  it('is changed by a patch, ignores bad values, and leaves everything else alone', () => {
    const start = parseSettings({ archipelago: { sourceRoot: 'C:\\ap' }, appearance: { theme: 'light' } });
    const dark = applyPatch(start, { appearance: { theme: 'dark' } });
    expect(dark.appearance.theme).toBe('dark');
    expect(dark.archipelago.sourceRoot).toBe('C:\\ap');
    expect(applyPatch(start, { appearance: { theme: 'neon' } }).appearance.theme).toBe('system');
    expect(applyPatch(start, { appearance: {} }).appearance.theme).toBe('light');
    expect(applyPatch(start, {}).appearance.theme).toBe('light');
    expect(start.appearance.theme).toBe('light'); // the input is not changed
  });
});
