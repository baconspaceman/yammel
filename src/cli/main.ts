import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippedProfiles } from '../difficulty/shipped';
import { resolveEngineSpec, SeedEngine } from '../main/engine';
import { parseSchemaFile } from '../schema/load';
import type { SchemaFile } from '../schema/types';
import { nodeFiles } from './nodeFiles';
import { runCli } from './run';
import { serveMcp } from './serve';
import { SetupError, type CountEngine, type Ctx } from './types';

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

function makeCtx(keepEngineAlive: boolean): Ctx {
  let schema: SchemaFile | undefined;
  return {
    // Loaded on first use, so "help" and "schema-refresh" work before there is a schema.
    get schema() {
      schema ??= loadSchema();
      return schema;
    },
    profiles: shippedProfiles,
    files: nodeFiles,
    engine(): CountEngine {
      engineInstance ??= new SeedEngine(resolveEngineSpec(process.env, projectRoot), { idleMs: keepEngineAlive ? 120_000 : 60_000 });
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
