import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPatch, DEFAULT_SETTINGS } from '../shared/settings';
import { SettingsStore } from './settingsStore';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'settings-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('starts with the defaults and writes nothing until something is saved', async () => {
    const store = SettingsStore.in(dir);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    expect(await readdir(dir)).toEqual([]);
  });

  it('saves and loads again in a new store', async () => {
    const store = SettingsStore.in(dir);
    await store.load();
    await store.save(applyPatch(store.value, { archipelago: { sourceRoot: 'C:\\ap' }, integrations: { codex: { enabled: true } } }));
    const again = await SettingsStore.in(dir).load();
    expect(again.archipelago.sourceRoot).toBe('C:\\ap');
    expect(again.integrations.codex.enabled).toBe(true);
    expect(await readdir(dir)).toEqual(['settings.json']); // no temp file left behind
  });

  it('survives a damaged, empty or oversized file by using the defaults', async () => {
    for (const text of ['{ not json', '', '[]', 'x'.repeat(70 * 1024)]) {
      await writeFile(join(dir, 'settings.json'), text);
      expect(await SettingsStore.in(dir).load()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('cleans what it saves, so a file never holds unknown fields or secrets', async () => {
    const store = SettingsStore.in(dir);
    await store.save({ ...DEFAULT_SETTINGS, apiKey: 'sk-secret' } as never);
    expect(await readFile(join(dir, 'settings.json'), 'utf8')).not.toContain('sk-secret');
  });

  it('keeps the old value when saving fails', async () => {
    const blocked = SettingsStore.in(join(dir, 'file-not-folder'));
    await writeFile(join(dir, 'file-not-folder'), 'x'); // a file where the folder should be
    await expect(blocked.save(applyPatch(DEFAULT_SETTINGS, { archipelago: { sourceRoot: 'C:\\x' } }))).rejects.toBeDefined();
    expect(blocked.value).toEqual(DEFAULT_SETTINGS);
  });

  it('hands out copies, so callers cannot change the stored value by accident', async () => {
    const store = SettingsStore.in(dir);
    store.value.archipelago.sourceRoot = 'oops';
    expect(store.value.archipelago.sourceRoot).toBeNull();
  });
});
