import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArchipelagoFinding } from '../shared/api';
import { findGenerator, generatorStatus, runGenerate, safeYamlName, summarizeLog, type RunDeps } from './generate';

const FAKE = join(process.cwd(), 'tests', 'fixtures', 'fake-generate.mjs');
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gen-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const finding = (over: Partial<ArchipelagoFinding> = {}): ArchipelagoFinding => ({ sourceRoot: null, origin: null, python: null, installRoot: null, problem: null, ...over });
const has = (present: string[]) => (path: string) => present.includes(path);

describe('findGenerator', () => {
  const root = join('C:', 'ap');
  const source = finding({ sourceRoot: root, python: join(root, '.venv', 'Scripts', 'python.exe'), origin: 'settings' });

  it('prefers the Archipelago source folder with its Python, and needs Generate.py and a host.yaml', () => {
    const spec = findGenerator(source, has([join(root, 'Generate.py'), join(root, 'host.yaml')]));
    expect(spec).toMatchObject({ kind: 'source', command: source.python, cwd: root, hostYaml: join(root, 'host.yaml') });
    expect((spec as { args: string[] }).args).toEqual(['-B', '-X', 'utf8', '-W', 'ignore', join(root, 'Generate.py')]);
    expect(findGenerator(source, has([join(root, 'Generate.py')]))).toMatchObject({ unavailable: expect.stringContaining('host.yaml') });
    expect(findGenerator(source, has([join(root, 'host.yaml')]))).toMatchObject({ unavailable: expect.stringContaining('Generate.py') });
  });

  it('falls back to the installed program, and refuses to run without a host.yaml (Archipelago would create one)', () => {
    const install = join('C:', 'ProgramData', 'Archipelago');
    const f = finding({ installRoot: install });
    expect(findGenerator(f, has([join(install, 'ArchipelagoGenerate.exe'), join(install, 'host.yaml')]))).toMatchObject({ kind: 'installed', cwd: install });
    expect(findGenerator(f, has([join(install, 'ArchipelagoGenerate.exe')]))).toMatchObject({ unavailable: expect.stringContaining('has not been set up') });
    expect(findGenerator(f, has([join(install, 'host.yaml')]))).toMatchObject({ unavailable: expect.stringContaining('ArchipelagoGenerate.exe was not found') });
  });

  it('says plainly when there is nothing to use', () => {
    expect(findGenerator(finding(), has([]))).toMatchObject({ unavailable: expect.stringContaining('No Archipelago was found') });
    expect(generatorStatus({ unavailable: 'x' })).toEqual({ available: false, kind: null, hostYaml: null, problem: 'x' });
  });
});

describe('safeYamlName', () => {
  it('keeps a readable file name and never lets the text choose a folder', () => {
    expect(safeYamlName('My Player', 0)).toBe('My Player.yaml');
    expect(safeYamlName('..\\..\\evil', 0)).toBe('_.._evil.yaml');
    expect(safeYamlName('a/b:c*.yml', 0)).toBe('a_b_c_.yml');
    expect(safeYamlName('   ', 2)).toBe('player3.yaml');
    expect(safeYamlName('x'.repeat(200), 0).length).toBeLessThanOrEqual(65);
  });
});

describe('summarizeLog', () => {
  it('turns the generator\'s "is invalid" block into plain lines', () => {
    const log = '1. File t.yaml document #1 (name: Tester) is invalid. Please fix your yaml.\nOptions.OptionError: Option HardMode does not support a value of ture\n Which caused: Options.OptionError: Error generating option hard_mode in APQuest\nPress enter to close.';
    expect(summarizeLog(log)).toEqual(['t.yaml is not accepted.', 'Option HardMode does not support a value of ture', 'Error generating option hard_mode in APQuest']);
  });

  it('finds a fill error in a traceback, and falls back to the last lines', () => {
    expect(summarizeLog('Traceback (most recent call last):\n  File "Fill.py", line 5\nFillError: No more spots to place 3 items.')).toEqual(['No more spots to place 3 items.']);
    expect(summarizeLog('one\n\ntwo\nthree\nfour')).toEqual(['two', 'three', 'four']);
    expect(summarizeLog('')).toEqual(['The generator stopped without saying why.']);
  });
});

