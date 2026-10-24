import { describe, expect, it } from 'vitest';
import { EXIT_CODES, helpPayload, runCli, toPayload } from './run';
import { FakeEngine, makeCtx } from './testCtx';
import { SetupError } from './types';

async function run(argv: string[], setup?: (files: Map<string, string>) => void, engine?: FakeEngine) {
  const made = makeCtx(engine);
  setup?.(made.files.files);
  let out = '';
  const code = await runCli(argv, () => made.ctx, { out: (text) => (out += text) });
  return { code, out, json: JSON.parse(out) as Record<string, unknown>, made };
}

describe('toPayload', () => {
  it('flattens a success into one object and uses its exit code', () => {
    expect(toPayload({ ok: true, data: { a: 1 } })).toEqual({ payload: { ok: true, a: 1 }, exitCode: 0 });
    // a success that still needs attention says so in the JSON too, not only in the process exit code
    expect(toPayload({ ok: true, data: { a: 1 }, exitCode: 2 })).toEqual({ payload: { ok: true, a: 1, exitCode: 2 }, exitCode: 2 });
  });
  it('turns a failure into ok:false with the message, the code and any details', () => {
    expect(toPayload({ ok: false, code: 3, message: 'No engine', data: { files: [] } })).toEqual({
      payload: { ok: false, error: 'No engine', exitCode: 3, files: [] },
      exitCode: 3,
    });
  });
});

describe('runCli', () => {
  it('prints help with every command, its flags and the exit codes, for no arguments or help', async () => {
    for (const argv of [[], ['help'], ['--help'], ['-h']]) {
      const { code, json } = await run(argv);
      expect(code).toBe(0);
      expect(json['ok']).toBe(true);
      expect(json['exitCodes']).toEqual(EXIT_CODES);
      expect((json['commands'] as { name: string }[]).map((c) => c.name)).toEqual(['games', 'options', 'new', 'fuzz', 'count', 'rate', 'worlds', 'schema-refresh']);
    }
    const fuzz = (helpPayload()['commands'] as { name: string; flags: { name: string }[]; argument?: { name: string } }[]).find((c) => c.name === 'fuzz')!;
    expect(fuzz.argument).toEqual({ name: 'game', description: 'the game name', required: true });
    expect(fuzz.flags.map((f) => f.name)).toContain('--check');
  });

  it('prints exactly one JSON line, and indents it with --pretty wherever the flag is', async () => {
    const plain = await run(['games']);
    expect(plain.out.trimEnd().split('\n')).toHaveLength(1);
    const pretty = await run(['games', '--pretty']);
    expect(pretty.out.split('\n').length).toBeGreaterThan(5);
    expect(pretty.json).toEqual(plain.json);
    expect((await run(['--pretty', 'games'])).json).toEqual(plain.json);
  });

  it('runs a command and returns its exit code', async () => {
    const { code, json } = await run(['new', 'Test Game', '--set', 'lives=3', '--seed', '4']);
    expect(code).toBe(0);
    expect(json).toMatchObject({ ok: true, game: 'Test Game', seed: 4 });
    expect(json['yaml']).toContain('lives: 3');
  });

  it('says exactly what is wrong for an unknown command, an unknown flag, a missing argument and a bad value', async () => {
    const unknown = await run(['frobnicate']);
    expect(unknown.code).toBe(1);
    expect(unknown.json['error']).toBe('Unknown command "frobnicate". Commands: games, options, new, fuzz, count, rate, worlds, schema-refresh.');
    expect((await run(['new', 'Test Game', '--speed', '3'])).json['error']).toContain('Unknown flag --speed');
    expect((await run(['new'])).json['error']).toBe('"new" needs a game: the game name.');
    const badValue = await run(['new', 'Test Game', '--set', 'lives=99']);
    expect(badValue.code).toBe(1);
    expect(badValue.json).toMatchObject({ ok: false, error: 'lives: 99 is outside its range 1 to 9.', exitCode: 1 });
  });

  it('exits 2 when a world refused a YAML, with every result still listed', async () => {
    const engine = new FakeEngine((n) => (n === 1 ? { ok: false, reason: 'failed', message: 'world_error: bad mix' } : { ok: true, checks: 5, items: 5, unresolved: [], invalid: [], ms: 1 }));
    const { code, json } = await run(['fuzz', 'Test Game', '--count', '3', '--out', 'dir', '--check'], undefined, engine);
    expect(code).toBe(2);
    expect(json).toMatchObject({ ok: true, exitCode: 2, summary: { written: 3, accepted: 2, refused: 1 } });
  });

  it('exits 3 when the engine cannot run', async () => {
    const engine = new FakeEngine(() => ({ ok: false, reason: 'unavailable', message: 'No Archipelago source folder was found.' }));
    const { code, json } = await run(['count', 'p.yaml'], (files) => files.set('p.yaml', 'name: P\ngame: Test Game\nTest Game: {}\n'), engine);
    expect(code).toBe(3);
    expect(json).toMatchObject({ ok: false, exitCode: 3, error: 'No Archipelago source folder was found.' });
  });

  it('explains one command with --help, without running it', async () => {
    const { code, json } = await run(['fuzz', '--help']);
    expect(code).toBe(0);
    expect(json).toMatchObject({ ok: true, name: 'fuzz', argument: { name: 'game' } });
    expect((json['flags'] as { name: string }[]).map((f) => f.name)).toContain('--check');
    expect((await run(['new', '-h'])).json).toMatchObject({ name: 'new' });
  });

  it('hints how to switch a boolean flag off when an extra word looks like a second argument', async () => {
    const result = await run(['new', 'Test Game', '--randomize', 'false']);
    expect(result.code).toBe(1);
    expect(result.json['error']).toContain('write --flag=false to turn one off');
  });

  it('exits 3 when the schema or the Archipelago folder cannot be set up', async () => {
    let out = '';
    const code = await runCli(['games'], () => {
      throw new SetupError('The game schema was not found. Run "apyaml schema-refresh" first.');
    }, { out: (t) => (out += t) });
    expect(code).toBe(3);
    expect(JSON.parse(out)).toMatchObject({ ok: false, exitCode: 3, error: 'The game schema was not found. Run "apyaml schema-refresh" first.' });

    // the same problem found later, when a command first reads the schema
    const made = makeCtx();
    const lazy = {
      ...made.ctx,
      get schema(): never {
        throw new SetupError('No schema yet.');
      },
    };
    let out2 = '';
    expect(await runCli(['games'], () => lazy as never, { out: (t) => (out2 += t) })).toBe(3);
    expect(JSON.parse(out2)).toMatchObject({ ok: false, exitCode: 3, error: 'No schema yet.' });
  });

  it('reports a schema that cannot be loaded as a usage-level error instead of crashing', async () => {
    let out = '';
    const code = await runCli(['games'], () => {
      throw new Error('data/schema.json is missing. Run schema-refresh.');
    }, { out: (t) => (out += t) });
    expect(code).toBe(1);
    expect(JSON.parse(out)).toMatchObject({ ok: false, error: 'data/schema.json is missing. Run schema-refresh.' });
  });
});
