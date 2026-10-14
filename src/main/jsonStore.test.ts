import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, MAX_STATE_BYTES, parseRecommenderState, setPinned } from '../recommend/state';
import { JsonFileStore } from './jsonStore';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jsonstore-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const make = (max = MAX_STATE_BYTES) => new JsonFileStore(join(dir, 'recommender.json'), parseRecommenderState, max);

describe('JsonFileStore', () => {
  it('starts empty and writes nothing until saved', async () => {
    const store = make();
    expect(await store.load()).toEqual(EMPTY_STATE);
    expect(await readdir(dir)).toEqual([]);
  });

  it('saves, then loads the same thing in a new store, leaving no temp file', async () => {
    const store = make();
    await store.save(setPinned(EMPTY_STATE, 'k', true));
    expect((await make().load()).pins).toEqual(['k']);
    expect(await readdir(dir)).toEqual(['recommender.json']);
  });

  it('survives damaged or oversized files', async () => {
    for (const text of ['{ nope', '', '[]', 'x'.repeat(300)]) {
      await writeFile(join(dir, 'recommender.json'), text);
      expect(await make(200).load()).toEqual(EMPTY_STATE);
    }
  });

  it('cleans what it saves, refuses what is too large, and keeps the old value on failure', async () => {
    const store = make(300);
    await store.save({ ...EMPTY_STATE, pins: ['a'], junk: 1 } as never);
    expect(store.value.pins).toEqual(['a']);
    const big = { ...EMPTY_STATE, pins: Array.from({ length: 200 }, (_, i) => `pair number ${i}`) };
    await expect(store.save(big)).rejects.toBeDefined();
    expect(store.value.pins).toEqual(['a']);
  });

  it('many quick saves at once all succeed, and the last one asked for is what ends up on disk', async () => {
    const store = make();
    const saves = Array.from({ length: 25 }, (_, i) => store.save({ ...EMPTY_STATE, launches: i }));
    const results = await Promise.all(saves);
    expect(results).toHaveLength(25);
    expect(store.value.launches).toBe(24);
    expect((await make().load()).launches).toBe(24);
    expect(await readdir(dir)).toEqual(['recommender.json']);
  });

  it('one failed save does not block the ones after it', async () => {
    const store = make(300);
    const big = { ...EMPTY_STATE, pins: Array.from({ length: 200 }, (_, i) => `pair number ${i}`) };
    const [bad, good] = await Promise.allSettled([store.save(big), store.save({ ...EMPTY_STATE, pins: ['ok'] })]);
    expect(bad.status).toBe('rejected');
    expect(good.status).toBe('fulfilled');
    expect(store.value.pins).toEqual(['ok']);
  });
});
