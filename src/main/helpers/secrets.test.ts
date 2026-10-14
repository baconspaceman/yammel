import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecretStore, type SecretCrypto } from './secrets';

const fakeCrypto = (available = true): SecretCrypto => ({
  available: () => available,
  encrypt: (text) => Buffer.from(`enc:${text.split('').reverse().join('')}`).toString('base64'),
  decrypt: (base64) => {
    const text = Buffer.from(base64, 'base64').toString();
    return text.startsWith('enc:') ? text.slice(4).split('').reverse().join('') : null;
  },
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'secrets-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SecretStore', () => {
  it('keeps a secret across restarts and never writes it in plain text', async () => {
    const store = SecretStore.in(dir, fakeCrypto());
    await store.load();
    await store.set('openRouter', 'sk-or-very-secret');
    expect(await readFile(join(dir, 'secrets.json'), 'utf8')).not.toContain('sk-or-very-secret');
    const again = SecretStore.in(dir, fakeCrypto());
    await again.load();
    expect(again.has('openRouter')).toBe(true);
    expect(again.get('openRouter')).toBe('sk-or-very-secret');
  });

  it('removes a secret when given null or an empty string', async () => {
    const store = SecretStore.in(dir, fakeCrypto());
    await store.set('openRouter', 'k');
    await store.set('openRouter', null);
    expect(store.has('openRouter')).toBe(false);
    await store.set('openRouter', 'k2');
    await store.set('openRouter', '');
    expect(store.get('openRouter')).toBeNull();
  });

  it('refuses to save when the system cannot protect it, but still lets one be removed', async () => {
    const store = SecretStore.in(dir, fakeCrypto(false));
    expect(store.canStore).toBe(false);
    await expect(store.set('openRouter', 'k')).rejects.toThrow('cannot keep a secret safely');
    await expect(store.set('openRouter', null)).resolves.toBeUndefined();
  });

  it('treats a secret it can no longer decrypt as not set', async () => {
    const store = SecretStore.in(dir, fakeCrypto());
    await store.set('openRouter', 'k');
    const broken = SecretStore.in(dir, { available: () => true, encrypt: () => '', decrypt: () => null });
    await broken.load();
    expect(broken.has('openRouter')).toBe(false);
  });

  it('ignores damaged files and odd names', async () => {
    const store = SecretStore.in(dir, fakeCrypto());
    await store.set('bad name!', 'k').catch(() => undefined);
    expect(store.has('bad name!')).toBe(false);
  });
});
