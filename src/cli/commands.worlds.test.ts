import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../difficulty/testGame';
import type { GameSchema } from '../schema/types';
import { findCommand } from './commands';
import { makeCtx } from './testCtx';
import { makeZip } from './testZip';
import type { CommandResult, Ctx } from './types';

async function run(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<CommandResult> {
  return findCommand(name)!.run(input, ctx);
}

function okData(result: CommandResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.data;
}

const TEMPLATE = `name: Player{number}
game: Draft World

Draft World:
  difficulty:
    # How hard it is.
    easy: 50
    hard: 0
  death_link:
    'false': 50
    'true': 0
`;

const custom: GameSchema = { ...TEST_GAME, name: 'Dev World' };

function withWorlds() {
  const made = makeCtx();
  made.worldsDeps.worldFiles.set('/worlds', [{ name: 'dev.apworld', size: 10, mtimeMs: 1, bytes: makeZip({ 'dev/archipelago.json': '{"game":"Dev World"}' }) }]);
  made.worldsDeps.scans.set('dev.apworld', { games: { 'Dev World': custom }, problem: null });
  made.worldsDeps.templates.set('/templates', [{ name: 'Draft World.yaml', text: TEMPLATE }]);
  return made;
}

describe('simple mode (the default): no setup', () => {
  it('a shipped game says it is bundled', async () => {
    const { ctx } = withWorlds();
    expect(okData(await run('options', { game: 'Test Game' }, ctx))).toMatchObject({ game: 'Test Game', gameFrom: 'bundled' });
  });

  it('a custom world in a usual folder is found by name and says it is custom', async () => {
    const { ctx, worldsDeps } = withWorlds();
    const data = okData(await run('options', { game: 'Dev World' }, ctx));
    expect(data).toMatchObject({ game: 'Dev World', gameFrom: 'custom' });
    expect(data['diagnostics']).toBeUndefined(); // simple mode stays short
    expect(worldsDeps.scanCalls).toEqual(['/worlds/dev.apworld']);
  });

  it('an unknown world with a template is handled by the fallback, and the result says so', async () => {
    const { ctx } = withWorlds();
    const data = okData(await run('options', { game: 'Draft World' }, ctx));
    expect(data).toMatchObject({ game: 'Draft World', gameFrom: 'template' });
    expect(String(data['gameNote'])).toContain('template');
    expect((data['options'] as { key: string }[]).map((o) => o.key)).toEqual(['difficulty', 'death_link']);
  });

  it('can make a YAML for a template-only game, but cannot count its checks', async () => {
    const { ctx } = withWorlds();
    const made = okData(await run('new', { game: 'Draft World', set: ['difficulty=hard'] }, ctx));
    expect(String(made['yaml'])).toContain('difficulty: hard');
    const file = '/tmp/draft.yaml';
    await ctx.files.writeText(file, String(made['yaml']), true);
    const counted = await run('count', { file }, ctx);
    expect(counted).toMatchObject({ ok: false, code: 3, data: { reason: 'template-only' } });
    const fuzz = await run('fuzz', { game: 'Draft World', out: '/tmp/f', count: 1, check: true }, ctx);
    expect(fuzz).toMatchObject({ ok: false, code: 3 });
  });

  it('a game that exists nowhere is a plain error that says what to do, not a crash', async () => {
    const { ctx } = withWorlds();
    const result = await run('options', { game: 'Nothing Like It' }, ctx);
    expect(result).toMatchObject({ ok: false, code: 1 });
    expect(!result.ok && result.message).toContain('No game called "Nothing Like It"');
  });

  it('games lists custom worlds from their manifests without loading them', async () => {
    const { ctx, worldsDeps } = withWorlds();
    const data = okData(await run('games', {}, ctx));
    const names = (data['games'] as { name: string; source: string }[]).map((g) => `${g.name}:${g.source}`);
    expect(names).toContain('Dev World:custom');
    expect(names).toContain('Test Game:bundled');
    expect(data['customCount']).toBe(1);
    expect(worldsDeps.scanCalls).toEqual([]);
  });

  it('refuses the developer flags without --advanced', async () => {
    const { ctx } = withWorlds();
    for (const input of [{ game: 'Test Game', rescan: true }, { game: 'Test Game', worlds: ['/x'] }, { game: 'Test Game', template: '/t.yaml' }, { game: 'Test Game', noAuto: true }]) {
      const result = await run('options', input, ctx);
      expect(result).toMatchObject({ ok: false, code: 1 });
      expect(!result.ok && result.message).toContain('Add --advanced');
    }
    expect(await run('worlds', {}, ctx)).toMatchObject({ ok: false, code: 1 });
  });
});

describe('advanced mode: the developer controls', () => {
  it('adds diagnostics: where the game came from and what was tried', async () => {
    const { ctx } = withWorlds();
    const data = okData(await run('options', { game: 'Dev World', advanced: true }, ctx));
    const diagnostics = data['diagnostics'] as Record<string, unknown>;
    expect(diagnostics['file']).toBe('dev.apworld');
    expect(diagnostics['cache']).toBe('/cache/worlds-cache.json');
    expect((diagnostics['tried'] as string[]).join(' ')).toContain('/worlds');
  });

  it('--template reads a draft world from a file of its own', async () => {
    const { ctx, worldsDeps } = withWorlds();
    const drafts = resolve('/drafts');
    worldsDeps.templates.set(drafts, [{ name: 'mine.yaml', text: TEMPLATE }]);
    worldsDeps.fileOverrides.set(resolve('/drafts/mine.yaml'), TEMPLATE);
    const data = okData(await run('options', { game: 'Draft World', advanced: true, template: '/drafts/mine.yaml' }, ctx));
    expect(data).toMatchObject({ gameFrom: 'template' });
  });

  it('--worlds adds a folder, and a failed lookup shows the folders tried', async () => {
    const { ctx, worldsDeps } = withWorlds();
    const mydev = resolve('/mydev'); // the command turns the folder into an absolute path
    worldsDeps.worldFiles.set(mydev, [{ name: 'wip.apworld', size: 1, mtimeMs: 1, bytes: makeZip({ 'wip/archipelago.json': '{"game":"WIP World"}' }) }]);
    worldsDeps.scans.set('wip.apworld', { games: { 'WIP World': { ...TEST_GAME, name: 'WIP World' } }, problem: null });
    expect(okData(await run('options', { game: 'WIP World', advanced: true, worlds: [mydev] }, ctx))).toMatchObject({ gameFrom: 'custom' });
    const miss = await run('options', { game: 'Zzz', advanced: true }, ctx);
    expect(miss).toMatchObject({ ok: false });
    expect(JSON.stringify(!miss.ok ? miss.data : {})).toContain('/worlds');
  });

  it('the worlds command lists every file, its game and whether it loaded; --scan loads them', async () => {
    const { ctx, worldsDeps } = withWorlds();
    worldsDeps.worldFiles.set('/worlds', [
      ...worldsDeps.worldFiles.get('/worlds')!,
      { name: 'broken.apworld', size: 1, mtimeMs: 1, bytes: makeZip({ 'broken/archipelago.json': '{"game":"Broken World"}' }) },
    ]);
    worldsDeps.scans.set('broken.apworld', { games: {}, problem: 'SyntaxError: f-string' });
    const before = okData(await run('worlds', { advanced: true }, ctx));
    expect(before['summary']).toMatchObject({ files: 2, loaded: 0, notLoaded: 2 });
    const after = okData(await run('worlds', { advanced: true, scan: true }, ctx));
    expect(after['scanned']).toEqual({ loaded: 1, failed: 1 });
    const files = after['files'] as { file: string; state: string; problem?: string }[];
    expect(files.find((f) => f.file === 'broken.apworld')).toMatchObject({ state: 'problem', problem: 'SyntaxError: f-string' });
    expect(files.find((f) => f.file === 'dev.apworld')).toMatchObject({ state: 'loaded' });
  });
});
