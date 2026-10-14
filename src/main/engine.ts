import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchipelagoFinding, CountFailure, CountResult } from '../shared/api';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { detectArchipelago } from './detect';

/** How to start the engine, or why it cannot run on this machine. */
export type EngineSpec = { command: string; args: string[]; cwd?: string } | { unavailable: string };

export interface EngineOptions {
  /** Stop the process after this long without a request, so it does not sit in memory (default 5 minutes). */
  idleMs?: number;
  requestTimeoutMs?: number;
  startTimeoutMs?: number;
  /** After this many unexpected exits within restartWindowMs the engine reports "unavailable". */
  maxRestarts?: number;
  restartWindowMs?: number;
}

export interface EngineStatus {
  state: 'stopped' | 'starting' | 'ready' | 'unavailable';
  message?: string;
}

/** What it takes to start the engine for a finding, or why it cannot run. */
export function specFromFinding(finding: ArchipelagoFinding, appPath: string): EngineSpec {
  if (finding.problem !== null || finding.sourceRoot === null || finding.python === null) {
    return { unavailable: finding.problem ?? 'The check engine could not be set up.' };
  }
  return {
    command: finding.python,
    // -B: write no .pyc files into the Archipelago folder; -X utf8: read the app's UTF-8 input as UTF-8.
    args: ['-B', '-X', 'utf8', '-W', 'ignore', join(appPath, 'engine', 'seed_engine.py'), '--ap-root', finding.sourceRoot],
    cwd: finding.sourceRoot,
  };
}

/**
 * Finds the Archipelago source folder and its Python (see detect.ts for the order it looks in).
 * Never looks inside an installed Archipelago, and never changes anything.
 */
export function resolveEngineSpec(
  env: Record<string, string | undefined>,
  appPath: string,
  exists: (path: string) => boolean = existsSync,
  settings: Settings = DEFAULT_SETTINGS,
): EngineSpec {
  return specFromFinding(detectArchipelago({ settings, env, appPath, exists }), appPath);
}

const fail = (reason: CountFailure['reason'], message: string): CountFailure => ({ ok: false, reason, message });

/** "The check engine stopped while starting", plus the last thing it printed (usually the Python error). */
function startFailure(stderrTail: string): string {
  const last = stderrTail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  return last === undefined ? 'The check engine stopped while starting.' : `The check engine stopped while starting: ${last.slice(0, 200)}`;
}

interface Pending {
  resolve(result: CountResult): void;
  timer: NodeJS.Timeout;
}

/**
 * Talks to engine/seed_engine.py over JSON lines. The process is started on the first request, stopped
 * again after a quiet period, restarted if it dies, and given up on if it keeps dying.
 */
