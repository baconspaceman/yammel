import { copyFile, mkdir, mkdtemp, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import type { ArchipelagoFinding } from '../shared/api';
import type { GenerateFailure, GenerateRequest, GenerateResult, GeneratorStatus } from '../shared/generate';
import { cleanEnv, runCli } from './helpers/cli';

/** How to start the generator, or why it cannot be started. */
export type GeneratorSpec =
  | { command: string; args: string[]; cwd: string; kind: 'source' | 'installed'; hostYaml: string }
  | { unavailable: string };

const NO_HOST =
  'Archipelago has not been set up on this computer yet. Open the Archipelago launcher once so it can create its host.yaml, then try again.';

/**
 * Picks the program that makes the seed: the Archipelago source folder with its Python when there is one (it is the version
 * the option data comes from), otherwise the installed ArchipelagoGenerate program. Both need the host.yaml next to them,
 * because Archipelago would otherwise create one, and this app never changes an Archipelago folder on its own.
 */
export function findGenerator(finding: ArchipelagoFinding, exists: (path: string) => boolean = existsSync): GeneratorSpec {
  if (finding.problem === null && finding.sourceRoot !== null && finding.python !== null) {
    const hostYaml = join(finding.sourceRoot, 'host.yaml');
    if (!exists(join(finding.sourceRoot, 'Generate.py'))) return { unavailable: `The Archipelago folder ${finding.sourceRoot} has no Generate.py.` };
    if (!exists(hostYaml)) return { unavailable: NO_HOST };
    return { command: finding.python, args: ['-B', '-X', 'utf8', '-W', 'ignore', join(finding.sourceRoot, 'Generate.py')], cwd: finding.sourceRoot, kind: 'source', hostYaml };
  }
  if (finding.installRoot !== null) {
    const exe = join(finding.installRoot, 'ArchipelagoGenerate.exe');
    const hostYaml = join(finding.installRoot, 'host.yaml');
    if (!exists(exe)) return { unavailable: `ArchipelagoGenerate.exe was not found in ${finding.installRoot}.` };
    if (!exists(hostYaml)) return { unavailable: NO_HOST };
    return { command: exe, args: [], cwd: finding.installRoot, kind: 'installed', hostYaml };
  }
  return { unavailable: 'No Archipelago was found to make a seed with. Install Archipelago, or choose a source folder in Settings.' };
}

export function generatorStatus(spec: GeneratorSpec): GeneratorStatus {
  if ('unavailable' in spec) return { available: false, kind: null, hostYaml: null, problem: spec.unavailable };
  return { available: true, kind: spec.kind, hostYaml: spec.hostYaml, problem: null };
}

/** A safe file name for a player file (letters, digits, spaces, dashes and dots only, ending in .yaml). */
export function safeYamlName(name: string, index: number): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ._-]+/g, '_').replace(/^[. ]+/, '').trim().slice(0, 60);
  const base = cleaned === '' ? `player${index + 1}` : cleaned;
  return /\.ya?ml$/i.test(base) ? base : `${base}.yaml`;
}

const MAX_LOG = 12_000;

