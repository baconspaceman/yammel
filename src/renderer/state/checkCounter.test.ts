import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CountOk, CountRequest, CountResult } from '../../shared/api';
import { CheckCounter, type CountClient, type CounterState } from './checkCounter';

const ok = (checks: number): CountOk => ({ ok: true, checks, items: checks, unresolved: [], invalid: [], ms: 1 });

class FakeClient implements CountClient {
  calls: CountRequest[] = [];
  private waiting: ((result: CountResult) => void)[] = [];
  manual = false;
  answer: (request: CountRequest) => CountResult = (request) => ok(10 + Object.keys(request.options).length);

  count(request: CountRequest): Promise<CountResult> {
    this.calls.push(request);
    if (this.manual) return new Promise((resolve) => this.waiting.push(resolve));
    return Promise.resolve(this.answer(request));
  }

  /** Answers the oldest request still waiting (manual mode). */
  respond(index: number, result: CountResult): void {
    this.waiting[index]!(result);
  }
}

let client: FakeClient;
let counter: CheckCounter;
const settle = () => vi.advanceTimersByTimeAsync(400);

beforeEach(() => {
  vi.useFakeTimers();
  client = new FakeClient();
  counter = new CheckCounter(client, { debounceMs: 300, cacheSize: 3, unavailableCooldownMs: 30_000 });
});

afterEach(() => {
  counter.dispose();
  vi.useRealTimers();
});

const status = () => counter.state.status;

