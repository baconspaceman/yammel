// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveEngineSpec, SeedEngine, type EngineSpec } from './engine';

const FAKE = join(process.cwd(), 'tests', 'fixtures', 'fake-engine.mjs');
const fakeSpec = (): EngineSpec => ({ command: process.execPath, args: [FAKE] });

let dir: string;
let engines: SeedEngine[] = [];

function make(spec: EngineSpec = fakeSpec(), options: ConstructorParameters<typeof SeedEngine>[1] = {}): SeedEngine {
  const engine = new SeedEngine(spec, { requestTimeoutMs: 3000, startTimeoutMs: 5000, ...options });
  engines.push(engine);
  return engine;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'engine-'));
});

afterEach(async () => {
  for (const engine of engines) engine.stop();
  engines = [];
  delete process.env['FAKE_COUNT_FILE'];
  delete process.env['FAKE_NEVER_READY'];
  delete process.env['FAKE_READY_DELAY_MS'];
  delete process.env['FAKE_START_FAIL'];
  await rm(dir, { recursive: true, force: true });
});

const pidsIn = async (file: string) =>
  (await readFile(file, 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((line) => Number(line.split(' ')[1]));
const startsIn = async (file: string) => (await pidsIn(file)).length;
const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('resolveEngineSpec', () => {
  const exists = (present: string[]) => (path: string) => present.includes(path);
  /** What a real source folder has, as far as detect.ts looks. */
  const source = (root: string) => [root, join(root, 'ModuleUpdate.py'), join(root, 'worlds')];

  it('uses ARCHIPELAGO_AP_ROOT when it points at a source tree with a venv', () => {
    const root = join('C:', 'ap');
    const python = join(root, '.venv', 'Scripts', 'python.exe');
    const spec = resolveEngineSpec({ ARCHIPELAGO_AP_ROOT: root }, join('C:', 'app'), exists([...source(root), python]));
    expect(spec).toMatchObject({ command: python });
    expect((spec as { args: string[] }).args).toContain('--ap-root');
    expect((spec as { args: string[] }).args).toContain(root);
  });

  it('starts Python without writing bytecode into the Archipelago folder and reading input as UTF-8', () => {
    const root = join('C:', 'ap');
    const spec = resolveEngineSpec({ ARCHIPELAGO_AP_ROOT: root }, join('C:', 'app'), exists([...source(root), join(root, '.venv', 'Scripts', 'python.exe')]));
    const args = (spec as { args: string[] }).args;
    expect(args).toContain('-B');
    expect(args.join(' ')).toContain('-X utf8');
  });

  it('falls back to the sibling archipelago-dev folder next to the project', () => {
    const app = join('C:', 'work', 'archipelago-yaml-editor');
    const root = join('C:', 'work', 'archipelago-dev', 'Archipelago');
    const python = join(root, '.venv', 'Scripts', 'python.exe');
    expect(resolveEngineSpec({}, app, exists([...source(root), python]))).toMatchObject({ command: python });
  });

  it('says why when there is no Archipelago source folder', () => {
    const spec = resolveEngineSpec({}, join('C:', 'app'), exists([]));
    expect(spec).toHaveProperty('unavailable');
    expect((spec as { unavailable: string }).unavailable).toContain('Archipelago source');
  });

  it('says why when the folder has no Python environment', () => {
    const root = join('C:', 'ap');
    const spec = resolveEngineSpec({ ARCHIPELAGO_AP_ROOT: root }, join('C:', 'app'), exists(source(root)));
    expect((spec as { unavailable: string }).unavailable).toContain('Python');
  });
});

describe('SeedEngine', () => {
  it('does not start a process until the first request', async () => {
    process.env['FAKE_COUNT_FILE'] = join(dir, 'starts.txt');
    const engine = make();
    expect(engine.status().state).toBe('stopped');
    expect(await startsIn(join(dir, 'starts.txt'))).toBe(0);
    const result = await engine.count('Demo', { a: 1, b: 2 });
    expect(result).toMatchObject({ ok: true, checks: 12, items: 5 });
    expect(engine.status().state).toBe('ready');
    expect(await startsIn(join(dir, 'starts.txt'))).toBe(1);
  });

  it('answers several requests sent at once, each with its own result', async () => {
    const engine = make();
    const results = await Promise.all([engine.count('A', {}), engine.count('B', { x: 1 }), engine.count('C', { x: 1, y: 2 })]);
    expect(results.map((r) => (r.ok ? r.checks : -1))).toEqual([10, 11, 12]);
  });

  it('ignores stray text a world prints on the protocol stream', async () => {
    const engine = make();
    expect(await engine.count('Chatty Game', {})).toMatchObject({ ok: true, checks: 10 });
  });

  it('turns a world error into a failure result and keeps running', async () => {
    const engine = make();
    expect(await engine.count('Broken Game', {})).toMatchObject({ ok: false, reason: 'failed' });
    expect(await engine.count('Fine', {})).toMatchObject({ ok: true });
  });

  it('reports a crash as a failure and restarts on the next request', async () => {
    process.env['FAKE_COUNT_FILE'] = join(dir, 'starts.txt');
    const engine = make();
    expect(await engine.count('Crash Game', {})).toMatchObject({ ok: false, reason: 'failed' });
    expect(await engine.count('Fine', {})).toMatchObject({ ok: true });
    expect(await startsIn(join(dir, 'starts.txt'))).toBe(2);
  });

  it('times out a request that never gets an answer, then recovers', async () => {
    const engine = make(fakeSpec(), { requestTimeoutMs: 300 });
    expect(await engine.count('Hang Game', {})).toMatchObject({ ok: false, reason: 'timeout' });
    expect(await engine.count('Fine', {})).toMatchObject({ ok: true });
  });

  it('gives up with "unavailable" when the engine never says it is ready', async () => {
    process.env['FAKE_NEVER_READY'] = '1';
    const engine = make(fakeSpec(), { startTimeoutMs: 400 });
    const result = await engine.count('Fine', {});
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('stops after crashing too often and says so, instead of restarting forever', async () => {
    const engine = make(fakeSpec(), { maxRestarts: 2, restartWindowMs: 60_000 });
    await engine.count('Crash Game', {});
    await engine.count('Crash Game', {});
    const third = await engine.count('Fine', {});
    expect(third).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(engine.status().state).toBe('unavailable');
  });

  it('shuts the process down when idle and starts a fresh one on demand', async () => {
    process.env['FAKE_COUNT_FILE'] = join(dir, 'starts.txt');
    const engine = make(fakeSpec(), { idleMs: 250 });
    await engine.count('Fine', {});
    expect(engine.status().state).toBe('ready');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(engine.status().state).toBe('stopped');
    const [first] = await pidsIn(join(dir, 'starts.txt'));
    await expect.poll(() => isAlive(first!), { timeout: 5000 }).toBe(false); // the process really exited
    expect(await engine.count('Fine', {})).toMatchObject({ ok: true });
    expect(await startsIn(join(dir, 'starts.txt'))).toBe(2);
  });

  it('stop() really ends the process (even a busy one) and a later request starts a new one', async () => {
    process.env['FAKE_COUNT_FILE'] = join(dir, 'starts.txt');
    const engine = make(fakeSpec(), { requestTimeoutMs: 20_000 });
    await engine.count('Fine', {});
    const [first] = await pidsIn(join(dir, 'starts.txt'));
    expect(isAlive(first!)).toBe(true);
    const stuck = engine.count('Hang Game', {}); // the engine is now busy and will never answer
    engine.stop();
    expect(await stuck).toMatchObject({ ok: false, reason: 'failed' }); // answered at once, not after the timeout
    await expect.poll(() => isAlive(first!), { timeout: 5000 }).toBe(false);
    expect(engine.status().state).toBe('stopped');
    expect(await engine.count('Fine', {})).toMatchObject({ ok: true });
  });

  it('explains why the engine could not start, using what it printed', async () => {
    process.env['FAKE_START_FAIL'] = 'ModuleNotFoundError: No module named worlds';
    const engine = make();
    const result = await engine.count('Fine', {});
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
    expect((result as { message: string }).message).toContain('ModuleNotFoundError: No module named worlds');
  });

  it('answers "unavailable" at once, without starting anything, when no engine can run here', async () => {
    const engine = make({ unavailable: 'No Archipelago source folder was found.' });
    const result = await engine.count('Fine', {});
    expect(result).toEqual({ ok: false, reason: 'unavailable', message: 'No Archipelago source folder was found.' });
    expect(engine.status()).toMatchObject({ state: 'unavailable' });
  });
});
