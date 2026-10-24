import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchipelagoFinding } from '../shared/api';
import type { CustomGame, CustomProblem, CustomWorldsSummary, ScanResult } from '../shared/customWorlds';
import { parseSchemaFile } from '../schema/load';
import { cleanEnv, runCli } from './helpers/cli';

export const MAX_CUSTOM_SCHEMA_BYTES = 120 * 1024 * 1024;

export interface CustomFiles {
  schema: string;
  summary: string;
}

export function customFiles(userData: string): CustomFiles {
  const folder = join(userData, 'custom-worlds');
  return { schema: join(folder, 'schema.json'), summary: join(folder, 'summary.json') };
}

/** Turns what the scanner said about a file it could not add into one plain sentence. */
export function plainProblem(error: string): string {
  const text = error.trim();
  if (/f-string|unterminated string literal|invalid syntax|expected an indented|typing.*override|'override'/i.test(text)) {
    return 'Written for a newer Python than the one used to scan (3.12 or later), so it could not be read. Choose a Python 3.13 under Check counts and scan again.';
  }
  const missing = /No module named '([^']+)'/.exec(text) ?? /cannot import name '([^']+)'/.exec(text);
  if (/ModuleNotFoundError|ImportError/.test(text) && missing !== null) {
    return `Needs something that is not installed for the scanning Python (${missing[1]}).`;
  }
  if (/did not add a game/i.test(text)) return 'It did not add a game (it may be a tool rather than a world).';
  if (/^Needs a newer Archipelago|^Made for an older Archipelago/.test(text)) return text;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** Builds the saved summary from the scanner's own output file. */
export function summarize(raw: unknown, folder: string, now: Date): CustomWorldsSummary {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const games: CustomGame[] = [];
  const found = typeof record['games'] === 'object' && record['games'] !== null ? (record['games'] as Record<string, unknown>) : {};
  for (const [name, game] of Object.entries(found)) {
    const file = typeof game === 'object' && game !== null && typeof (game as Record<string, unknown>)['customFile'] === 'string' ? ((game as Record<string, unknown>)['customFile'] as string) : '';
    games.push({ name, file });
  }
  games.sort((a, b) => a.name.localeCompare(b.name));
  const problems: CustomProblem[] = [];
  const add = (list: unknown, fileKey: string) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const file = typeof entry[fileKey] === 'string' ? (entry[fileKey] as string) : '';
      const error = typeof entry['error'] === 'string' ? (entry['error'] as string) : '';
      problems.push({ file, error: plainProblem(error) });
    }
  };
  add(record['customProblems'], 'file');
  add(record['errors'], 'game');
  problems.sort((a, b) => a.file.localeCompare(b.file));
  return { folder, scannedAt: now.toISOString(), games, problems };
}

export interface ScanDeps {
  finding: ArchipelagoFinding;
  folder: string;
  /** The extractor script that ships with the app. */
  script: string;
  userData: string;
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => Date;
}

/** Why a scan cannot run here, or null. A scan needs an Archipelago source folder and its Python. */
export function scanBlocker(finding: ArchipelagoFinding): string | null {
  if (finding.sourceRoot === null || finding.python === null) {
    return finding.problem ?? 'Scanning custom worlds needs an Archipelago source folder with its Python. Choose one under "Check counts" above.';
  }
  return null;
}

/**
 * Runs Archipelago's own world loader over the folder, one .apworld at a time, and keeps what it found next to the app's data.
 * The folder itself is only read. Loading a world runs that world's own code, exactly as the Archipelago launcher would.
 */
export async function scanCustomWorlds(deps: ScanDeps): Promise<ScanResult> {
  const blocker = scanBlocker(deps.finding);
  if (blocker !== null || deps.finding.sourceRoot === null || deps.finding.python === null) return { ok: false, reason: 'unavailable', message: blocker ?? 'This cannot be scanned here.' };
  const files = customFiles(deps.userData);
  await mkdir(join(deps.userData, 'custom-worlds'), { recursive: true });
  const part = `${files.schema}.part`;
  const run = await runCli({
    command: deps.finding.python,
    args: ['-B', '-X', 'utf8', '-W', 'ignore', deps.script, '--ap-root', deps.finding.sourceRoot, '--custom-worlds', deps.folder, '--only-custom', '--include-loaded', '--out', part],
    cwd: deps.finding.sourceRoot,
    env: { ...cleanEnv(deps.env), PYTHONIOENCODING: 'utf-8' },
    timeoutMs: deps.timeoutMs ?? 15 * 60_000,
    maxChars: 20_000_000,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  try {
    if (!run.ok) {
      await rm(part, { force: true });
      if (run.reason === 'aborted') return { ok: false, reason: 'stopped', message: 'The scan was stopped.' };
      if (run.reason === 'timeout') return { ok: false, reason: 'stopped', message: 'The scan took longer than fifteen minutes, so it was stopped.' };
      return { ok: false, reason: 'failed', message: run.message };
    }
    if (run.code !== 0) {
      await rm(part, { force: true });
      const last = `${run.stderr}\n${run.stdout}`.trim().split(/\r?\n/).filter((line) => line.trim() !== '').pop() ?? '';
      return { ok: false, reason: 'failed', message: `The scan did not finish. ${last}`.trim() };
    }
    const text = await readFile(part, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_CUSTOM_SCHEMA_BYTES) {
      await rm(part, { force: true });
      return { ok: false, reason: 'failed', message: 'The scan produced far more data than expected, so it was not kept.' };
    }
    const raw: unknown = JSON.parse(text);
    const summary = summarize(raw, deps.folder, (deps.now ?? (() => new Date()))());
    await rename(part, files.schema);
    await writeFile(files.summary, JSON.stringify(summary), 'utf8');
    return { ok: true, summary };
  } catch (error) {
    await rm(part, { force: true }).catch(() => undefined);
    return { ok: false, reason: 'failed', message: error instanceof Error ? `The scan result could not be read: ${error.message}` : 'The scan result could not be read.' };
  }
}

/** The saved summary, only if it is for this folder. */
export async function readSummary(userData: string, folder: string | null): Promise<CustomWorldsSummary | null> {
  if (folder === null) return null;
  try {
    const parsed = JSON.parse(await readFile(customFiles(userData).summary, 'utf8')) as CustomWorldsSummary;
    return parsed.folder === folder && Array.isArray(parsed.games) && Array.isArray(parsed.problems) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearCustomWorlds(userData: string): Promise<void> {
  await rm(join(userData, 'custom-worlds'), { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}

/** The bundled schema with the scanned custom games added. A custom game never replaces a bundled one. */
export function mergeSchemaText(bundled: string, custom: string): string {
  const base = JSON.parse(bundled) as { games: Record<string, unknown> };
  const extra = JSON.parse(custom) as { games?: Record<string, unknown> };
  for (const [name, game] of Object.entries(extra.games ?? {})) {
    if (!(name in base.games)) base.games[name] = game;
  }
  return JSON.stringify(base);
}

/** The schema the window should use: bundled, plus the custom games when a scan of the chosen folder exists. */
export async function schemaWithCustom(bundledPath: string, userData: string, folder: string | null): Promise<string> {
  const bundled = await readFile(bundledPath, 'utf8');
  if (folder === null || (await readSummary(userData, folder)) === null) return bundled;
  try {
    const merged = mergeSchemaText(bundled, await readFile(customFiles(userData).schema, 'utf8'));
    parseSchemaFile(merged); // a damaged scan must never stop the editor from starting
    return merged;
  } catch {
    return bundled;
  }
}
