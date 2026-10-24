import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Runs the BUILT tool (npm run cli:build) as a separate process, the way an agent would. Skipped until it has been built.
const bundle = fileURLToPath(new URL('../../out/cli/apyaml.mjs', import.meta.url));
const schemaFile = fileURLToPath(new URL('../../data/schema.json', import.meta.url));
const apRoot = process.env['ARCHIPELAGO_AP_ROOT'] ?? fileURLToPath(new URL('../../../archipelago-dev/Archipelago', import.meta.url));
const python = join(apRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
const ready = existsSync(bundle) && existsSync(schemaFile);

// Every test works in its own throwaway folder; they are all removed when the file is done.
const made: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'apyaml-'));
  made.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

process.env['APYAML_NO_CUSTOM'] = '1'; // the shipped games only: what is installed on this machine must not change the counts
process.env['APYAML_NO_APP_SETTINGS'] = '1'; // and the app's own Settings and scan must not either

function apyaml(args: string[], input?: string) {
  const result = spawnSync(process.execPath, [bundle, ...args], { encoding: 'utf8', input, timeout: 170_000 });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function json(text: string): Record<string, unknown> {
  return JSON.parse(text.trim().split('\n').pop() ?? '{}') as Record<string, unknown>;
}

describe.skipIf(!ready)('the built apyaml tool', () => {
  it('prints help as one JSON line and exits 0', () => {
    const { code, out } = apyaml(['help']);
    expect(code).toBe(0);
    expect(out.trim().split('\n')).toHaveLength(1);
    expect((json(out)['commands'] as unknown[]).length).toBe(8);
  });

  it('lists the real games and options', () => {
    const games = json(apyaml(['games']).out);
    expect(games).toMatchObject({ ok: true });
    expect(games['count'] as number).toBeGreaterThan(70);
    const options = json(apyaml(['options', 'APQuest']).out);
    expect(options).toMatchObject({ ok: true, game: 'APQuest' });
    expect((options['options'] as { key: string }[]).map((o) => o.key)).toContain('hard_mode');
  });

  it('makes a repeatable randomized YAML', () => {
    const args = ['new', 'A Link to the Past', '--randomize', '--seed', '12', '--set', 'death_link=on'];
    const a = apyaml(args);
    const b = apyaml(args);
    expect(a.code).toBe(0);
    expect(json(a.out)['yaml']).toBe(json(b.out)['yaml']);
    expect(json(a.out)['yaml']).toContain('death_link: true');
  });

  it('exits 1 with an explanation for a wrong request', () => {
    const { code, out } = apyaml(['new', 'No Such Game']);
    expect(code).toBe(1);
    expect(json(out)).toMatchObject({ ok: false, exitCode: 1 });
    expect(apyaml(['frobnicate']).code).toBe(1);
  });

  it('writes a folder of fuzz YAMLs without the engine, and will not overwrite them', () => {
    const dir = join(tempDir(), 'out');
    const first = apyaml(['fuzz', 'APQuest', '--count', '4', '--seed', '3', '--out', dir]);
    expect(first.code).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(['01-apquest.yaml', '02-apquest.yaml', '03-apquest.yaml', '04-apquest.yaml']);
    expect(readFileSync(join(dir, '01-apquest.yaml'), 'utf8')).toMatch(/^name: Fuzz1\ngame: APQuest\n/);
    expect(apyaml(['fuzz', 'APQuest', '--count', '4', '--out', dir]).code).toBe(1);
  });

  it('rates a YAML file', () => {
    const dir = tempDir();
    const file = join(dir, 'p.yaml');
    expect(apyaml(['new', 'APQuest', '--set', 'hard_mode=on', '--out', file]).code).toBe(0);
    expect(json(apyaml(['rate', file]).out)).toMatchObject({ ok: true, source: 'rated', score: 3, label: 'Easy' });
  });

  it('serves MCP over stdin and stdout: initialize, list the tools, run one', () => {
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'apyaml_options', arguments: { game: 'APQuest' } } },
    ]
      .map((m) => JSON.stringify(m))
      .join('\n');
    const { code, out } = apyaml(['mcp'], `${lines}\n`);
    expect(code).toBe(0);
    const replies = out.trim().split('\n').map((l) => JSON.parse(l) as { id: number; result: Record<string, unknown> });
    expect(replies.map((r) => r.id)).toEqual([1, 2, 3]);
    expect((replies[1]!.result['tools'] as unknown[]).length).toBe(8);
    const text = (replies[2]!.result['content'] as { text: string }[])[0]!.text;
    expect(JSON.parse(text)).toMatchObject({ ok: true, game: 'APQuest' });
  });
});

