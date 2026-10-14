import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Variables that would make a program fall back to a pay-per-use key or another account. They are removed before the
 * person's own Claude Code or Codex is started, so it can only use the login they already have.
 */
const REMOVED = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'CODEX_API_KEY',
  'OPENROUTER_API_KEY',
  'GEMINI_API_KEY',
];

export function cleanEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || REMOVED.includes(key.toUpperCase())) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Finds a program by name on the PATH. On Windows only a real .exe counts: a .cmd shim would have to be run through a shell,
 * and this app never builds a shell command line.
 */
export function findExecutable(
  name: string,
  env: Record<string, string | undefined>,
  platform: string = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const folders = (env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter((folder) => folder !== '');
  const file = platform === 'win32' ? `${name}.exe` : name;
  for (const folder of folders) {
    const candidate = join(folder, file);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Stops a program and everything it started. On Windows a Python launcher starts the real interpreter as a child, so stopping only
 * the launcher would leave a generator running for minutes after Cancel.
 */
export function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false });
    killer.on('error', () => child.kill());
    return;
  }
  child.kill();
}

export interface CliRun {
  command: string;
  args: string[];
  /** Text sent to the program's standard input. */
  input?: string;
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  /** Output beyond this many characters is dropped and the run counts as failed. */
  maxChars?: number;
  /** Stops the program when aborted. */
  signal?: AbortSignal;
}

export type CliResult =
  | { ok: true; stdout: string; stderr: string; code: number }
  | { ok: false; reason: 'timeout' | 'too-big' | 'start' | 'aborted'; message: string; stdout: string; stderr: string };

/** Runs a program with no shell, gives it the input, and waits for it, with a time limit and a size limit. */
export function runCli(run: CliRun): Promise<CliResult> {
  const maxChars = run.maxChars ?? 2_000_000;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: CliResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: run.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    const timer = setTimeout(() => {
      killTree(child);
      finish({ ok: false, reason: 'timeout', message: 'It took too long to answer.', stdout, stderr });
    }, run.timeoutMs);
    const abort = () => {
      killTree(child);
      finish({ ok: false, reason: 'aborted', message: 'It was stopped.', stdout, stderr });
    };
    if (run.signal?.aborted === true) abort();
    else run.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > maxChars) {
        killTree(child);
        finish({ ok: false, reason: 'too-big', message: 'The answer was far too long.', stdout: stdout.slice(0, 1000), stderr });
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => finish({ ok: false, reason: 'start', message: `It could not be started: ${error.message}`, stdout, stderr }));
    child.on('close', (code) => finish({ ok: true, stdout, stderr, code: code ?? -1 }));
    child.stdin.end(run.input ?? '');
  });
}
