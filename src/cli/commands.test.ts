import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_GAME } from '../difficulty/testGame';
import { YamlDocument } from '../model/document';
import { withGroup } from '../randomize/testGame';
import type { SchemaFile } from '../schema/types';
import { COMMANDS, findCommand, findGame, MAX_FUZZ } from './commands';
import { accepted, FakeEngine, makeCtx, schema } from './testCtx';
import type { CommandResult, Ctx } from './types';

async function run(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<CommandResult> {
  return findCommand(name)!.run(input, ctx);
}

function okData(result: CommandResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.data;
}

describe('the command table', () => {
  it('has the seven commands, each with a summary, and flag names that are unique', () => {
    expect(COMMANDS.map((c) => c.name)).toEqual(['games', 'options', 'new', 'fuzz', 'count', 'rate', 'schema-refresh']);
    for (const command of COMMANDS) {
      expect(command.summary.length).toBeGreaterThan(20);
      const names = command.flags.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('findGame', () => {
  it('finds a game by exact name, ignoring case, or by one unique part', () => {
    expect(findGame(schema, 'Test Game')).toMatchObject({ ok: true });
    expect(findGame(schema, 'test game')).toMatchObject({ ok: true, game: { name: 'Test Game' } });
    expect(findGame(schema, 'hidden')).toMatchObject({ ok: true, game: { name: 'Hidden World' } });
  });

  it('prefers an exact name over a longer one that contains it', () => {
    expect(findGame(schema, 'Test Game')).toMatchObject({ game: { name: 'Test Game' } });
  });

  it('finds a hidden game, since a world under development often hides itself', () => {
    expect(findGame(schema, 'Hidden World')).toMatchObject({ ok: true, game: { hidden: true } });
  });

  it('refuses an ambiguous or unknown name and suggests close ones', () => {
    const none = findGame(schema, 'Nope');
    expect(none).toEqual({ ok: false, message: 'No game called "Nope" in the schema (Archipelago 0.6.7). Run "games" to list them.' });
    const partial = findGame(schema, 'Test');
    expect(partial.ok).toBe(false);
    expect(!partial.ok && partial.message).toContain('Did you mean: "Test Game", "Test Game Two"?');
  });
});

describe('games and options', () => {
  it('lists visible games with their counts and rating source, and hidden ones only on request', async () => {
    const { ctx } = makeCtx();
    const normal = okData(await run('games', {}, ctx));
    expect((normal['games'] as { name: string }[]).map((g) => g.name)).toEqual(['Test Game', 'Test Game Two']);
    expect(normal).toMatchObject({ apVersion: '0.6.7', count: 2 });
    expect((normal['games'] as Record<string, unknown>[])[0]).toEqual({ name: 'Test Game', hidden: false, options: 5, randomizable: 4, rating: 'rated' });
    const all = okData(await run('games', { hidden: true }, ctx));
    expect(all['count']).toBe(3);
  });

  it('describes a game\'s options, including choices, ranges and whether each can be random', async () => {
    const { ctx } = makeCtx();
    const data = okData(await run('options', { game: 'test game' }, ctx));
    const options = data['options'] as Record<string, unknown>[];
    expect(data['game']).toBe('Test Game');
    expect(options.find((o) => o['key'] === 'mode')).toMatchObject({ kind: 'choice', default: 'normal', choices: ['easy', 'normal', 'hard', 'off'], canBeRandom: true, simple: true });
    expect(options.find((o) => o['key'] === 'lives')).toMatchObject({ kind: 'range', min: 1, max: 9 });
    expect(options.find((o) => o['key'] === 'balancing')).toMatchObject({ specialNames: ['disabled', 'extreme'] });
    expect(options.find((o) => o['key'] === 'notes')).toMatchObject({ kind: 'free_text', canBeRandom: false });
  });

  it('says so for an unknown game', async () => {
    const { ctx } = makeCtx();
    expect(await run('options', { game: 'Nope' }, ctx)).toMatchObject({ ok: false, code: 1 });
  });
});

describe('new', () => {
  it('returns the YAML text when no file is asked for, with the seed it used', async () => {
    const { ctx } = makeCtx();
    const data = okData(await run('new', { game: 'Test Game' }, ctx));
    expect(data).toMatchObject({ game: 'Test Game', name: 'Player', seed: 777, rolled: 0, yaml: 'name: Player\ngame: Test Game\nTest Game: {}\n' });
  });

  it('writes the explicit settings, and refuses a bad one by name', async () => {
    const { ctx } = makeCtx();
    const data = okData(await run('new', { game: 'Test Game', set: ['death_link=on', 'lives=3'], name: 'Ann' }, ctx));
    expect(data['yaml']).toBe('name: Ann\ngame: Test Game\nTest Game:\n  death_link: true\n  lives: 3\n');
    expect(await run('new', { game: 'Test Game', set: ['lives=99'] }, ctx)).toEqual({ ok: false, code: 1, message: 'lives: 99 is outside its range 1 to 9.' });
  });

  it('randomizes repeatably from a seed, never touching what was set or locked', async () => {
    const { ctx } = makeCtx();
    const input = { game: 'Test Game', randomize: true, seed: 5, set: ['mode=hard'], lock: ['lives,balancing'] };
    const a = okData(await run('new', input, ctx));
    const b = okData(await run('new', input, ctx));
    expect(a).toEqual(b);
    expect(a['seed']).toBe(5);
    expect(a['options']).toMatchObject({ mode: 'hard' });
    expect(Object.keys(a['options'] as object)).not.toContain('lives');
    expect(Object.keys(a['options'] as object)).not.toContain('balancing');
  });

  it('only takes seeds from 0 to 4294967295, so two different seeds can never give the same YAML', async () => {
    const { ctx } = makeCtx();
    for (const seed of [-1, 0.5, 4294967296, 1e20, Number.NaN]) {
      expect(await run('new', { game: 'Test Game', seed }, ctx), String(seed)).toEqual({
        ok: false,
        code: 1,
        message: '--seed must be a whole number from 0 to 4294967295.',
      });
    }
    expect(okData(await run('new', { game: 'Test Game', seed: 4294967295 }, ctx))['seed']).toBe(4294967295);
    expect(okData(await run('new', { game: 'Test Game', seed: 0 }, ctx))['seed']).toBe(0);
  });

  it('keeps the difficulty inside a band', async () => {
    const { ctx } = makeCtx();
    const data = okData(await run('new', { game: 'Test Game', randomize: true, band: '6-8', seed: 3 }, ctx));
    const score = (data['difficulty'] as { score: number }).score;
    expect(score).toBeGreaterThanOrEqual(6);
    expect(score).toBeLessThanOrEqual(8);
    expect(await run('new', { game: 'Test Game', randomize: true, band: 'wide' }, ctx)).toMatchObject({ ok: false, code: 1 });
  });

  it('writes to a file, creating its folder, and will not overwrite unless forced', async () => {
    const { ctx, files } = makeCtx();
    const first = okData(await run('new', { game: 'Test Game', out: 'out/a.yaml' }, ctx));
    expect(first['file']).toBe(resolve('out/a.yaml')); // absolute, so it means the same thing to whoever reads it
    expect(first['yaml']).toBeUndefined();
    expect(files.files.get(resolve('out/a.yaml'))).toBe('name: Player\ngame: Test Game\nTest Game: {}\n');
    expect(files.dirs).toEqual([resolve('out')]);
    expect(await run('new', { game: 'Test Game', out: 'out/a.yaml' }, ctx)).toEqual({ ok: false, code: 1, message: `"${resolve('out/a.yaml')}" already exists. Use --force to replace it.` });
    expect(await run('new', { game: 'Test Game', out: 'out/a.yaml', force: true, set: ['lives=2'] }, ctx)).toMatchObject({ ok: true });
    expect(files.files.get(resolve('out/a.yaml'))).toContain('lives: 2');
  });

  it('refuses an unusable name, an unknown lock, and a band without randomize', async () => {
    const { ctx } = makeCtx();
    expect(await run('new', { game: 'Test Game', name: 'x'.repeat(40) }, ctx)).toMatchObject({ ok: false, code: 1 });
    expect(await run('new', { game: 'Test Game', randomize: true, lock: ['nope'] }, ctx)).toMatchObject({ ok: false, message: '--lock: Test Game has no option "nope".' });
    expect(await run('new', { game: 'Test Game', band: '2-4' }, ctx)).toMatchObject({ ok: false, message: '--band only makes sense together with --randomize.' });
  });

  it('can make a YAML for a hidden game', async () => {
    const { ctx } = makeCtx();
    expect(okData(await run('new', { game: 'Hidden World' }, ctx))['game']).toBe('Hidden World');
  });
});

describe('fuzz', () => {
  it('writes N different, valid, repeatable YAMLs with numbered names', async () => {
    const { ctx, files } = makeCtx();
    const data = okData(await run('fuzz', { game: 'Test Game', count: 6, seed: 100, out: 'dir' }, ctx));
    expect(data).toMatchObject({ game: 'Test Game', seed: 100, count: 6, out: resolve('dir'), summary: { written: 6, checked: 0 } });
    const written = [...files.files.keys()].map((path) => basename(path)).sort();
    expect(written).toEqual(['01', '02', '03', '04', '05', '06'].map((n) => `${n}-test-game.yaml`));
    const texts = [...files.files.values()];
    expect(new Set(texts).size).toBeGreaterThan(3); // they differ
    for (const text of texts) expect(YamlDocument.parse(text).isValid).toBe(true);
    const again = makeCtx();
    await run('fuzz', { game: 'Test Game', count: 6, seed: 100, out: 'dir' }, again.ctx);
    expect([...again.files.files.values()]).toEqual(texts); // same seed, same files
    expect((data['files'] as { name: string; seed: number }[]).map((f) => [f.name, f.seed])).toEqual([
      ['Fuzz1', 100], ['Fuzz2', 101], ['Fuzz3', 102], ['Fuzz4', 103], ['Fuzz5', 104], ['Fuzz6', 105],
    ]);
  });

  it('wraps fuzz seeds past the top instead of losing digits, and reports the seed it really used', async () => {
    const { ctx } = makeCtx();
    const data = okData(await run('fuzz', { game: 'Test Game', count: 3, seed: 4294967294, out: 'dir' }, ctx));
    expect((data['files'] as { seed: number }[]).map((f) => f.seed)).toEqual([4294967294, 4294967295, 0]);
    expect(await run('fuzz', { game: 'Test Game', count: 3, seed: 1e20, out: 'd' }, ctx)).toMatchObject({ ok: false, code: 1 });
  });

  it('checks every YAML with the engine when asked, and reports the ones a world refuses', async () => {
    const engine = new FakeEngine((n) => (n === 2 ? { ok: false, reason: 'failed', message: 'world_error: OptionError: bad mix' } : accepted(10 + n)));
    const { ctx } = makeCtx(engine);
    const result = await run('fuzz', { game: 'Test Game', count: 4, out: 'dir', check: true }, ctx);
    expect(result).toMatchObject({ ok: true, exitCode: 2 });
    const data = okData(result);
    expect(data['summary']).toEqual({ written: 4, checked: 4, accepted: 3, refused: 1, unavailable: 0 });
    const files = data['files'] as { check: { ok: boolean; message?: string; checks?: number } }[];
    expect(files[1]!.check).toEqual({ ok: false, reason: 'failed', message: 'world_error: OptionError: bad mix' });
    expect(files[0]!.check).toMatchObject({ ok: true, checks: 11 });
    expect(engine.calls).toHaveLength(4);
    expect(engine.calls[0]!.game).toBe('Test Game');
    expect(engine.stopped).toBe(1);
  });

  it('counts options the engine could not use as a refusal', async () => {
    const engine = new FakeEngine(() => ({ ok: true, checks: 3, items: 3, unresolved: [], invalid: [{ key: 'lives', message: 'nope' }], ms: 1 }));
    const result = await run('fuzz', { game: 'Test Game', count: 2, out: 'dir', check: true }, makeCtx(engine).ctx);
    expect(okData(result)['summary']).toMatchObject({ accepted: 0, refused: 2 });
  });

  it('treats an engine timeout, crash or missing world as the engine being unusable (exit 3), not as a world refusal', async () => {
    for (const message of ['Counting the checks took too long.', 'The check engine stopped unexpectedly.', 'The seed engine does not know the game "Test Game".']) {
      const reason = message.includes('too long') ? 'timeout' : 'failed';
      const engine = new FakeEngine(() => ({ ok: false, reason, message }));
      const { ctx, files } = makeCtx(engine);
      const result = await run('fuzz', { game: 'Test Game', count: 3, out: 'dir', check: true }, ctx);
      expect(result, message).toMatchObject({ ok: false, code: 3 });
      expect(!result.ok && result.message).toContain(message);
      expect(files.files.size).toBe(3);
      expect(engine.calls).toHaveLength(1);
    }
  });

  it('reports the engine as unavailable (exit 3) but still leaves the files it wrote', async () => {
    const engine = new FakeEngine(() => ({ ok: false, reason: 'unavailable', message: 'No Archipelago source folder was found.' }));
    const { ctx, files } = makeCtx(engine);
    const result = await run('fuzz', { game: 'Test Game', count: 3, out: 'dir', check: true }, ctx);
    expect(result).toMatchObject({ ok: false, code: 3, message: 'The YAMLs were written, but they could not be checked: No Archipelago source folder was found.' });
    expect(files.files.size).toBe(3);
    expect(engine.calls).toHaveLength(1); // it stops asking once the engine is known to be unavailable
    expect(engine.stopped).toBe(1);
  });

  it('does not start the engine at all without --check', async () => {
    const engine = new FakeEngine(() => accepted());
    await run('fuzz', { game: 'Test Game', count: 2, out: 'dir' }, makeCtx(engine).ctx);
    expect(engine.calls).toHaveLength(0);
    expect(engine.stopped).toBe(0);
  });

  it('refuses to overwrite existing files unless forced, and writes nothing in that case', async () => {
    const { ctx, files } = makeCtx();
    await run('fuzz', { game: 'Test Game', count: 2, out: 'dir' }, ctx);
    const before = new Map(files.files);
    const result = await run('fuzz', { game: 'Test Game', count: 3, out: 'dir', seed: 9 }, ctx);
    expect(result).toMatchObject({ ok: false, code: 1 });
    expect(!result.ok && result.message).toContain('already exists');
    expect(files.files.size).toBe(before.size);
    expect(okData(await run('fuzz', { game: 'Test Game', count: 3, out: 'dir', seed: 9, force: true }, ctx))['count']).toBe(3);
  });

  it('checks its inputs: count, folder, prefix, band and settings', async () => {
    const { ctx } = makeCtx();
    for (const count of [0, -1, 1.5, MAX_FUZZ + 1]) expect(await run('fuzz', { game: 'Test Game', count, out: 'd' }, ctx)).toMatchObject({ ok: false, code: 1 });
    expect(await run('fuzz', { game: 'Test Game' }, ctx)).toMatchObject({ ok: false, message: '--out is required: the folder to write the YAMLs into.' });
    expect(await run('fuzz', { game: 'Test Game', out: 'd', prefix: 'x'.repeat(20) }, ctx)).toMatchObject({ ok: false, code: 1 });
    expect(await run('fuzz', { game: 'Test Game', out: 'd', band: '9-1' }, ctx)).toMatchObject({ ok: false, code: 1 });
    expect(await run('fuzz', { game: 'Test Game', out: 'd', set: ['lives=0'] }, ctx)).toMatchObject({ ok: false, code: 1 });
  });

  it('keeps explicit settings in every YAML', async () => {
    const { ctx, files } = makeCtx();
    await run('fuzz', { game: 'Test Game', count: 5, out: 'dir', set: ['mode=hard'] }, ctx);
    for (const text of files.files.values()) expect(text).toContain('mode: hard');
  });
});

describe('count', () => {
  const yaml = 'name: P\ngame: Test Game\nTest Game:\n  lives: 4\n  mode:\n    easy: 1\n    hard: 1\n';

  it('asks the engine about the YAML\'s own option values', async () => {
    const engine = new FakeEngine(() => accepted(8));
    const { ctx, files } = makeCtx(engine);
    files.files.set('p.yaml', yaml);
    const data = okData(await run('count', { file: 'p.yaml' }, ctx));
    expect(data).toMatchObject({ file: 'p.yaml', game: 'Test Game', checks: 8, items: 8 });
    expect(engine.calls[0]).toEqual({ game: 'Test Game', options: { lives: 4, mode: { easy: 1, hard: 1 } } });
    expect(engine.stopped).toBe(1);
  });

  it('exits 2 when the world refuses it, and 3 when no engine can run', async () => {
    const refusing = new FakeEngine(() => ({ ok: false, reason: 'failed', message: 'world_error: OptionError: nope' }));
    const a = makeCtx(refusing);
    a.files.files.set('p.yaml', yaml);
    expect(await run('count', { file: 'p.yaml' }, a.ctx)).toMatchObject({ ok: false, code: 2, message: 'world_error: OptionError: nope' });

    const none = new FakeEngine(() => ({ ok: false, reason: 'unavailable', message: 'No engine.' }));
    const b = makeCtx(none);
    b.files.files.set('p.yaml', yaml);
    expect(await run('count', { file: 'p.yaml' }, b.ctx)).toMatchObject({ ok: false, code: 3 });
  });

  it('exits 3 for an engine timeout or crash on count, and 2 only for a real world refusal', async () => {
    for (const [reason, message, code] of [
      ['timeout', 'Counting the checks took too long.', 3],
      ['failed', 'The check engine stopped unexpectedly.', 3],
      ['failed', 'The seed engine does not know the game "Test Game".', 3],
      ['failed', 'world_error: OptionError: nope', 2],
    ] as const) {
      const { ctx, files } = makeCtx(new FakeEngine(() => ({ ok: false, reason, message })));
      files.files.set('p.yaml', 'name: P\ngame: Test Game\nTest Game: {}\n');
      expect(await run('count', { file: 'p.yaml' }, ctx), message).toMatchObject({ ok: false, code });
    }
  });

  it('reports unusable options with exit 2 but still gives the count', async () => {
    const engine = new FakeEngine(() => ({ ok: true, checks: 3, items: 3, unresolved: [], invalid: [{ key: 'lives', message: 'bad' }], ms: 1 }));
    const { ctx, files } = makeCtx(engine);
    files.files.set('p.yaml', yaml);
    expect(await run('count', { file: 'p.yaml' }, ctx)).toMatchObject({ ok: true, exitCode: 2, data: { checks: 3 } });
  });

  it('explains a missing file, a broken YAML, a missing game line and a game it does not know', async () => {
    const { ctx, files } = makeCtx();
    expect(await run('count', { file: 'missing.yaml' }, ctx)).toEqual({ ok: false, code: 1, message: 'The file "missing.yaml" could not be read.' });
    files.files.set('broken.yaml', 'name: P\ngame: [unclosed\n');
    expect(await run('count', { file: 'broken.yaml' }, ctx)).toMatchObject({ ok: false, code: 1 });
    files.files.set('nogame.yaml', 'name: P\n');
    expect(await run('count', { file: 'nogame.yaml' }, ctx)).toEqual({ ok: false, code: 1, message: 'The YAML does not say which game it is for (no "game:" line).' });
    files.files.set('alien.yaml', 'name: P\ngame: Alien\nAlien: {}\n');
    expect(await run('count', { file: 'alien.yaml' }, ctx)).toMatchObject({ ok: false, code: 1 });
  });

  it('wants --game when the YAML names several', async () => {
    const { ctx, files, engine } = makeCtx();
    files.files.set('multi.yaml', 'name: P\ngame:\n  Test Game: 50\n  Test Game Two: 50\nTest Game: {}\nTest Game Two: {}\n');
    expect(await run('count', { file: 'multi.yaml' }, ctx)).toMatchObject({ ok: false, code: 1 });
    expect(okData(await run('count', { file: 'multi.yaml', game: 'Test Game Two' }, ctx))['game']).toBe('Test Game Two');
    expect(engine.calls).toHaveLength(1);
  });
});

describe('rate', () => {
  it('gives the score, the word, where it comes from and what moved it', async () => {
    const { ctx, files } = makeCtx();
    files.files.set('p.yaml', 'name: P\ngame: Test Game\nTest Game:\n  death_link: true\n  mode: hard\n');
    const data = okData(await run('rate', { file: 'p.yaml' }, ctx));
    expect(data).toMatchObject({ source: 'rated', status: 'drafted', score: 7, label: 'Hard', game: 'Test Game' });
    expect((data['moved'] as { option: string }[]).map((m) => m.option)).toEqual(['mode', 'death_link']);
  });

  it('has no score for a game with no rating', async () => {
    const plainSchema: SchemaFile = { ...schema, games: { Plain: withGroup({ ...TEST_GAME, name: 'Plain', options: { notes: TEST_GAME.options['notes']! } }) } };
    const { ctx, files } = makeCtx();
    files.files.set('p.yaml', 'name: P\ngame: Plain\nPlain: {}\n');
    const data = okData(await run('rate', { file: 'p.yaml' }, { ...ctx, schema: plainSchema }));
    expect(data).toMatchObject({ source: 'none', score: null, label: null });
  });
});

describe('schema-refresh', () => {
  it('passes the folder through and reports the summary', async () => {
    const seen: (string | null)[] = [];
    const { ctx } = makeCtx(undefined, async (root) => {
      seen.push(root);
      return { ok: true, summary: 'AP 0.6.7: 81 games, 1 errors', errors: [{ game: 'Broken World', error: 'ImportError: no module named x' }] };
    });
    expect(okData(await run('schema-refresh', { apRoot: 'C:\\ap' }, ctx))).toEqual({
      summary: 'AP 0.6.7: 81 games, 1 errors',
      errors: [{ game: 'Broken World', error: 'ImportError: no module named x' }], // so a world that fails to import says why
    });
    await run('schema-refresh', {}, ctx);
    expect(seen).toEqual(['C:\\ap', null]);
  });

  it('exits 3 when the folder cannot be used', async () => {
    const { ctx, invalidations } = makeCtx(undefined, async () => ({ ok: false, message: 'No Archipelago source folder was found.' }));
    expect(await run('schema-refresh', {}, ctx)).toEqual({ ok: false, code: 3, message: 'No Archipelago source folder was found.' });
    expect(invalidations()).toBe(0); // nothing changed, so nothing is thrown away
  });

  it('tells the context to drop its cached schema and its running engine after a successful refresh', async () => {
    const { ctx, invalidations } = makeCtx();
    expect(invalidations()).toBe(0);
    await run('schema-refresh', {}, ctx);
    expect(invalidations()).toBe(1);
  });
});
