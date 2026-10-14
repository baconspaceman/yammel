import { indexProfiles } from '../difficulty/registry';
import { TEST_GAME, TEST_PROFILE } from '../difficulty/testGame';
import { withGroup } from '../randomize/testGame';
import type { CountResult } from '../shared/api';
import type { SchemaFile } from '../schema/types';
import type { CountEngine, Ctx, FilePort } from './types';

export const visible = withGroup(TEST_GAME);
export const hidden = withGroup({ ...TEST_GAME, name: 'Hidden World', hidden: true });
export const other = withGroup({ ...TEST_GAME, name: 'Test Game Two' });
export const schema: SchemaFile = {
  apVersion: '0.6.7',
  extractedAt: '2026-10-13',
  games: { 'Test Game': visible, 'Hidden World': hidden, 'Test Game Two': other },
  errors: [],
};

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
): { ctx: Ctx; files: FakeFiles; engine: FakeEngine; invalidations: () => number } {
  const files = new FakeFiles();
  let invalidations = 0;
  const ctx: Ctx = {
    schema,
    profiles: indexProfiles([TEST_PROFILE]),
    files,
    engine: () => engine,
    refreshSchema: refresh ?? (async () => ({ ok: true, summary: 'AP 0.6.7: 3 games, 0 errors', errors: [] })),
    invalidate: () => {
      invalidations += 1;
    },
    newSeed: () => 777,
  };
  return { ctx, files, engine, invalidations: () => invalidations };
}