describe.skipIf(!ready || !existsSync(python))('the built apyaml tool with the real engine', () => {
  it('checks fuzzed YAMLs and counts a YAML file, then leaves no engine running', () => {
    const dir = join(tempDir(), 'out');
    const fuzz = apyaml(['fuzz', 'APQuest', '--count', '3', '--seed', '1', '--out', dir, '--check']);
    expect(fuzz.code).toBe(0);
    const data = json(fuzz.out);
    expect(data['summary']).toEqual({ written: 3, checked: 3, accepted: 3, refused: 0, unavailable: 0 });

    const file = join(dir, 'single.yaml');
    expect(apyaml(['new', 'APQuest', '--set', 'extra_starting_chest=on', '--out', file]).code).toBe(0);
    const counted = json(apyaml(['count', file]).out);
    expect(counted).toMatchObject({ ok: true, game: 'APQuest', checks: 7 });
  }, 180_000);

  it('says the engine is unavailable (exit 3) when the Archipelago folder is not there', () => {
    const dir = tempDir();
    const file = join(dir, 'p.yaml');
    expect(apyaml(['new', 'APQuest', '--out', file]).code).toBe(0);
    const noEngine = spawnSync(process.execPath, [bundle, 'count', file], {
      encoding: 'utf8',
      env: { ...process.env, ARCHIPELAGO_AP_ROOT: join(dir, 'no-such-folder') },
    });
    expect(noEngine.status).toBe(3);
    expect(JSON.parse(noEngine.stdout.trim())).toMatchObject({ ok: false, exitCode: 3 });
  });

  it('reports a world refusing a YAML with exit code 2, in the process and in the JSON, with the seed to reproduce it', () => {
    const dir = join(tempDir(), 'out');
    const result = apyaml(['fuzz', 'Blasphemous', '--count', '6', '--seed', '200', '--out', dir, '--check']);
    expect(result.code).toBe(2);
    const data = json(result.out);
    expect(data).toMatchObject({ ok: true, exitCode: 2 });
    const refused = (data['files'] as { seed: number; check: { ok: boolean; message?: string } }[]).filter((f) => !f.check.ok);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[0]!.check.message).toMatch(/^world_error: OptionError/);
    const again = json(apyaml(['new', 'Blasphemous', '--randomize', '--seed', String(refused[0]!.seed), '--name', 'Fuzz1']).out);
    expect(readFileSync(join(dir, '01-blasphemous.yaml'), 'utf8').replace(/^name: Fuzz\d+/, 'name: Fuzz1')).toContain(String(again['yaml']).split('\n')[3]);
  }, 180_000);

  it('an MCP session sees the schema as soon as it is refreshed, and keeps working afterwards', () => {
    const dir = tempDir();
    const copy = join(dir, 'schema.json');
    const schema = JSON.parse(readFileSync(schemaFile, 'utf8')) as { games: Record<string, unknown> };
    const visibleBefore = Object.values(schema.games as Record<string, { hidden?: boolean }>).filter((g) => g.hidden !== true).length;
    delete schema.games['A Short Hike'];
    writeFileSync(copy, JSON.stringify(schema));
    const call = (id: number, name: string, args: Record<string, unknown>) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    const lines = [call(1, 'apyaml_games', {}), call(2, 'apyaml_schema_refresh', {}), call(3, 'apyaml_games', {}), call(4, 'apyaml_options', { game: 'A Short Hike' })]
      .map((m) => JSON.stringify(m))
      .join('\n');
    const result = spawnSync(process.execPath, [bundle, 'mcp'], { encoding: 'utf8', input: `${lines}\n`, timeout: 170_000, env: { ...process.env, ARCHIPELAGO_YAML_SCHEMA: copy } });
    expect(result.status).toBe(0);
    const payloads = result.stdout.trim().split('\n').map((l) => JSON.parse((JSON.parse(l) as { result: { content: { text: string }[] } }).result.content[0]!.text) as Record<string, unknown>);
    expect(payloads[0]).toMatchObject({ ok: true, count: visibleBefore - 1 }); // the copy without one game
    expect(payloads[1]).toMatchObject({ ok: true });
    expect(payloads[2]).toMatchObject({ ok: true });
    expect(payloads[2]!['count'] as number).toBeGreaterThan(visibleBefore - 1); // the refreshed schema, not the one loaded before
    expect(payloads[3]).toMatchObject({ ok: true, game: 'A Short Hike' });
  }, 180_000);
});
