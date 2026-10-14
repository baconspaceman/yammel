import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch, DEFAULT_SETTINGS } from '../shared/settings';
import { detectArchipelago, installCandidates, isSourceRoot, venvPython } from './detect';

const has = (present: string[]) => (path: string) => present.includes(path);
const source = (root: string) => [root, join(root, 'ModuleUpdate.py'), join(root, 'worlds')];
const winPython = (root: string, venv = '.venv') => join(root, venv, 'Scripts', 'python.exe');
const APP = join('C:', 'work', 'editor');
const run = (over: { settings?: typeof DEFAULT_SETTINGS; env?: Record<string, string>; present?: string[] }) =>
  detectArchipelago({
    settings: over.settings ?? DEFAULT_SETTINGS,
    env: over.env ?? {},
    appPath: APP,
    platform: 'win32',
    exists: has(over.present ?? []),
  });

describe('isSourceRoot / venvPython', () => {
  it('needs ModuleUpdate.py and a worlds folder', () => {
    const root = join('C:', 'ap');
    expect(isSourceRoot(root, has(source(root)))).toBe(true);
    expect(isSourceRoot(root, has([root, join(root, 'worlds')]))).toBe(false);
  });

  it('finds .venv or venv, and uses bin/python off Windows', () => {
    const root = join('C:', 'ap');
    expect(venvPython(root, 'win32', has([winPython(root)]))).toBe(winPython(root));
    expect(venvPython(root, 'win32', has([winPython(root, 'venv')]))).toBe(winPython(root, 'venv'));
    expect(venvPython(root, 'linux', has([join(root, '.venv', 'bin', 'python')]))).toBe(join(root, '.venv', 'bin', 'python'));
    expect(venvPython(root, 'win32', has([]))).toBeNull();
  });
});

describe('detectArchipelago', () => {
  it('prefers the folder chosen in Settings over the environment and the sibling folder', () => {
    const mine = join('C:', 'mine');
    const envRoot = join('C:', 'env');
    const settings = applyPatch(DEFAULT_SETTINGS, { archipelago: { sourceRoot: mine } });
    const found = run({ settings, env: { ARCHIPELAGO_AP_ROOT: envRoot }, present: [...source(mine), winPython(mine), ...source(envRoot), winPython(envRoot)] });
    expect(found).toMatchObject({ sourceRoot: mine, origin: 'settings', python: winPython(mine), problem: null });
  });

  it('uses the environment when Settings has nothing, then the sibling folder', () => {
    const envRoot = join('C:', 'env');
    expect(run({ env: { ARCHIPELAGO_AP_ROOT: envRoot }, present: [...source(envRoot), winPython(envRoot)] }).origin).toBe('env');
    const sibling = join(APP, '..', 'archipelago-dev', 'Archipelago');
    expect(run({ present: [...source(sibling), winPython(sibling)] })).toMatchObject({ origin: 'sibling', problem: null });
  });

  it('is calm about having nothing: a message, no failure', () => {
    const found = run({});
    expect(found).toMatchObject({ sourceRoot: null, origin: null, python: null, installRoot: null });
    expect(found.problem).toContain('everything else works');
  });

  it('never swaps a chosen folder for another: a missing one is named in the message', () => {
    const missing = join('C:', 'gone');
    const sibling = join(APP, '..', 'archipelago-dev', 'Archipelago');
    const settings = applyPatch(DEFAULT_SETTINGS, { archipelago: { sourceRoot: missing } });
    const found = run({ settings, present: [...source(sibling), winPython(sibling)] });
    expect(found).toMatchObject({ sourceRoot: null, origin: null, python: null });
    expect(found.problem).toContain(missing);
    const viaEnv = run({ env: { ARCHIPELAGO_AP_ROOT: missing }, present: [...source(sibling), winPython(sibling)] });
    expect(viaEnv.problem).toContain(missing);
  });

  it('rejects a folder that is not an Archipelago source folder', () => {
    const root = join('C:', 'notap');
    const found = run({ env: { ARCHIPELAGO_AP_ROOT: root }, present: [root] });
    expect(found).toMatchObject({ sourceRoot: root, python: null });
    expect(found.problem).toContain('does not look like an Archipelago source folder');
  });

  it('asks for a Python environment when the folder has none, and honours a chosen Python', () => {
    const root = join('C:', 'ap');
    const bare = run({ env: { ARCHIPELAGO_AP_ROOT: root }, present: source(root) });
    expect(bare.problem).toContain('.venv');
    const py = join('C:', 'Python311', 'python.exe');
    const settings = applyPatch(DEFAULT_SETTINGS, { archipelago: { pythonPath: py } });
    expect(run({ settings, env: { ARCHIPELAGO_AP_ROOT: root }, present: [...source(root), py] })).toMatchObject({ python: py, problem: null });
    expect(run({ settings, env: { ARCHIPELAGO_AP_ROOT: root }, present: source(root) }).problem).toContain('was not found');
  });

  it('reports an installed Archipelago without ever treating it as a source folder', () => {
    const install = join('C:', 'ProgramData', 'Archipelago');
    const found = run({ env: { ProgramData: join('C:', 'ProgramData') }, present: [join(install, 'ArchipelagoLauncher.exe')] });
    expect(found.installRoot).toBe(install);
    expect(found.sourceRoot).toBeNull();
  });
});

describe('installCandidates', () => {
  it('lists Windows locations only on Windows, skipping unset variables', () => {
    expect(installCandidates({ ProgramData: 'C:\\PD' }, 'win32')).toEqual([join('C:\\PD', 'Archipelago')]);
    expect(installCandidates({ ProgramData: 'C:\\PD' }, 'linux')).toEqual([]);
    expect(installCandidates({}, 'win32')).toEqual([]);
  });
});
