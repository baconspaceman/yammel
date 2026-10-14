import { describe, expect, it } from 'vitest';
import { applyPatch, cleanPath, DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('gives the defaults for nothing, garbage or the wrong shape', () => {
    for (const raw of [undefined, null, 5, 'x', [], {}, { archipelago: 3, integrations: 'no' }]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('has every extra switched off by default', () => {
    for (const entry of Object.values(DEFAULT_SETTINGS.integrations)) expect(entry.enabled).toBe(false);
  });

  it('keeps good values and drops bad ones one by one', () => {
    const settings = parseSettings({
      archipelago: { sourceRoot: ' C:\\ap ', pythonPath: 'C:\\tools\\evil.exe' },
      integrations: { codex: { enabled: true }, jev: { enabled: 'yes' }, madeUp: { enabled: true } },
    });
    expect(settings.archipelago).toEqual({ sourceRoot: 'C:\\ap', pythonPath: null, customWorldsDir: null });
    expect(settings.integrations.codex.enabled).toBe(true);
    expect(settings.integrations.jev.enabled).toBe(false);
    expect('madeUp' in settings.integrations).toBe(false);
  });

  it('never returns the shared default object', () => {
    const a = parseSettings({});
    a.archipelago.sourceRoot = 'x';
    expect(DEFAULT_SETTINGS.archipelago.sourceRoot).toBeNull();
  });
});

describe('cleanPath', () => {
  it('trims, and treats blanks, non-strings, NUL bytes and huge strings as not set', () => {
    expect(cleanPath('  C:\\a  ')).toBe('C:\\a');
    expect(cleanPath('')).toBeNull();
    expect(cleanPath('   ')).toBeNull();
    expect(cleanPath(null)).toBeNull();
    expect(cleanPath(12)).toBeNull();
    expect(cleanPath('a\u0000b')).toBeNull();
    expect(cleanPath('x'.repeat(2000))).toBeNull();
  });
});

describe('applyPatch', () => {
  it('changes only the fields named, and leaves the input alone', () => {
    const before = parseSettings({ archipelago: { sourceRoot: 'C:\\one', pythonPath: 'C:\\py\\python.exe' } });
    const after = applyPatch(before, { archipelago: { sourceRoot: 'C:\\two' } });
    expect(after.archipelago).toEqual({ sourceRoot: 'C:\\two', pythonPath: 'C:\\py\\python.exe', customWorldsDir: null });
    expect(before.archipelago.sourceRoot).toBe('C:\\one');
  });

  it('clears a path when it is sent as null or blank', () => {
    const before = parseSettings({ archipelago: { sourceRoot: 'C:\\one' } });
    expect(applyPatch(before, { archipelago: { sourceRoot: null } }).archipelago.sourceRoot).toBeNull();
    expect(applyPatch(before, { archipelago: { sourceRoot: '  ' } }).archipelago.sourceRoot).toBeNull();
  });

  it('turns extras on and off, but only with a real boolean', () => {
    const on = applyPatch(DEFAULT_SETTINGS, { integrations: { openRouter: { enabled: true } } });
    expect(on.integrations.openRouter.enabled).toBe(true);
    const unchanged = applyPatch(on, { integrations: { openRouter: { enabled: 'false' } } });
    expect(unchanged.integrations.openRouter.enabled).toBe(true);
    expect(applyPatch(on, { integrations: { openRouter: { enabled: false } } }).integrations.openRouter.enabled).toBe(false);
  });

  it('ignores unknown fields, including anything that looks like a secret', () => {
    const after = applyPatch(DEFAULT_SETTINGS, { apiKey: 'sk-secret', archipelago: { token: 'x' }, version: 9 });
    expect(JSON.stringify(after)).not.toContain('sk-secret');
    expect(after).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores a patch that is not an object', () => {
    expect(applyPatch(DEFAULT_SETTINGS, 'x')).toEqual(DEFAULT_SETTINGS);
    expect(applyPatch(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
  });
});