describe('CheckCounter', () => {
  it('starts idle and shows "calculating" as soon as something is requested', () => {
    expect(status()).toBe('idle');
    counter.request('G', { a: 1 });
    expect(counter.state).toEqual({ status: 'calculating', last: null });
    expect(client.calls).toHaveLength(0); // still inside the debounce
  });

  it('asks the engine once after the pause and then shows the result', async () => {
    counter.request('G', { a: 1 });
    await settle();
    expect(client.calls).toEqual([{ game: 'G', options: { a: 1 } }, { game: 'G', options: {} }]); // the value, then the default
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 11 }, baseline: { checks: 10 } });
  });

  it('sends only the latest values when edits arrive in quick succession', async () => {
    counter.request('G', { a: 1 });
    await vi.advanceTimersByTimeAsync(100);
    counter.request('G', { a: 1, b: 2 });
    await vi.advanceTimersByTimeAsync(100);
    counter.request('G', { a: 1, b: 2, c: 3 });
    await settle();
    expect(client.calls[0]).toEqual({ game: 'G', options: { a: 1, b: 2, c: 3 } });
    expect(client.calls.filter((c) => Object.keys(c.options).length > 0)).toHaveLength(1);
  });

  it('keeps showing the previous number (dimmed) while a new one is calculated', async () => {
    counter.request('G', { a: 1 });
    await settle();
    counter.request('G', { a: 1, b: 2 });
    expect(counter.state).toMatchObject({ status: 'calculating', last: { checks: 11 } });
  });

  it('ignores an old answer that arrives after a newer request', async () => {
    client.manual = true;
    counter.request('G', { a: 1 });
    await vi.advanceTimersByTimeAsync(300); // request A sent, unanswered
    counter.request('G', { a: 1, b: 2 });
    await vi.advanceTimersByTimeAsync(300); // request B sent
    client.respond(1, ok(99)); // B answers first
    await vi.advanceTimersByTimeAsync(0);
    client.respond(0, ok(5)); // the stale A answers last
    await vi.advanceTimersByTimeAsync(0);
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 99 } });
  });

  it('answers a repeat of earlier values from memory without asking again', async () => {
    counter.request('G', { a: 1 });
    await settle();
    counter.request('G', { a: 2 });
    await settle();
    const before = client.calls.length;
    counter.request('G', { a: 1 });
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 11 } });
    await settle();
    expect(client.calls).toHaveLength(before);
  });

  it('does nothing when the same values are requested again', async () => {
    counter.request('G', { a: 1 });
    await settle();
    const before = client.calls.length;
    counter.request('G', { a: 1 });
    counter.request('G', { a: 1 });
    await settle();
    expect(client.calls).toHaveLength(before);
    expect(status()).toBe('ready');
  });

  it('counts the default once per game, and uses the result itself when no options are set', async () => {
    counter.request('G', {});
    await settle();
    expect(client.calls).toEqual([{ game: 'G', options: {} }]);
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 10 }, baseline: { checks: 10 } });
    counter.request('G', { a: 1 });
    await settle();
    expect(client.calls.filter((c) => Object.keys(c.options).length === 0)).toHaveLength(1);
  });

  it('forgets the oldest entries beyond the memory size', async () => {
    for (const n of [1, 2, 3, 4]) {
      counter.request('G', { v: n });
      await settle();
    }
    const before = client.calls.length;
    counter.request('G', { v: 1 }); // the oldest was forgotten, so this must ask again
    await settle();
    expect(client.calls.length).toBeGreaterThan(before);
  });

  it('shows "unavailable" with the reason and stops asking for a while', async () => {
    client.answer = () => ({ ok: false, reason: 'unavailable', message: 'No Archipelago source folder was found.' });
    counter.request('G', { a: 1 });
    await settle();
    expect(counter.state).toEqual({ status: 'unavailable', message: 'No Archipelago source folder was found.' });
    const before = client.calls.length;
    counter.request('G', { a: 2 });
    await settle();
    expect(client.calls).toHaveLength(before);
    expect(status()).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(31_000);
    counter.request('G', { a: 3 });
    await settle();
    expect(client.calls.length).toBeGreaterThan(before);
  });

  it('shows an error that keeps the last good number when counting fails or times out', async () => {
    counter.request('G', { a: 1 });
    await settle();
    client.answer = () => ({ ok: false, reason: 'timeout', message: 'Counting the checks took too long.' });
    counter.request('G', { a: 1, b: 2 });
    await settle();
    expect(counter.state).toMatchObject({ status: 'error', message: 'Counting the checks took too long.', last: { checks: 11 } });
  });

  it('never shows one game\'s number while another game is calculating or has failed', async () => {
    counter.request('Game One', { a: 1 });
    await settle();
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 11 } });
    counter.request('Game Two', { a: 1 });
    expect(counter.state).toEqual({ status: 'calculating', last: null });
    client.answer = () => ({ ok: false, reason: 'failed', message: 'boom' });
    await settle();
    expect(counter.state).toEqual({ status: 'error', message: 'boom', last: null });
  });

  it('keeps the last good number while the same game recalculates, but not after visiting another game', async () => {
    counter.request('G', { a: 1 });
    await settle();
    counter.request('G', { a: 1, b: 2 });
    expect(counter.state).toMatchObject({ status: 'calculating', last: { checks: 11 } });
    await settle();
    counter.request('Other', { a: 1 });
    await settle();
    counter.request('G', { c: 3 });
    expect(counter.state).toEqual({ status: 'calculating', last: null }); // better nothing than another game's number
  });

  it('tries again by itself once the cool-down after "unavailable" is over', async () => {
    client.answer = () => ({ ok: false, reason: 'unavailable', message: 'The check engine keeps stopping.' });
    counter.request('G', { a: 1 });
    await settle();
    expect(status()).toBe('unavailable');
    client.answer = (request) => ok(10 + Object.keys(request.options).length); // the engine recovered
    await vi.advanceTimersByTimeAsync(31_000);
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 11 } });
  });

  it('tries a failed count again after a short wait, and keeps trying until it works', async () => {
    client.answer = () => ({ ok: false, reason: 'timeout', message: 'Counting the checks took too long.' });
    counter.request('G', { a: 1 });
    await settle();
    expect(status()).toBe('error');
    await vi.advanceTimersByTimeAsync(5_100);
    expect(status()).toBe('error'); // failed again, so it waits again
    client.answer = (request) => ok(10 + Object.keys(request.options).length);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 11 } });
  });

  it('retries the latest values, not the ones from when the failure happened', async () => {
    client.answer = () => ({ ok: false, reason: 'timeout', message: 'Counting the checks took too long.' });
    counter.request('G', { a: 1 });
    await settle();
    client.answer = (request) => ok(100 + Object.keys(request.options).length);
    counter.request('G', { a: 1, b: 2, c: 3 });
    await settle();
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 103 } });
  });

  it('stops retrying after dispose', async () => {
    client.answer = () => ({ ok: false, reason: 'timeout', message: 'slow' });
    counter.request('G', { a: 1 });
    await settle();
    const calls = client.calls.length;
    counter.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.calls).toHaveLength(calls);
  });

  it('tells subscribers about every change and stops after unsubscribe or dispose', async () => {
    const seen: CounterState['status'][] = [];
    const off = counter.subscribe(() => seen.push(counter.state.status));
    counter.request('G', { a: 1 });
    await settle();
    expect(seen).toContain('calculating');
    expect(seen).toContain('ready');
    off();
    const count = seen.length;
    counter.request('G', { a: 2 });
    await settle();
    expect(seen).toHaveLength(count);
  });

  it('does not call the engine after dispose', async () => {
    counter.request('G', { a: 1 });
    counter.dispose();
    await settle();
    expect(client.calls).toHaveLength(0);
  });

  it('reset() forgets "unavailable" and old answers, then asks again for the latest values', async () => {
    client.answer = () => ({ ok: false, reason: 'unavailable', message: 'No Archipelago source folder was found.' });
    counter.request('G', { a: 1 });
    await settle();
    expect(status()).toBe('unavailable');
    client.answer = () => ok(77);
    counter.reset(); // the person just chose a folder in Settings
    await settle();
    expect(counter.state).toMatchObject({ status: 'ready', result: { checks: 77 } });
  });

  it('reset() before anything was requested does nothing', () => {
    counter.reset();
    expect(status()).toBe('idle');
    expect(client.calls).toHaveLength(0);
  });
});