export class SeedEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private starting: Promise<CountFailure | null> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private buffer = '';
  private stderrTail = '';
  private idleTimer: NodeJS.Timeout | null = null;
  private crashes: number[] = [];
  private intentional = new WeakSet<ChildProcessWithoutNullStreams>();
  private readonly idleMs: number;
  private readonly requestTimeoutMs: number;
  private readonly startTimeoutMs: number;
  private readonly maxRestarts: number;
  private readonly restartWindowMs: number;

  constructor(
    private spec: EngineSpec,
    options: EngineOptions = {},
  ) {
    this.idleMs = options.idleMs ?? 5 * 60_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.startTimeoutMs = options.startTimeoutMs ?? 90_000;
    this.maxRestarts = options.maxRestarts ?? 3;
    this.restartWindowMs = options.restartWindowMs ?? 60_000;
  }

  status(): EngineStatus {
    if ('unavailable' in this.spec) return { state: 'unavailable', message: this.spec.unavailable };
    if (this.recentCrashes() >= this.maxRestarts) {
      return { state: 'unavailable', message: 'The check engine keeps stopping, so it was switched off for a minute.' };
    }
    if (this.child !== null && this.ready) return { state: 'ready' };
    if (this.starting !== null) return { state: 'starting' };
    return { state: 'stopped' };
  }

  async count(game: string, options: Record<string, unknown>): Promise<CountResult> {
    try {
      const blocked = await this.ensureStarted();
      if (blocked !== null) return blocked;
      return await this.request(game, options);
    } catch (error) {
      return fail('failed', error instanceof Error ? error.message : 'The check engine failed.');
    }
  }

  /** Switches to a different Python or Archipelago folder: ends the old process and forgets old crashes. */
  reconfigure(spec: EngineSpec): void {
    this.shutdown(true);
    this.starting = null; // a start that was in flight belongs to the old process
    this.spec = spec;
    this.crashes = [];
  }

  /** Ends the process now (used when the app quits). A later request starts a new one. */
  stop(): void {
    this.shutdown(true);
  }

  private recentCrashes(): number {
    const since = Date.now() - this.restartWindowMs;
    this.crashes = this.crashes.filter((time) => time >= since);
    return this.crashes.length;
  }

  private ensureStarted(): Promise<CountFailure | null> {
    if ('unavailable' in this.spec) return Promise.resolve(fail('unavailable', this.spec.unavailable));
    if (this.recentCrashes() >= this.maxRestarts) {
      return Promise.resolve(fail('unavailable', this.status().message ?? 'The check engine is unavailable.'));
    }
    if (this.child !== null && this.ready) return Promise.resolve(null);
    if (this.starting !== null) return this.starting;
    this.starting = this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private start(): Promise<CountFailure | null> {
    const spec = this.spec as Extract<EngineSpec, { command: string }>;
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: CountFailure | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        resolve(result);
      };

      const child = spawn(spec.command, spec.args, { cwd: spec.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.child = child;
      this.ready = false;
      this.buffer = '';
      this.stderrTail = '';
      child.stdin.on('error', () => undefined);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => this.onData(child, chunk, () => settle(null)));
      child.stderr.on('data', (chunk: string) => {
        this.stderrTail = (this.stderrTail + chunk).slice(-2000);
      });
      child.on('error', (error) => {
        this.onExit(child);
        settle(fail('unavailable', `The check engine could not be started: ${error.message}`));
      });
      child.on('exit', () => this.onExit(child));
      // 'close' comes after the output streams end, so what the process printed about its failure has arrived.
      child.on('close', () => settle(fail('unavailable', startFailure(this.stderrTail))));

      const startTimer = setTimeout(() => {
        this.intentional.add(child);
        child.kill();
        settle(fail('unavailable', 'The check engine did not become ready in time.'));
      }, this.startTimeoutMs);
    });
  }

  private onData(child: ChildProcessWithoutNullStreams, chunk: string, onReady: () => void): void {
    if (child !== this.child) return;
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
      if (line === '') continue;
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // stray text from a world; not part of the protocol
      }
      if (message['event'] === 'ready') {
        this.ready = true;
        onReady();
      } else if (typeof message['id'] === 'number') {
        this.answer(message['id'], message);
      }
    }
  }

  private answer(id: number, message: Record<string, unknown>): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message['ok'] === true) {
      pending.resolve({
        ok: true,
        checks: Number(message['checks']),
        items: Number(message['items']),
        unresolved: (message['unresolved'] as string[] | undefined) ?? [],
        invalid: (message['invalid'] as { key: string; message: string }[] | undefined) ?? [],
        ms: Number(message['ms'] ?? 0),
      });
    } else {
      const error = String(message['error'] ?? 'failed');
      const detail = String(message['detail'] ?? '');
      pending.resolve(
        fail('failed', error === 'unknown_game' ? `The seed engine does not know the game "${detail}".` : `${error}${detail ? `: ${detail}` : ''}`),
      );
    }
    this.armIdleTimer();
  }

  private request(game: string, options: Record<string, unknown>): Promise<CountResult> {
    const child = this.child;
    if (child === null) return Promise.resolve(fail('failed', 'The check engine is not running.'));
    return new Promise((resolve) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(fail('timeout', 'Counting the checks took too long.'));
        this.shutdown(true); // it may be stuck: the next request starts a fresh process
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, timer });
      this.clearIdleTimer();
      child.stdin.write(`${JSON.stringify({ id, op: 'count', game, options })}\n`);
    });
  }

  private onExit(child: ChildProcessWithoutNullStreams): void {
    if (child === this.child) {
      this.child = null;
      this.ready = false;
      this.clearIdleTimer();
    }
    if (!this.intentional.has(child)) this.crashes.push(Date.now());
    if (this.child === null) {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.resolve(fail('failed', 'The check engine stopped unexpectedly.'));
        this.pending.delete(id);
      }
    }
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    if (this.pending.size > 0) return;
    this.idleTimer = setTimeout(() => this.shutdown(false), this.idleMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private shutdown(immediate: boolean): void {
    this.clearIdleTimer();
    const child = this.child;
    if (child === null) return;
    this.intentional.add(child);
    this.child = null;
    this.ready = false;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(fail('failed', 'The check engine was stopped.'));
      this.pending.delete(id);
    }
    if (immediate) {
      child.kill(); // now, not on a timer: the app may be quitting and timers might never fire
    } else {
      child.stdin.write(`${JSON.stringify({ id: 0, op: 'quit' })}\n`); // let it finish cleanly, then make sure
      setTimeout(() => child.kill(), 1000).unref();
    }
  }
}
