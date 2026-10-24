import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippedProfiles } from '../difficulty/shipped';
import { resolveEngineSpec, SeedEngine } from '../main/engine';
import { parseSchemaFile } from '../schema/load';
import type { SchemaFile } from '../schema/types';
import { nodeFiles } from './nodeFiles';
import type { GameSchema } from '../schema/types';
import { runCli } from './run';
import { serveMcp } from './serve';
import { SetupError, type CountEngine, type Ctx } from './types';
import { Worlds, type AppScan, type CacheFile, type ScanOutcome, type WorldsDeps } from './worlds';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../shared/settings';

/** The project folder: this file is built to out/cli/apyaml.mjs, two levels below it. */
const projectRoot = process.env['APYAML_ROOT'] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemaPath = process.env['ARCHIPELAGO_YAML_SCHEMA'] ?? join(projectRoot, 'data', 'schema.json');
const EXTRACTOR_TIMEOUT_MS = 5 * 60_000;

function loadSchema(): SchemaFile {
  if (!existsSync(schemaPath)) {
    throw new SetupError(`The game schema was not found at ${schemaPath}. Run "apyaml schema-refresh" first.`);
  }
  return parseSchemaFile(readFileSync(schemaPath, 'utf8'));
}

/** Runs the project's schema extractor with the Archipelago clone's own Python. It writes only the schema file (atomically). */
function refreshSchema(apRootArg: string | null): ReturnType<Ctx['refreshSchema']> {
  const apRoot = apRootArg ?? process.env['ARCHIPELAGO_AP_ROOT'] ?? join(projectRoot, '..', 'archipelago-dev', 'Archipelago');
  if (!existsSync(apRoot)) return Promise.resolve({ ok: false, message: `No Archipelago source folder was found (looked in ${apRoot}). Pass --ap-root or set ARCHIPELAGO_AP_ROOT.` });
  const python = process.platform === 'win32' ? join(apRoot, '.venv', 'Scripts', 'python.exe') : join(apRoot, '.venv', 'bin', 'python');
  if (!existsSync(python)) return Promise.resolve({ ok: false, message: `The Archipelago folder ${apRoot} has no Python environment (.venv).` });
  return new Promise((resolvePromise) => {
    const child = spawn(python, ['-B', '-W', 'ignore', join(projectRoot, 'extractor', 'schema_extract.py'), '--ap-root', apRoot, '--out', schemaPath], {
      cwd: projectRoot,
      windowsHide: true,
    });
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, EXTRACTOR_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, message: `The extractor could not start: ${error.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolvePromise({ ok: false, message: 'The extractor took longer than 5 minutes and was stopped; the schema was not changed.' });
        return;
      }
      if (code !== 0) {
        const last = err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? `exit code ${String(code)}`;
        resolvePromise({ ok: false, message: `The extractor failed: ${last.slice(0, 300)}` });
        return;
      }
      let errors: { game: string; error: string }[] = [];
      try {
        errors = (JSON.parse(readFileSync(schemaPath, 'utf8')) as { errors?: { game: string; error: string }[] }).errors ?? [];
      } catch {
        // the summary line is still useful
      }
      resolvePromise({ ok: true, summary: out.trim().split(/\r?\n/).pop() ?? 'done', errors });
    });
  });
}

let engineInstance: SeedEngine | null = null;
let engineFiles = '';

/** Where the custom-world cache lives. APYAML_CACHE overrides it. */
const cacheDir = process.env['APYAML_CACHE'] ?? join(process.env['APPDATA'] ?? join(homedir(), '.config'), 'Yammel', 'apyaml');
const cacheFile = join(cacheDir, 'worlds-cache.json');

/** The Yammel app's own data folder: its saved settings and its custom-world scan are shared with this tool. */
const appData = process.env['YAMMEL_USER_DATA'] ?? join(process.env['APPDATA'] ?? join(homedir(), '.config'), 'Yammel');

let appSettingsCache: Settings | undefined;
/** The app's saved settings (the source folder and Python chosen in Settings), or the defaults. APYAML_NO_APP_SETTINGS=1 ignores them. */
function appSettings(): Settings {
  if (appSettingsCache === undefined) {
    appSettingsCache = DEFAULT_SETTINGS;
    if (process.env['APYAML_NO_APP_SETTINGS'] !== '1') {
      try {
        appSettingsCache = parseSettings(JSON.parse(readFileSync(join(appData, 'settings.json'), 'utf8')));
      } catch {
        // no app settings: the defaults
      }
    }
  }
  return appSettingsCache;
}

/** The Archipelago source folder: ARCHIPELAGO_AP_ROOT, else the one chosen in the app's Settings, else the clone next to this project. */
function apRootDefault(): string {
  return process.env['ARCHIPELAGO_AP_ROOT'] ?? appSettings().archipelago.sourceRoot ?? join(projectRoot, '..', 'archipelago-dev', 'Archipelago');
}

/** The Python that loads worlds: APYAML_PYTHON, else the one chosen in the app's Settings, else the source folder's own .venv. */
function worldPython(apRoot: string): string {
  const chosen = process.env['APYAML_PYTHON'] ?? appSettings().archipelago.pythonPath;
  if (chosen !== null && chosen !== undefined && chosen !== '') return chosen;
  return process.platform === 'win32' ? join(apRoot, '.venv', 'Scripts', 'python.exe') : join(apRoot, '.venv', 'bin', 'python');
}

/** The app's last custom-world scan (every game it loaded), when it exists. Used so a game the app already loaded needs no new load here. */
async function readAppScan(): Promise<AppScan | null> {
  if (process.env['APYAML_NO_APP_SETTINGS'] === '1') return null;
  try {
    const summary = JSON.parse(await readFile(join(appData, 'custom-worlds', 'summary.json'), 'utf8')) as { folder?: string; scannedAt?: string };
    const parsed = JSON.parse(await readFile(join(appData, 'custom-worlds', 'schema.json'), 'utf8')) as { apVersion?: string; games?: Record<string, GameSchema> };
    if (typeof summary.folder !== 'string' || typeof summary.scannedAt !== 'string' || parsed.games === undefined) return null;
    return { folder: summary.folder, scannedAt: Date.parse(summary.scannedAt), apVersion: parsed.apVersion ?? '', games: parsed.games };
  } catch {
    return null;
  }
}

function programData(): string {
  return process.env['ProgramData'] ?? (process.platform === 'win32' ? 'C:/ProgramData' : '');
}

/** The folders Archipelago keeps custom worlds in on this machine, plus APYAML_WORLDS (a list of folders). Searched in simple mode with no setup. */
function usualWorldFolders(): string[] {
  if (process.env['APYAML_NO_CUSTOM'] === '1') return []; // for tests: look nowhere unless told to
  const folders = (process.env['APYAML_WORLDS'] ?? '').split(delimiter).map((f) => f.trim()).filter(Boolean);
  if (programData() !== '') folders.push(join(programData(), 'Archipelago', 'custom_worlds'));
  folders.push(join(apRootDefault(), 'custom_worlds'));
  return folders;
}

function usualTemplateFolders(): string[] {
  if (process.env['APYAML_NO_CUSTOM'] === '1') return [];
  const folders = (process.env['APYAML_TEMPLATES'] ?? '').split(delimiter).map((f) => f.trim()).filter(Boolean);
  if (programData() !== '') folders.push(join(programData(), 'Archipelago', 'Players', 'Templates'));
  folders.push(join(apRootDefault(), 'Players', 'Templates'));
  return folders;
}

async function listWithExtension(folder: string, pattern: RegExp): Promise<{ path: string; name: string; size: number; mtimeMs: number }[]> {
  try {
    const out: { path: string; name: string; size: number; mtimeMs: number }[] = [];
    for (const name of await readdir(folder)) {
      if (!pattern.test(name)) continue;
      const path = join(folder, name);
      const info = await stat(path);
      if (info.isFile()) out.push({ path, name, size: info.size, mtimeMs: Math.floor(info.mtimeMs) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Loads one .apworld with Archipelago's own loader (the project's extractor), on a private copy so nothing in any Archipelago folder is touched. */
async function scanApworld(path: string): Promise<ScanOutcome> {
  const apRoot = apRootDefault();
  const python = worldPython(apRoot);
  if (!existsSync(apRoot) || !existsSync(python)) {
    return { games: {}, problem: 'No Archipelago source folder with its own Python was found, so the world could not be loaded (set ARCHIPELAGO_AP_ROOT).' };
  }
  await mkdir(cacheDir, { recursive: true });
  const stage = await mkdtemp(join(cacheDir, 'scan-'));
  try {
    await copyFile(path, join(stage, path.split(/[\\/]/).pop()!));
    const out = join(stage, 'out.json');
    const args = ['-B', '-X', 'utf8', '-W', 'ignore', join(projectRoot, 'extractor', 'schema_extract.py'), '--ap-root', apRoot, '--custom-worlds', stage, '--only-custom', '--include-loaded', '--out', out];
    const result = await new Promise<{ code: number | null; err: string; timedOut: boolean }>((done) => {
      const child = spawn(python, args, { cwd: apRoot, windowsHide: true });
      let err = '';
      let timedOut = false;
      child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 3 * 60_000);
      child.on('error', (error) => {
        clearTimeout(timer);
        done({ code: -1, err: error.message, timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        done({ code, err, timedOut });
      });
    });
    if (result.timedOut) return { games: {}, problem: 'Loading the world took longer than three minutes.' };
    if (result.code !== 0 || !existsSync(out)) {
      const last = result.err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? 'the loader did not finish';
      return { games: {}, problem: last.slice(0, 300) };
    }
    const parsed = JSON.parse(await readFile(out, 'utf8')) as { games?: Record<string, GameSchema>; customProblems?: { file: string; error: string }[] };
    const games = parsed.games ?? {};
    return { games, problem: Object.keys(games).length > 0 ? null : (parsed.customProblems?.[0]?.error ?? 'It did not add a game.') };
  } catch (error) {
    return { games: {}, problem: error instanceof Error ? error.message : 'The world could not be loaded.' };
  } finally {
    await rm(stage, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
  }
}

const worldsDeps: WorldsDeps = {
  listWorldFiles: (folder) => listWithExtension(folder, /\.apworld$/i),
  readBytes: (path) => readFile(path),
  scanFile: scanApworld,
  readAppScan,
  async readCache() {
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8')) as CacheFile;
    } catch {
      return null;
    }
  },
  async writeCache(cache) {
    await mkdir(cacheDir, { recursive: true });
    const part = `${cacheFile}.part`;
    await writeFile(part, JSON.stringify(cache), 'utf8');
    await rename(part, cacheFile);
  },
  async listTemplates(folder) {
    return (await listWithExtension(folder, /\.ya?ml$/i)).map(({ path, name }) => ({ path, name }));
  },
  async readText(path) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      return null;
    }
  },
};

function makeCtx(keepEngineAlive: boolean): Ctx {
  let schema: SchemaFile | undefined;
  let worlds: Worlds | undefined;
  return {
    // Loaded on first use, so "help" and "schema-refresh" work before there is a schema.
    get schema() {
      schema ??= loadSchema();
      return schema;
    },
    get worlds() {
      worlds ??= new Worlds(worldsDeps, this.schema.apVersion, usualWorldFolders(), usualTemplateFolders());
      return worlds;
    },
    cacheFile,
    profiles: shippedProfiles,
    files: nodeFiles,
    engine(): CountEngine {
      // Custom worlds used in this run are loaded into the check engine too; a new one means a fresh engine.
      const files = this.worlds.filesForEngine();
      const key = files.join('|');
      if (engineInstance !== null && key !== engineFiles) {
        engineInstance.stop();
        engineInstance = null;
      }
      if (engineInstance === null) {
        // The same source folder and Python as world loading: the environment first, then the app's Settings, then the defaults.
        const chosen = appSettings();
        const settings: Settings = {
          ...chosen,
          archipelago: {
            ...chosen.archipelago,
            sourceRoot: process.env['ARCHIPELAGO_AP_ROOT'] ?? chosen.archipelago.sourceRoot,
            pythonPath: process.env['APYAML_PYTHON'] ?? chosen.archipelago.pythonPath,
          },
        };
        const spec = resolveEngineSpec(process.env, projectRoot, existsSync, settings);
        const withWorlds = 'unavailable' in spec ? spec : { ...spec, args: [...spec.args, ...files.flatMap((file) => ['--custom-world', file])] };
        engineInstance = new SeedEngine(withWorlds, { idleMs: keepEngineAlive ? 120_000 : 60_000 });
        engineFiles = key;
      }
      const engine = engineInstance;
      return { count: (game, options) => engine.count(game, options), stop: () => (keepEngineAlive ? undefined : engine.stop()) };
    },
    refreshSchema,
    invalidate() {
      // A long-running server must not keep serving the schema or the world code it loaded before the refresh.
      schema = undefined;
      engineInstance?.stop();
      engineInstance = null;
    },
    newSeed: () => Math.floor(Math.random() * 2 ** 31),
  };
}

async function main(): Promise<number> {
  // If whoever reads our output goes away, stop quietly with the exit code the command had.
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(process.exitCode ?? 0);
    throw error;
  });
  const argv = process.argv.slice(2);
  if (argv[0] === 'mcp') {
    const ctx = makeCtx(true);
    await serveMcp(process.stdin, process.stdout, () => ctx);
    engineInstance?.stop();
    return 0;
  }
  let buffer = '';
  const ctx = makeCtx(false);
  const code = await runCli(argv, () => ctx, { out: (text) => (buffer += text) });
  engineInstance?.stop();
  process.exitCode = code;
  await new Promise<void>((done) => process.stdout.write(buffer, () => done()));
  return code;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