describe('runGenerate (against a stand-in generator)', () => {
  const deps = (over: Partial<RunDeps> = {}, env: Record<string, string> = {}): RunDeps => ({
    spec: { command: process.execPath, args: [FAKE], cwd: process.cwd(), kind: 'source', hostYaml: join(dir, 'host.yaml') },
    seedsRoot: join(dir, 'seeds'),
    tmpRoot: dir,
    env: { ...process.env, ...env },
    approvedFiles: new Set(),
    now: () => new Date('2026-10-14T10:20:30Z'),
    ...over,
  });
  const request = { mode: 'check' as const, yaml: { name: 'My Game.yaml', text: 'name: P\ngame: G\n' }, extraFiles: [] as string[] };

  it('a check runs with --skip_output, writes nothing, and cleans up its temporary folder', async () => {
    const result = await runGenerate(request, deps());
    expect(result).toMatchObject({ ok: true, mode: 'check', seedFile: null, folder: null });
    expect(result.ok && result.log).toContain('--skip_output');
    expect(result.ok && result.log).toContain('Players: My Game.yaml');
    expect(result.ok && result.log).toContain('TEXTS name: P');
    expect(await readdir(dir)).toEqual([]); // no seeds folder, no leftover temp folder
  });

  it('making a seed writes it into a new dated folder and reports the file, and the spoiler when there is one', async () => {
    const result = await runGenerate({ ...request, mode: 'make' }, deps({}, { FAKE_SPOILER: '1' }));
    expect(result).toMatchObject({ ok: true, mode: 'make' });
    if (!result.ok) throw new Error('expected success');
    expect(result.folder).toBe(join(dir, 'seeds', '2026-10-14T10-20-30'));
    expect(result.seedFile).toBe(join(result.folder!, 'AP_123.zip'));
    expect(result.spoilerFile).toBe(join(result.folder!, 'AP_123_Spoiler.txt'));
    expect(result.log).not.toContain('--skip_output');
  });

  it('copies only extra files the person picked, gives clashing names their own, and refuses others', async () => {
    const mine = join(dir, 'friend.yaml');
    await writeFile(mine, 'name: F\ngame: H\n');
    const ok = await runGenerate({ ...request, yaml: { name: 'friend.yaml', text: 'name: P\n' }, extraFiles: [mine] }, deps({ approvedFiles: new Set([mine]) }));
    expect(ok.ok && ok.log).toMatch(/Players: (friend\.yaml, friend 2\.yaml|friend 2\.yaml, friend\.yaml)/);
    const refused = await runGenerate({ ...request, extraFiles: [mine] }, deps());
    expect(refused).toMatchObject({ ok: false, reason: 'failed', problems: [expect.stringContaining('not chosen with the file dialog')] });
  });

  it('explains an invalid YAML in plain lines and keeps the log', async () => {
    const result = await runGenerate(request, deps({}, { FAKE_GEN: 'invalid' }));
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    if (result.ok) throw new Error('expected failure');
    expect(result.problems[0]).toBe('t.yaml is not accepted.');
    expect(result.problems).toContain('Option HardMode does not support a value of ture');
    expect(result.log).toContain('Press enter to close');
  });

  it('explains a fill error, an exit with no words, and a success that wrote no seed', async () => {
    expect(await runGenerate(request, deps({}, { FAKE_GEN: 'fill' }))).toMatchObject({ ok: false, problems: ['No more spots to place 3 items. Remaining locations are invalid.'] });
    expect(await runGenerate(request, deps({}, { FAKE_GEN: 'silent' }))).toMatchObject({ ok: false, problems: ['The generator stopped without saying why.'] });
    expect(await runGenerate({ ...request, mode: 'make' }, deps({}, { FAKE_GEN: 'nozip' }))).toMatchObject({ ok: false, problems: ['The generator finished but wrote no seed file.'] });
  });

  it('stops a generator that takes too long', async () => {
    const result = await runGenerate(request, deps({ timeoutMs: 400 }, { FAKE_GEN: 'hang' }));
    expect(result).toMatchObject({ ok: false, reason: 'stopped' });
  });

  it('never reports a failure by throwing, even when the program cannot start', async () => {
    const result = await runGenerate(request, deps({ spec: { command: join(dir, 'missing.exe'), args: [], cwd: dir, kind: 'installed', hostYaml: '' } }));
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(await readFile(join(dir, 'x'), 'utf8').catch(() => 'none')).toBe('none');
  });
});
