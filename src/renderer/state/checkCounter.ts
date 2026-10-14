import type { CountOk, CountRequest, CountResult } from '../../shared/api';
import { countKey } from './seedOptions';

export type CounterState =
  | { status: 'idle' }
  /** `last` is the previous good number, kept on screen (dimmed) while the new one is worked out. */
  | { status: 'calculating'; last: CountOk | null }
  /** `baseline` is the game's count with no options set, for "(default 223)". */
  | { status: 'ready'; result: CountOk; baseline: CountOk | null }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string; last: CountOk | null };

export interface CountClient {
  count(request: CountRequest): Promise<CountResult>;
}

export interface CounterOptions {
  /** Wait this long after the last edit before asking the engine (default 300 ms). */
  debounceMs?: number;
  /** How many earlier answers to remember (default 100). */
  cacheSize?: number;
  /** After "unavailable", do not ask again for this long, then try again by itself (default 30 s). */
  unavailableCooldownMs?: number;
  /** After a failed or timed-out count, try again after this long (default 5 s). */
  retryErrorMs?: number;
}

/**
 * Decides when to ask the engine for a check count and what to show meanwhile. It waits for a pause in
 * typing, remembers earlier answers, ignores answers that arrive late, and never shows an invented number.
 */
export class CheckCounter {
  private current: CounterState = { status: 'idle' };
  private readonly listeners = new Set<() => void>();
  private readonly cache = new Map<string, CountOk>();
  private readonly baselines = new Map<string, CountOk>();
  private readonly baselineAsked = new Set<string>();
  private latestKey: string | null = null;
  private latestGame: string | null = null;
  private latestIsDefault = false;
  private latestOptions: Record<string, unknown> = {};
  /** The last good number, remembered with its game so it is never shown for a different one. */
  private lastGood: { game: string; result: CountOk } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unavailableUntil = 0;
  private unavailableMessage = '';
  private disposed = false;
  /** Bumped by reset(), so answers asked for before it are ignored even if their key comes back. */
  private epoch = 0;
  private readonly debounceMs: number;
  private readonly cacheSize: number;
  private readonly cooldownMs: number;
  private readonly retryErrorMs: number;

  constructor(
    private readonly client: CountClient,
    options: CounterOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 300;
    this.cacheSize = options.cacheSize ?? 100;
    this.cooldownMs = options.unavailableCooldownMs ?? 30_000;
    this.retryErrorMs = options.retryErrorMs ?? 5_000;
  }

  get state(): CounterState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Call with the YAML's current option values whenever they may have changed. Repeats are free. */
  request(game: string, options: Record<string, unknown>): void {
    if (this.disposed) return;
    const key = countKey(game, options);
    if (key === this.latestKey && this.current.status !== 'error') return;
    this.latestKey = key;
    this.latestGame = game;
    this.latestOptions = options;
    this.latestIsDefault = Object.keys(options).length === 0;
    this.clearTimer();
    this.clearRetry();

    const cached = this.cacheGet(key);
    if (cached !== null) {
      this.showReady(cached);
      void this.ensureBaseline(game);
      return;
    }
    if (Date.now() < this.unavailableUntil) {
      this.set({ status: 'unavailable', message: this.unavailableMessage });
      this.scheduleRetry(this.unavailableUntil - Date.now()); // not an edit-only recovery: it tries again by itself
      return;
    }
    this.set({ status: 'calculating', last: this.lastFor(game) });
    this.timer = setTimeout(() => void this.run(key, game, options), this.debounceMs);
  }

  /**
   * Forgets every earlier answer and asks again for the latest values. Used after the engine's settings
   * change (a new Archipelago folder, say), when old answers and an old "unavailable" no longer apply.
   */
  reset(): void {
    if (this.disposed) return;
    this.epoch += 1;
    const game = this.latestGame;
    const options = this.latestOptions;
    this.clearTimer();
    this.clearRetry();
    this.cache.clear();
    this.baselines.clear();
    this.baselineAsked.clear();
    this.lastGood = null;
    this.unavailableUntil = 0;
    this.latestKey = null;
    this.set({ status: 'idle' });
    if (game !== null) this.request(game, options);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.clearRetry();
    this.listeners.clear();
  }

  private lastFor(game: string): CountOk | null {
    return this.lastGood !== null && this.lastGood.game === game ? this.lastGood.result : null;
  }

  private scheduleRetry(delayMs: number): void {
    this.clearRetry();
    this.retryTimer = setTimeout(() => this.retry(), Math.max(0, delayMs));
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Asks again for the latest values after an outage or failure, without waiting for another edit. */
  private retry(): void {
    this.retryTimer = null;
    if (this.disposed || this.latestKey === null || this.latestGame === null) return;
    if (this.current.status !== 'unavailable' && this.current.status !== 'error') return;
    this.set({ status: 'calculating', last: this.lastFor(this.latestGame) });
    void this.run(this.latestKey, this.latestGame, this.latestOptions);
  }

  private async run(key: string, game: string, options: Record<string, unknown>): Promise<void> {
    this.timer = null;
    const epoch = this.epoch;
    const result = await this.client.count({ game, options });
    if (this.disposed || epoch !== this.epoch || key !== this.latestKey) return; // an edit made this answer out of date
    if (result.ok) {
      this.cachePut(key, result);
      this.lastGood = { game, result };
      this.showReady(result);
      void this.ensureBaseline(game);
    } else if (result.reason === 'unavailable') {
      this.unavailableUntil = Date.now() + this.cooldownMs;
      this.unavailableMessage = result.message;
      this.set({ status: 'unavailable', message: result.message });
      this.scheduleRetry(this.cooldownMs);
    } else {
      this.set({ status: 'error', message: result.message, last: this.lastFor(game) });
      this.scheduleRetry(this.retryErrorMs);
    }
  }

  private showReady(result: CountOk): void {
    if (this.latestIsDefault && this.latestGame !== null) this.baselines.set(this.latestGame, result);
    const baseline = this.latestGame === null ? null : (this.baselines.get(this.latestGame) ?? null);
    this.set({ status: 'ready', result, baseline });
  }

  private async ensureBaseline(game: string): Promise<void> {
    if (this.baselines.has(game) || this.baselineAsked.has(game)) return;
    this.baselineAsked.add(game);
    const epoch = this.epoch;
    const result = await this.client.count({ game, options: {} });
    if (this.disposed || epoch !== this.epoch) return;
    if (!result.ok) {
      this.baselineAsked.delete(game); // try again on a later edit
      return;
    }
    this.baselines.set(game, result);
    if (this.current.status === 'ready' && this.latestGame === game) {
      this.set({ status: 'ready', result: this.current.result, baseline: result });
    }
  }

  private cacheGet(key: string): CountOk | null {
    const found = this.cache.get(key);
    if (found === undefined) return null;
    this.cache.delete(key);
    this.cache.set(key, found); // most recently used goes last
    return found;
  }

  private cachePut(key: string, result: CountOk): void {
    this.cache.delete(key);
    this.cache.set(key, result);
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(next: CounterState): void {
    this.current = next;
    for (const listener of [...this.listeners]) listener();
  }
}