/** The lines of a generator log that explain a refusal, in plain terms where possible. */
export function summarizeLog(log: string): string[] {
  const lines = log.split(/\r?\n/).map((line) => line.trimEnd());
  const out: string[] = [];
  const push = (text: string) => {
    const clean = text.trim();
    if (clean !== '' && !out.includes(clean)) out.push(clean);
  };
  lines.forEach((line, index) => {
    const invalid = /^\d+\.\s+File (.+?) document #\d+ \((.*?)\) is invalid/.exec(line.trim());
    if (invalid !== null) {
      push(`${invalid[1]} is not accepted.`);
      // the reasons follow, until a blank line or the end
      for (let next = index + 1; next < lines.length && lines[next]!.trim() !== '' && !/^Press enter/.test(lines[next]!.trim()); next += 1) {
        push(lines[next]!.trim().replace(/^Which caused:\s*/, '').replace(/^[\w.]*(Error|Exception):\s*/, ''));
      }
    }
  });
  if (out.length > 0) return out.slice(0, 6);
  for (const line of lines) {
    if (/(FillError|Exception|Error)\b.*:/.test(line) && !/^\s*File "/.test(line) && !/Traceback/.test(line) && !/atexit|EOFError/.test(line)) push(line.replace(/^[\w.]*(Error|Exception):\s*/, ''));
  }
  if (out.length > 0) return out.slice(-4);
  const tail = lines.filter((line) => line.trim() !== '' && !/^Press enter|atexit|EOFError/.test(line)).slice(-3);
  return tail.length > 0 ? tail : ['The generator stopped without saying why.'];
}

export interface RunDeps {
  spec: Extract<GeneratorSpec, { command: string }>;
  /** Where real seeds are written, one new folder per run. */
  seedsRoot: string;
  /** Where the temporary player folder goes. */
  tmpRoot?: string;
  env: Record<string, string | undefined>;
  timeoutMs?: number;
  /** Paths the person picked in a dialog; other files are never copied. */
  approvedFiles: ReadonlySet<string>;
  now?: () => Date;
  /** Stops the run when aborted. */
  signal?: AbortSignal;
}

const stamp = (date: Date) => date.toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Runs the generator on the open YAML (and any extra players' files) and reports what happened. Never throws. */
export async function runGenerate(request: GenerateRequest, deps: RunDeps): Promise<GenerateResult> {
  const started = Date.now();
  const failure = (reason: GenerateFailure['reason'], problems: string[], log = ''): GenerateFailure => ({ ok: false, reason, problems, log: log.slice(-MAX_LOG) });
  const work = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), 'apyaml-gen-'));
  let madeFolder: string | null = null;
  try {
    const players = join(work, 'players');
    await mkdir(players);
    const used = new Set<string>();
    const place = (wanted: string, index: number): string => {
      let name = safeYamlName(wanted, index);
      for (let n = 2; used.has(name.toLowerCase()); n += 1) name = safeYamlName(`${basename(wanted, extname(wanted))} ${n}`, index);
      used.add(name.toLowerCase());
      return join(players, name);
    };
    await writeFile(place(request.yaml.name, 0), request.yaml.text, 'utf8');
    for (const [i, file] of request.extraFiles.entries()) {
      if (!deps.approvedFiles.has(file)) return failure('failed', ['One of the extra player files was not chosen with the file dialog, so it was not used.']);
      await copyFile(file, place(basename(file), i + 1));
    }

    const make = request.mode === 'make';
    const folder = make ? join(deps.seedsRoot, stamp((deps.now ?? (() => new Date()))())) : null;
    if (folder !== null) {
      await mkdir(folder, { recursive: true });
      madeFolder = folder;
    }
    const args = [...deps.spec.args, '--player_files_path', players, '--outputpath', folder ?? join(work, 'out')];
    if (!make) args.push('--skip_output');

    const run = await runCli({
      command: deps.spec.command,
      args,
      input: '', // the generator waits for Enter after an error; an empty input lets it finish
      cwd: deps.spec.cwd,
      env: { ...cleanEnv(deps.env), PYTHONIOENCODING: 'utf-8' },
      timeoutMs: deps.timeoutMs ?? 5 * 60_000,
      maxChars: 8_000_000,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    if (!run.ok) {
      if (run.reason === 'timeout') return failure('stopped', ['It took longer than five minutes, so it was stopped.'], run.stdout + run.stderr);
      if (run.reason === 'aborted') return failure('stopped', ['You stopped it.'], run.stdout + run.stderr);
      return failure('failed', [run.message], run.stdout + run.stderr);
    }
    const log = `${run.stdout}${run.stderr}`;
    if (run.code !== 0) return failure('failed', summarizeLog(log), log);

    let seedFile: string | null = null;
    let spoilerFile: string | null = null;
    if (folder !== null) {
      const files = await readdir(folder).catch(() => [] as string[]);
      const zip = files.find((file) => /^AP_.*\.zip$/i.test(file));
      const spoiler = files.find((file) => /Spoiler\.txt$/i.test(file));
      if (zip === undefined) return failure('failed', ['The generator finished but wrote no seed file.'], log);
      seedFile = join(folder, zip);
      spoilerFile = spoiler === undefined ? null : join(folder, spoiler);
    }
    madeFolder = null; // kept: it holds the seed
    return { ok: true, mode: request.mode, seedFile, spoilerFile, folder, seconds: Math.round((Date.now() - started) / 100) / 10, log: log.slice(-MAX_LOG) };
  } catch (error) {
    return failure('failed', [error instanceof Error ? error.message : 'The seed could not be made.']);
  } finally {
    // A seed folder that did not get a seed is removed again, but only when it is empty.
    if (madeFolder !== null) await rmdir(madeFolder).catch(() => undefined);
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
