import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../difficulty/testGame';
import type { GameSchema } from '../schema/types';
import { FakeWorldsDeps, schema } from './testCtx';
import { makeZip } from './testZip';
import { Worlds } from './worlds';

const manifest = (game: string): Buffer => makeZip({ 'w/archipelago.json': JSON.stringify({ game }) });
const customGame = (name: string): GameSchema => ({ ...TEST_GAME, name, customFile: undefined });

const TEMPLATE = `name: Player{number}
game: Unloadable World

Unloadable World:
  ################
  # Game Options #
  ################
  difficulty:
    # How hard it is.
    easy: 50
    hard: 0
  death_link:
    'false': 50
    'true': 0
`;

function setup() {
  const deps = new FakeWorldsDeps();
  const worlds = new Worlds(deps, '0.6.7', ['/worlds'], ['/templates']);
  const add = (folder: string, name: string, game: string | null, mtimeMs = 1) =>
    deps.worldFiles.set(folder, [...(deps.worldFiles.get(folder) ?? []), { name, size: 100, mtimeMs, bytes: game === null ? makeZip({ 'w/x.py': '' }) : manifest(game) }]);
  return { deps, worlds, add };
}

describe('Worlds.resolve', () => {
  it('finds a shipped game without looking at any folder', async () => {
    const { worlds, deps } = setup();
    const found = await worlds.resolve(schema, 'Test Game');
    expect(found).toMatchObject({ ok: true, source: 'bundled' });
    expect(deps.scanCalls).toEqual([]);
  });

  it('finds a custom world by its manifest game name, loads only that file, and remembers the result', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'a.apworld', 'Alpha');
    add('/worlds', 'b.apworld', 'Beta');
    deps.scans.set('b.apworld', { games: { Beta: customGame('Beta') }, problem: null });
    const found = await worlds.resolve(schema, 'beta');
    expect(found).toMatchObject({ ok: true, source: 'custom', file: 'b.apworld' });
    expect(deps.scanCalls).toEqual(['/worlds/b.apworld']);
    expect(worlds.filesForEngine()).toEqual(['/worlds/b.apworld']);
    await worlds.resolve(schema, 'Beta');
    expect(deps.scanCalls).toHaveLength(1);
  });

  it('uses the cache across runs until the file changes, and --rescan loads it again', async () => {
    const first = setup();
    first.add('/worlds', 'b.apworld', 'Beta');
    first.deps.scans.set('b.apworld', { games: { Beta: customGame('Beta') }, problem: null });
    await first.worlds.resolve(schema, 'Beta');
    expect(first.deps.cache).not.toBeNull();

    const second = new Worlds(first.deps, '0.6.7', ['/worlds'], ['/templates']);
    await second.resolve(schema, 'Beta');
    expect(first.deps.scanCalls).toHaveLength(1); // read from the cache

    const third = new Worlds(first.deps, '0.6.7', ['/worlds'], ['/templates']);
    await third.resolve(schema, 'Beta', { rescan: true });
    expect(first.deps.scanCalls).toHaveLength(2);

    first.deps.worldFiles.set('/worlds', [{ name: 'b.apworld', size: 100, mtimeMs: 999, bytes: manifest('Beta') }]); // the developer rebuilt it
    const fourth = new Worlds(first.deps, '0.6.7', ['/worlds'], ['/templates']);
    await fourth.resolve(schema, 'Beta');
    expect(first.deps.scanCalls).toHaveLength(3);
  });

  it('throws the cache away when the Archipelago version differs', async () => {
    const { deps, add } = setup();
    add('/worlds', 'b.apworld', 'Beta');
    deps.scans.set('b.apworld', { games: { Beta: customGame('Beta') }, problem: null });
    await new Worlds(deps, '0.6.7', ['/worlds'], []).resolve(schema, 'Beta');
    await new Worlds(deps, '0.6.8', ['/worlds'], []).resolve(schema, 'Beta');
    expect(deps.scanCalls).toHaveLength(2);
  });

  it('falls back to a template when the world file cannot be loaded, and says why', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'u.apworld', 'Unloadable World');
    deps.scans.set('u.apworld', { games: {}, problem: "SyntaxError: f-string: expecting '}'" });
    deps.templates.set('/templates', [{ name: 'Unloadable World.yaml', text: TEMPLATE }]);
    const found = await worlds.resolve(schema, 'Unloadable World');
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.source).toBe('template');
    expect(found.game.inferred).toBe(true);
    expect(found.game.options['difficulty']!.kind).toBe('choice');
    expect(found.note).toContain('f-string');
    expect(worlds.filesForEngine()).toEqual([]); // nothing the check engine could load
  });

  it('falls back to a template when there is no world file at all', async () => {
    const { worlds, deps } = setup();
    deps.templates.set('/templates', [{ name: 'Unloadable World.yaml', text: TEMPLATE }]);
    const found = await worlds.resolve(schema, 'unloadable world');
    expect(found).toMatchObject({ ok: true, source: 'template' });
  });

  it('reads an explicit template (advanced) even when a world file exists', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'u.apworld', 'Unloadable World');
    deps.templates.set('/mine', [{ name: 'draft.yaml', text: TEMPLATE }]);
    const found = await worlds.resolve(schema, 'Unloadable World', { template: '/mine/draft.yaml' });
    expect(found).toMatchObject({ ok: true, source: 'template' });
    expect(deps.scanCalls).toEqual([]);
  });

  it('searches extra folders (advanced) and only those with noAuto', async () => {
    const { worlds, deps, add } = setup();
    add('/dev', 'new.apworld', 'Brand New');
    add('/worlds', 'old.apworld', 'Old One');
    deps.scans.set('new.apworld', { games: { 'Brand New': customGame('Brand New') }, problem: null });
    deps.scans.set('old.apworld', { games: { 'Old One': customGame('Old One') }, problem: null });
    expect(await worlds.resolve(schema, 'Brand New')).toMatchObject({ ok: false });
    expect(await worlds.resolve(schema, 'Brand New', { folders: ['/dev'] })).toMatchObject({ ok: true, source: 'custom' });
    expect(await worlds.resolve(schema, 'Old One', { folders: ['/dev'], noAuto: true })).toMatchObject({ ok: false });
  });

  it('reports what was tried for a game that does not exist anywhere', async () => {
    const { worlds } = setup();
    const found = await worlds.resolve(schema, 'Nope');
    expect(found.ok).toBe(false);
    if (found.ok) return;
    expect(found.message).toContain('No game called "Nope"');
    expect(found.message).toContain('--template');
    expect(found.tried.join(' ')).toContain('/worlds');
  });

  it('names the load problem when a world file is found, has no template, and cannot be loaded', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'u.apworld', 'Unloadable World');
    deps.scans.set('u.apworld', { games: {}, problem: 'SyntaxError: bad' });
    const found = await worlds.resolve(schema, 'Unloadable World');
    expect(found.ok).toBe(false);
    if (found.ok) return;
    expect(found.message).toContain('could not be loaded: SyntaxError: bad');
    expect(found.message).toContain('Generate Template Options');
  });

  it('matches an old world with no manifest by its file name', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'old_world.apworld', null);
    deps.scans.set('old_world.apworld', { games: { 'Old World': customGame('Old World') }, problem: null });
    expect(await worlds.resolve(schema, 'Old World')).toMatchObject({ ok: true, source: 'custom' });
  });

  it('lists custom games from manifests alone, without loading any', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'a.apworld', 'Alpha');
    add('/worlds', 'b.apworld', 'Test Game'); // shipped: not listed as custom
    const list = await worlds.listCustom({}, schema);
    expect(list.map((c) => c.name)).toEqual(['Alpha']);
    expect(deps.scanCalls).toEqual([]);
  });

  it('loadAll loads every file the shipped data lacks and reports problems', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'a.apworld', 'Alpha');
    add('/worlds', 'b.apworld', 'Beta');
    deps.scans.set('a.apworld', { games: { Alpha: customGame('Alpha') }, problem: null });
    deps.scans.set('b.apworld', { games: {}, problem: 'Needs a newer Archipelago' });
    expect(await worlds.loadAll({}, schema)).toEqual({ loaded: 1, failed: 1 });
    const status = await worlds.status({});
    expect(status.map((s) => [s.file, s.state])).toEqual([['a.apworld', 'loaded'], ['b.apworld', 'problem']]);
  });
});

