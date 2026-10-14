import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchipelagoFinding, SourceOrigin } from '../shared/api';
import type { Settings } from '../shared/settings';

type Exists = (path: string) => boolean;

/** A folder is an Archipelago source folder when it has these. Cheap checks only; nothing is read or run. */
export function isSourceRoot(path: string, exists: Exists): boolean {
  return exists(join(path, 'ModuleUpdate.py')) && exists(join(path, 'worlds'));
}

/** The Python that belongs to a source folder (its own virtual environment), or null. */
export function venvPython(root: string, platform: string, exists: Exists): string | null {
  const relative = platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  for (const venv of ['.venv', 'venv']) {
    const candidate = join(root, venv, ...relative);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/** Where a normal Windows install of Archipelago puts itself. Only looked at, never changed. */
export function installCandidates(env: Record<string, string | undefined>, platform: string): string[] {
  if (platform !== 'win32') return [];
  const out: string[] = [];
  for (const [variable, tail] of [
    ['ProgramData', 'Archipelago'],
    ['LOCALAPPDATA', 'Archipelago'],
    ['ProgramFiles', 'Archipelago'],
  ] as const) {
    const base = env[variable];
    if (base !== undefined && base !== '') out.push(join(base, tail));
  }
  return out;
}

export interface DetectInput {
  settings: Settings;
  env: Record<string, string | undefined>;
  appPath: string;
  platform?: string;
  exists?: Exists;
}

/**
 * Works out what this machine has. The source folder is the person's choice in Settings, else
 * ARCHIPELAGO_AP_ROOT, else an "archipelago-dev\Archipelago" folder next to this project (how a developer
 * lays things out). Only the first of those that is set is looked at: a folder that is set but wrong is
 * reported, not silently replaced by another.
 */
export function detectArchipelago(input: DetectInput): ArchipelagoFinding {
  const platform = input.platform ?? process.platform;
  const exists = input.exists ?? existsSync;

  const candidates: { path: string; origin: SourceOrigin }[] = [];
  if (input.settings.archipelago.sourceRoot !== null) candidates.push({ path: input.settings.archipelago.sourceRoot, origin: 'settings' });
  const fromEnv = input.env['ARCHIPELAGO_AP_ROOT'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') candidates.push({ path: fromEnv.trim(), origin: 'env' });
  candidates.push({ path: join(input.appPath, '..', 'archipelago-dev', 'Archipelago'), origin: 'sibling' });

  const installRoot =
    installCandidates(input.env, platform).find((folder) => exists(join(folder, 'ArchipelagoLauncher.exe'))) ?? null;

  // The first folder that was asked for is the one used. A chosen folder that is missing is reported, never swapped for another.
  const pick = candidates[0]!;
  if (!exists(pick.path)) {
    return {
      sourceRoot: null,
      origin: null,
      python: null,
      installRoot,
      problem:
        pick.origin === 'sibling'
          ? 'No Archipelago source folder was found. The check count needs one; everything else works without it.'
          : `The folder ${pick.path} was not found.`,
    };
  }
  if (!isSourceRoot(pick.path, exists)) {
    return {
      sourceRoot: pick.path,
      origin: pick.origin,
      python: null,
      installRoot,
      problem: `${pick.path} does not look like an Archipelago source folder (it has no ModuleUpdate.py and worlds folder).`,
    };
  }
  const configuredPython = input.settings.archipelago.pythonPath;
  const python = configuredPython !== null ? (exists(configuredPython) ? configuredPython : null) : venvPython(pick.path, platform, exists);
  if (python === null) {
    return {
      sourceRoot: pick.path,
      origin: pick.origin,
      python: null,
      installRoot,
      problem:
        configuredPython !== null
          ? `The Python you chose (${configuredPython}) was not found.`
          : `The Archipelago folder ${pick.path} has no Python environment (.venv). Set one up there, or choose a Python below.`,
    };
  }
  return { sourceRoot: pick.path, origin: pick.origin, python, installRoot, problem: null };
}
