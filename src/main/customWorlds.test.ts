import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArchipelagoFinding } from '../shared/api';
import { clearCustomWorlds, customFiles, mergeSchemaText, plainProblem, readSummary, scanBlocker, scanCustomWorlds, schemaWithCustom, summarize } from './customWorlds';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'yamled-cw-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const finding = (over: Partial<ArchipelagoFinding> = {}): ArchipelagoFinding => ({ sourceRoot: null, origin: null, python: null, installRoot: null, problem: null, ...over });

describe('plainProblem', () => {
  it('explains newer-Python worlds, missing libraries, non-worlds and version limits in plain words', () => {
    expect(plainProblem("SyntaxError: f-string: unmatched '('")).toMatch(/newer Python/);
    expect(plainProblem("AttributeError: module 'typing' has no attribute 'override'")).toMatch(/newer Python/);
    expect(plainProblem("ModuleNotFoundError: No module named 'numpy'")).toBe('Needs something that is not installed for the scanning Python (numpy).');
    expect(plainProblem('It did not add a game.')).toMatch(/tool rather than a world/);
    expect(plainProblem('Needs a newer Archipelago (0.7.0 or later).')).toBe('Needs a newer Archipelago (0.7.0 or later).');
    expect(plainProblem('x'.repeat(400)).length).toBeLessThanOrEqual(160);
  });
});

describe('summarize', () => {
  it('lists games with their file, and problems from both lists, sorted', () => {
    const summary = summarize(
      { games: { Zeta: { customFile: 'z.apworld' }, Alpha: { customFile: 'a.apworld' } }, customProblems: [{ file: 'b.apworld', error: 'It did not add a game.' }], errors: [{ game: 'Q', error: 'boom' }] },
      'C:/w',
      new Date('2026-10-14T00:00:00Z'),
    );
    expect(summary.games).toEqual([
      { name: 'Alpha', file: 'a.apworld' },
      { name: 'Zeta', file: 'z.apworld' },
    ]);
    expect(summary.problems.map((p) => p.file)).toEqual(['b.apworld', 'Q']);
    expect(summary.folder).toBe('C:/w');
    expect(summarize(null, 'C:/w', new Date())).toMatchObject({ games: [], problems: [] });
  });
});

describe('mergeSchemaText', () => {
  it('adds new games and never replaces a bundled one', () => {
    const merged = JSON.parse(mergeSchemaText('{"games":{"A":{"v":1}},"x":1}', '{"games":{"A":{"v":2},"B":{"v":3}}}'));
    expect(merged.games).toEqual({ A: { v: 1 }, B: { v: 3 } });
    expect(merged.x).toBe(1);
  });
});

describe('schemaWithCustom', () => {
  it('falls back to the bundled games when the saved scan is damaged', async () => {
    const userData = temp();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const bundledPath = join(userData, 'schema.json');
    const real = readFileSync(join(process.cwd(), 'data', 'schema.json'), 'utf8');
    writeFileSync(bundledPath, real);
    mkdirSync(join(userData, 'custom-worlds'));
    writeFileSync(customFiles(userData).summary, JSON.stringify({ folder: 'C:/w', scannedAt: 'x', games: [], problems: [] }));
    writeFileSync(customFiles(userData).schema, '{"games":{"Broken":{"name":"Broken"}}}');
    expect(await schemaWithCustom(bundledPath, userData, 'C:/w')).toBe(real);
    expect(await schemaWithCustom(bundledPath, userData, null)).toBe(real);
  });
});

describe('scan', () => {
  it('says why it cannot run without a source folder and Python', async () => {
    expect(scanBlocker(finding())).toMatch(/source folder/);
    expect(scanBlocker(finding({ sourceRoot: 'C:/ap', python: 'C:/p/python.exe' }))).toBeNull();
    const result = await scanCustomWorlds({ finding: finding(), folder: 'C:/w', script: 'x.py', userData: temp(), env: {} });
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('reports a program that cannot be started, and keeps nothing', async () => {
    const userData = temp();
    const result = await scanCustomWorlds({ finding: finding({ sourceRoot: tmpdir(), python: join(userData, 'no-such-python.exe') }), folder: tmpdir(), script: 'x.py', userData, env: {} });
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(existsSync(customFiles(userData).schema)).toBe(false);
  });

  it('a saved summary is only used for the folder it was made for, and can be cleared', async () => {
    const userData = temp();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(userData, 'custom-worlds'));
    writeFileSync(customFiles(userData).summary, JSON.stringify({ folder: 'C:/w', scannedAt: 'x', games: [], problems: [] }));
    expect(await readSummary(userData, 'C:/w')).not.toBeNull();
    expect(await readSummary(userData, 'C:/other')).toBeNull();
    expect(await readSummary(userData, null)).toBeNull();
    await clearCustomWorlds(userData);
    expect(await readSummary(userData, 'C:/w')).toBeNull();
    expect(readFileSync).toBeDefined();
  });
});