describe("reusing the Yammel app's custom-world scan", () => {
  it('takes a game the app already loaded without loading it again, and gives the engine its file', async () => {
    const { worlds, deps, add } = setup();
    add('/worlds', 'beta.apworld', 'Beta', 5);
    deps.readAppScan = async () => ({ folder: '/worlds', scannedAt: 10, apVersion: '0.6.8', games: { Beta: { ...customGame('Beta'), customFile: 'beta.apworld' } } });
    expect(await worlds.resolve(schema, 'Beta')).toMatchObject({ ok: true, source: 'custom', file: 'beta.apworld' });
    expect(deps.scanCalls).toEqual([]);
    expect(worlds.filesForEngine()).toEqual(['/worlds/beta.apworld']);
  });

  it('loads the file again when it changed after the scan, or when asked to rescan', async () => {
    const changed = setup();
    changed.add('/worlds', 'beta.apworld', 'Beta', 50);
    changed.deps.scans.set('beta.apworld', { games: { Beta: customGame('Beta') }, problem: null });
    changed.deps.readAppScan = async () => ({ folder: '/worlds', scannedAt: 10, apVersion: '0.6.8', games: { Beta: { ...customGame('Beta'), customFile: 'beta.apworld' } } });
    await changed.worlds.resolve(schema, 'Beta');
    expect(changed.deps.scanCalls).toHaveLength(1);

    const asked = setup();
    asked.add('/worlds', 'beta.apworld', 'Beta', 5);
    asked.deps.scans.set('beta.apworld', { games: { Beta: customGame('Beta') }, problem: null });
    asked.deps.readAppScan = async () => ({ folder: '/worlds', scannedAt: 10, apVersion: '0.6.8', games: { Beta: { ...customGame('Beta'), customFile: 'beta.apworld' } } });
    await asked.worlds.resolve(schema, 'Beta', { rescan: true });
    expect(asked.deps.scanCalls).toHaveLength(1);
  });

  it("does not take a game whose file is gone from the app's folder", async () => {
    const { worlds, deps } = setup();
    deps.readAppScan = async () => ({ folder: '/worlds', scannedAt: 10, apVersion: '0.6.8', games: { Beta: { ...customGame('Beta'), customFile: 'beta.apworld' } } });
    expect(await worlds.resolve(schema, 'Beta')).toMatchObject({ ok: false });
  });
});
