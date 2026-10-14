import { join } from 'node:path';
import { JsonFileStore } from '../jsonStore';

/** What the operating system gives us for keeping a secret safe (Electron's safeStorage in the real app). */
export interface SecretCrypto {
  available(): boolean;
  /** Text to base64 of the encrypted bytes. */
  encrypt(text: string): string;
  /** Base64 of encrypted bytes to text, or null when it cannot be read. */
  decrypt(base64: string): string | null;
}

type Encrypted = Record<string, string>;

function parseEncrypted(raw: unknown): Encrypted {
  const out: Encrypted = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (/^[a-zA-Z0-9_]{1,40}$/.test(name) && typeof value === 'string' && value.length <= 8192) out[name] = value;
  }
  return out;
}

/**
 * Keeps secrets (an OpenRouter key) encrypted with the operating system's own protection. The window can set or remove a
 * secret and can ask whether one exists, but never reads one back. Nothing is stored in plain text, and if the system cannot
 * protect a secret, saving it is refused.
 */
export class SecretStore {
  private readonly store: JsonFileStore<Encrypted>;

  constructor(
    file: string,
    private readonly crypto: SecretCrypto,
  ) {
    this.store = new JsonFileStore(file, parseEncrypted, 64 * 1024);
  }

  static in(folder: string, crypto: SecretCrypto): SecretStore {
    return new SecretStore(join(folder, 'secrets.json'), crypto);
  }

  load(): Promise<unknown> {
    return this.store.load();
  }

  get canStore(): boolean {
    return this.crypto.available();
  }

  has(name: string): boolean {
    return this.store.value[name] !== undefined && this.get(name) !== null;
  }

  /** For the main process only. */
  get(name: string): string | null {
    const encrypted = this.store.value[name];
    if (encrypted === undefined) return null;
    try {
      return this.crypto.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  async set(name: string, value: string | null): Promise<void> {
    const next = { ...this.store.value };
    if (value === null || value === '') {
      delete next[name];
    } else {
      if (!this.crypto.available()) throw new Error('This computer cannot keep a secret safely, so the key was not saved.');
      next[name] = this.crypto.encrypt(value);
    }
    await this.store.save(next);
  }
}
