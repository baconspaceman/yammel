import { indexProfiles } from '../difficulty/registry';
import { TEST_GAME, TEST_PROFILE } from '../difficulty/testGame';
import { withGroup } from '../randomize/testGame';
import type { CountResult } from '../shared/api';
import type { SchemaFile } from '../schema/types';
import type { CountEngine, Ctx, FilePort } from './types';
import { Worlds, type AppScan, type CacheFile, type ScanOutcome, type WorldsDeps } from './worlds';

export const visible = withGroup(TEST_GAME);
export const hidden = withGroup({ ...TEST_GAME, name: 'Hidden World', hidden: true });
export const other = withGroup({ ...TEST_GAME, name: 'Test Game Two' });
export const schema: SchemaFile = {
  apVersion: '0.6.7',
  extractedAt: '2026-10-13',
  games: { 'Test Game': visible, 'Hidden World': hidden, 'Test Game Two': other },
  errors: [],
};

/** An in-memory stand-in for the disk and the world loader, so the world search can be tested without Python or Archipelago. */
export class FakeWorldsDeps implements WorldsDeps {
  /** folder -> .apworld files in it */
  worldFiles = new Map<string, { name: string; size: number; mtimeMs: number; bytes: Buffer }[]>();
  /** file name -> what loading it gives */
  scans = new Map<string, ScanOutcome>();
  scanCalls: string[] = [];
  cache: CacheFile | null = null;
  readAppScan?: () => Promise<AppScan | null>;
  /** folder -> template files */
  templates = new Map<string, { name: string; text: string }[]>();
  async listWorldFiles(folder: string) {
    return (this.worldFiles.get(folder) ?? []).map((f) => ({ path: `${folder}/${f.name}`, name: f.name, size: f.size, mtimeMs: f.mtimeMs }));
  }
  async readBytes(path: string): Promise<Buffer> {
    for (const [folder, files] of this.worldFiles) for (const f of files) if (path === `${folder}/${f.name}`) return f.bytes;
    throw new Error('ENOENT');
  }
  async scanFile(path: string): Promise<ScanOutcome> {
    this.scanCalls.push(path);
    return this.scans.get(path.split('/').pop()!) ?? { games: {}, problem: 'It did not add a game.' };
  }
  async readCache() {
    return this.cache;
  }
  async writeCache(cache: CacheFile) {
    this.cache = JSON.parse(JSON.stringify(cache)) as CacheFile;
  }
  async listTemplates(folder: string) {
    return (this.templates.get(folder) ?? []).map((t) => ({ path: `${folder}/${t.name}`, name: t.name }));
  }
  /** Files read by exact path (for a template the person points at). */
  fileOverrides = new Map<string, string>();
  async readText(path: string): Promise<string | null> {
    if (this.fileOverrides.has(path)) return this.fileOverrides.get(path)!;
    for (const [folder, files] of this.templates) for (const t of files) if (path === `${folder}/${t.name}`) return t.text;
    return null;
  }
}

export class FakeFiles implements FilePort {
  files = new Map<string, string>();
  dirs: string[] = [];
  async readText(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error('ENOENT');
    return text;
  }
  async writeText(path: string, text: string, overwrite: boolean): Promise<boolean> {
    if (!overwrite && this.files.has(path)) return false;
    this.files.set(path, text);
    return true;
  }
  async makeDir(path: string): Promise<void> {
    this.dirs.push(path);
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

export class FakeEngine implements CountEngine {
  calls: { game: string; options: Record<string, unknown> }[] = [];
  stopped = 0;
  constructor(private readonly reply: (n: number, options: Record<string, unknown>) => CountResult) {}
  async count(game: string, options: Record<string, unknown>): Promise<CountResult> {
    this.calls.push({ game, options });
    return this.reply(this.calls.length, options);
  }
  stop(): void {
    this.stopped += 1;
  }
}

export const accepted = (checks = 6): CountResult => ({ ok: true, checks, items: checks, unresolved: [], invalid: [], ms: 1 });

export function makeCtx(
  engine: FakeEngine = new FakeEngine(() => accepted()),
  refresh?: Ctx['refreshSchema'],
): { ctx: Ctx; files: FakeFiles; engine: FakeEngine; invalidations: () => number; worldsDeps: FakeWorldsDeps } {
  const files = new FakeFiles();
  const worldsDeps = new FakeWorldsDeps();
  let invalidations = 0;
  const ctx: Ctx = {
    schema,
    worlds: new Worlds(worldsDeps, schema.apVersion, ['/worlds'], ['/templates']),
    cacheFile: '/cache/worlds-cache.json',
    profiles: indexProfiles([TEST_PROFILE]),
    files,
    engine: () => engine,
    refreshSchema: refresh ?? (async () => ({ ok: true, summary: 'AP 0.6.7: 3 games, 0 errors', errors: [] })),
    invalidate: () => {
      invalidations += 1;
    },
    newSeed: () => 777,
  };
  return { ctx, files, engine, invalidations: () => invalidations, worldsDeps };
}
