import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * One small JSON file in the app's data folder, read through a parser that always returns a valid value.
 * A missing, oversized or damaged file means "the empty value"; nothing is written until the first save.
 */
export class JsonFileStore<T> {
  private current: T;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly parse: (raw: unknown) => T,
    private readonly maxBytes: number,
  ) {
    this.current = parse(undefined);
  }

  get value(): T {
    return structuredClone(this.current);
  }

  async load(): Promise<T> {
    try {
      const info = await stat(this.file);
      this.current = info.isFile() && info.size <= this.maxBytes ? this.parse(JSON.parse(await readFile(this.file, 'utf8'))) : this.parse(undefined);
    } catch {
      this.current = this.parse(undefined);
    }
    return this.value;
  }

  /**
   * Cleans the value with the parser, writes it (temp file, then rename), and keeps it. If writing fails the old
   * value stays. Saves run one at a time in the order they were asked for, so quick clicks cannot make two
   * writes fight over the temp file and the last one asked for is the one that ends up on disk.
   */
  save(next: T): Promise<T> {
    const run = () => this.write(next);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async write(next: T): Promise<T> {
    const clean = this.parse(next);
    const text = `${JSON.stringify(clean)}\n`;
    if (Buffer.byteLength(text, 'utf8') > this.maxBytes) throw new Error('Too large to save.');
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    try {
      await writeFile(temp, text, 'utf8');
      await rename(temp, this.file);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    this.current = clean;
    return this.value;
  }
}
