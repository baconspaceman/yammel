import { YamlDocument } from '../model/document';
import { inferGameSchema } from '../schema/infer';
import { closest } from '../validate/text';
import type { GameSchema, SchemaFile } from '../schema/types';
import { readApworldManifest } from './zipManifest';

/**
 * How `apyaml` finds a game it was not shipped with. For any game name it tries, in order:
 *   1. the game data that ships with Yammel;
 *   2. a custom world: an `.apworld` file in a folder Archipelago keeps worlds in. The file's manifest names its game, so only that one
 *      file is loaded (through Archipelago's own loader) and the result is cached until the file changes;
 *   3. a template YAML for the game (Archipelago writes one per installed world into Players/Templates): its options are read from the file.
 * Anything else is a plain message that says what was tried. Nothing here changes the shipped data or any Archipelago folder.
 */

export type GameSource = 'bundled' | 'custom' | 'template';

export interface WorldFile {
  path: string;
  name: string;
  stem: string;
  size: number;
  mtimeMs: number;
  /** The game the file's manifest names; null for an old world with no manifest. */
  game: string | null;
}

export interface ScanOutcome {
  games: Record<string, GameSchema>;
  /** Why the file could not be loaded (a plain sentence), or null. */
  problem: string | null;
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  game: string | null;
  scanned?: Record<string, GameSchema>;
  problem?: string;
}

export interface CacheFile {
  version: 1;
  apVersion: string;
  files: Record<string, CacheEntry>;
}

export interface WorldsDeps {
  /** The .apworld files directly inside a folder (empty when it does not exist). */
  listWorldFiles(folder: string): Promise<{ path: string; name: string; size: number; mtimeMs: number }[]>;
  readBytes(path: string): Promise<Buffer>;
  /** Loads one .apworld with Archipelago's loader and returns the games it added, or why it could not. */
  scanFile(path: string): Promise<ScanOutcome>;
  readCache(): Promise<CacheFile | null>;
  writeCache(cache: CacheFile): Promise<void>;
  /** The .yaml files directly inside a folder (empty when it does not exist). */
  listTemplates(folder: string): Promise<{ path: string; name: string }[]>;
  readText(path: string): Promise<string | null>;
  /** The Yammel app's last custom-world scan, when there is one (optional). */
  readAppScan?(): Promise<AppScan | null>;
}

/** What the Yammel app loaded in its last custom-world scan: every game, read once by Archipelago's loader. */
export interface AppScan {
  folder: string;
  /** When the scan ran (milliseconds). A world file changed after it is loaded again here. */
  scannedAt: number;
  apVersion: string;
  games: Record<string, GameSchema>;
}

export interface ResolveOptions {
  /** Extra folders of .apworld files (advanced). */
  folders?: string[];
  /** Search only the folders given above, not the usual ones (advanced). */
  noAuto?: boolean;
  /** A template YAML to read the options from (advanced). */
  template?: string;
  /** Load the world again even if it was cached (advanced). */
  rescan?: boolean;
}

export type Resolved =
  | { ok: true; game: GameSchema; source: GameSource; file?: string; note?: string; tried: string[] }
  | { ok: false; message: string; tried: string[] };

export const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

function fileSafe(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '');
}

export class Worlds {
  private cache: CacheFile | null | undefined;
  private readonly loaded = new Map<string, GameSchema>();
  private readonly engineFiles = new Set<string>();
  private appScan: AppScan | null | undefined;

  private async readAppScan(): Promise<AppScan | null> {
    if (this.appScan === undefined) this.appScan = (await this.deps.readAppScan?.().catch(() => null)) ?? null;
    return this.appScan;
  }

  /** A game from the app's scan, if its world file is still there and unchanged since the scan. */
  private async fromAppScan(files: WorldFile[], wanted: string): Promise<{ game: GameSchema; file: WorldFile } | null> {
    const scan = await this.readAppScan();
    if (scan === null) return null;
    const game = Object.values(scan.games).find((g) => normalizeName(g.name) === wanted);
    if (game === undefined || game.customFile === undefined) return null;
    const folder = scan.folder.replace(/[\\/]+$/, '').toLowerCase();
    const file = files.find((f) => f.name === game.customFile && f.path.slice(0, -f.name.length).replace(/[\\/]+$/, '').toLowerCase() === folder);
    if (file === undefined || file.mtimeMs > scan.scannedAt) return null;
    return { game, file };
  }

  constructor(
    private readonly deps: WorldsDeps,
    private readonly apVersion: string,
    /** The usual folders of .apworld files on this machine. */
    private readonly usualFolders: string[],
    /** The usual folders of template YAMLs. */
    private readonly templateFolders: string[],
  ) {}

  /** The custom world files whose games were used in this run: the check engine needs the same files. */
  filesForEngine(): string[] {
    return [...this.engineFiles].sort();
  }

  folders(options: ResolveOptions): string[] {
    const given = options.folders ?? [];
    const all = options.noAuto === true ? given : [...given, ...this.usualFolders];
    const seen = new Set<string>();
    return all.filter((folder) => {
      const key = folder.replace(/[\\/]+$/, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async readCache(): Promise<CacheFile> {
    if (this.cache === undefined) {
      const read = await this.deps.readCache().catch(() => null);
      this.cache = read !== null && read.version === 1 && read.apVersion === this.apVersion ? read : { version: 1, apVersion: this.apVersion, files: {} };
    }
    return this.cache!;
  }

  /** Every .apworld in the folders, with the game its manifest names. Reads only the manifest, never runs the world. */
  async discover(options: ResolveOptions): Promise<WorldFile[]> {
    const cache = await this.readCache();
    const files: WorldFile[] = [];
    let changed = false;
    for (const folder of this.folders(options)) {
      for (const entry of await this.deps.listWorldFiles(folder).catch(() => [])) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const known = cache.files[entry.path];
        let game: string | null;
        if (known !== undefined && known.size === entry.size && known.mtimeMs === entry.mtimeMs) {
          game = known.game;
        } else {
          const manifest = await this.deps.readBytes(entry.path).then(readApworldManifest, () => null);
          game = manifest?.game ?? null;
          cache.files[entry.path] = { size: entry.size, mtimeMs: entry.mtimeMs, game };
          changed = true;
        }
        files.push({ path: entry.path, name: entry.name, stem: entry.name.replace(/\.apworld$/i, ''), size: entry.size, mtimeMs: entry.mtimeMs, game });
      }
    }
    if (changed) await this.deps.writeCache(cache).catch(() => undefined);
    return files;
  }

  /** The games a bundled schema does not have, from the manifests of the discovered files (no loading). */
  async listCustom(options: ResolveOptions, bundled: SchemaFile): Promise<{ name: string; file: string; loaded: boolean; problem?: string }[]> {
    const cache = await this.readCache();
    const have = new Set(Object.keys(bundled.games).map(normalizeName));
    const out: { name: string; file: string; loaded: boolean; problem?: string }[] = [];
    for (const file of await this.discover(options)) {
      const name = file.game ?? file.stem;
      if (have.has(normalizeName(name))) continue;
      const entry = cache.files[file.path];
      const scan = await this.readAppScan();
      const loaded = (entry?.scanned !== undefined && Object.keys(entry.scanned).length > 0) || (scan !== null && Object.values(scan.games).some((g) => normalizeName(g.name) === normalizeName(name)));
      out.push({ name, file: file.name, loaded, ...(entry?.problem === undefined ? {} : { problem: entry.problem }) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every discovered file and what is known about it: loaded, failed (with the reason), or not loaded yet. */
  async status(options: ResolveOptions): Promise<{ file: string; path: string; game: string | null; state: 'loaded' | 'problem' | 'not-loaded'; problem?: string; games?: string[] }[]> {
    const cache = await this.readCache();
    const out = [];
    for (const file of await this.discover(options)) {
      const entry = cache.files[file.path];
      const scanned = entry?.scanned !== undefined ? Object.keys(entry.scanned) : [];
      out.push({
        file: file.name,
        path: file.path,
        game: file.game,
        state: scanned.length > 0 ? ('loaded' as const) : entry?.problem !== undefined ? ('problem' as const) : ('not-loaded' as const),
        ...(entry?.problem === undefined ? {} : { problem: entry.problem }),
        ...(scanned.length > 0 ? { games: scanned } : {}),
      });
    }
    return out.sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Loads every discovered world file the shipped data does not already have (slow the first time; cached afterwards). */
  async loadAll(options: ResolveOptions, bundled: SchemaFile): Promise<{ loaded: number; failed: number }> {
    const have = new Set(Object.keys(bundled.games).map(normalizeName));
    let loaded = 0;
    let failed = 0;
    for (const file of await this.discover(options)) {
      if (file.game !== null && have.has(normalizeName(file.game))) continue;
      const result = await this.load(file, options.rescan === true);
      if ('games' in result) {
        loaded += 1;
        for (const g of Object.values(result.games)) this.loaded.set(normalizeName(g.name), { ...g, customFile: file.name });
      } else {
        failed += 1;
      }
    }
    return { loaded, failed };
  }

  private matchFiles(files: WorldFile[], name: string): WorldFile[] {
    const wanted = normalizeName(name);
    if (wanted === '') return [];
    const exact = files.filter((f) => (f.game !== null ? normalizeName(f.game) === wanted : false) || normalizeName(f.stem) === wanted);
    if (exact.length > 0) return exact;
    const partial = files.filter((f) => normalizeName(f.game ?? f.stem).includes(wanted) || (wanted.length >= 6 && wanted.includes(normalizeName(f.game ?? f.stem))));
    return partial.length === 1 ? partial : [];
  }

  /** Loads (or reads from the cache) the games one file holds. */
  private async load(file: WorldFile, rescan: boolean): Promise<{ games: Record<string, GameSchema> } | { problem: string }> {
    const cache = await this.readCache();
    const entry = cache.files[file.path];
    if (!rescan && entry !== undefined && entry.size === file.size && entry.mtimeMs === file.mtimeMs) {
      if (entry.scanned !== undefined && Object.keys(entry.scanned).length > 0) return { games: entry.scanned };
      if (entry.problem !== undefined) return { problem: entry.problem };
    }
    const outcome = await this.deps.scanFile(file.path);
    const next: CacheEntry = { size: file.size, mtimeMs: file.mtimeMs, game: file.game };
    if (Object.keys(outcome.games).length > 0) next.scanned = outcome.games;
    else next.problem = outcome.problem ?? 'It did not add a game.';
    cache.files[file.path] = next;
    await this.deps.writeCache(cache).catch(() => undefined);
    return next.scanned !== undefined ? { games: next.scanned } : { problem: next.problem! };
  }

  private async fromTemplate(name: string, options: ResolveOptions): Promise<{ game: GameSchema; file: string } | { searched: string[]; problem?: string }> {
    const candidates: string[] = [];
    if (options.template !== undefined) candidates.push(options.template);
    if (options.template === undefined || options.noAuto !== true) {
      const wanted = normalizeName(name);
      for (const folder of this.templateFolders) {
        for (const entry of await this.deps.listTemplates(folder).catch(() => [])) {
          const stem = entry.name.replace(/\.ya?ml$/i, '');
          if (normalizeName(stem) === wanted || normalizeName(fileSafe(stem)) === wanted) candidates.push(entry.path);
        }
      }
    }
    for (const path of candidates) {
      const text = await this.deps.readText(path);
      if (text === null) continue;
      const doc = YamlDocument.parse(text);
      if (!doc.isValid) continue;
      const gameName = doc.games().find((g) => normalizeName(g) === normalizeName(name)) ?? (options.template !== undefined ? doc.games()[0] : undefined);
      if (gameName === undefined) continue;
      const info = doc.templateInfo(gameName);
      if (info.length === 0) continue;
      return { game: inferGameSchema(gameName, info), file: path };
    }
    return { searched: candidates.length > 0 ? candidates : this.templateFolders };
  }

  /**
   * Finds one game by name. Order: bundled schema (exact), custom world file (manifest names this game), bundled partial match,
   * custom world partial match, then a template. Never throws.
   */
  async resolve(bundled: SchemaFile, name: string, options: ResolveOptions = {}): Promise<Resolved> {
    const tried: string[] = [];
    const wanted = normalizeName(name);
    const games = Object.values(bundled.games);
    const exact = games.find((g) => g.name === name) ?? games.find((g) => g.name.toLowerCase() === name.trim().toLowerCase());
    if (exact !== undefined && options.template === undefined) return { ok: true, game: exact, source: 'bundled', tried: ['the game data that ships with Yammel'] };
    tried.push('the game data that ships with Yammel');

    const remembered = this.loaded.get(wanted);
    if (remembered !== undefined && options.rescan !== true) {
      return { ok: true, game: remembered, source: remembered.inferred === true ? 'template' : 'custom', ...(remembered.customFile === undefined ? {} : { file: remembered.customFile }), tried };
    }

    let problem: string | null = null;
    let matchedFile: string | null = null;
    if (options.template === undefined) {
      const folders = this.folders(options);
      tried.push(folders.length === 0 ? 'no custom world folders' : `custom world folders: ${folders.join('; ')}`);
      const files = await this.discover(options);
      if (options.rescan !== true) {
        const scanned = await this.fromAppScan(files, wanted);
        if (scanned !== null) {
          const game: GameSchema = { ...scanned.game, customFile: scanned.file.name };
          this.loaded.set(wanted, game);
          this.engineFiles.add(scanned.file.path);
          return { ok: true, game, source: 'custom', file: scanned.file.name, tried };
        }
      }
      const matches = this.matchFiles(files, name);
      if (matches.length === 0) {
        const partial = games.filter((g) => wanted !== '' && normalizeName(g.name).includes(wanted));
        if (partial.length === 1) return { ok: true, game: partial[0]!, source: 'bundled', tried };
      }
      for (const file of matches) {
        matchedFile = file.name;
        const loaded = await this.load(file, options.rescan === true);
        if ('games' in loaded) {
          const hit = Object.values(loaded.games).find((g) => normalizeName(g.name) === wanted) ?? Object.values(loaded.games)[0];
          if (hit !== undefined) {
            const game: GameSchema = { ...hit, customFile: file.name };
            for (const g of Object.values(loaded.games)) this.loaded.set(normalizeName(g.name), { ...g, customFile: file.name });
            this.engineFiles.add(file.path);
            return { ok: true, game, source: 'custom', file: file.name, tried };
          }
        } else {
          problem = loaded.problem;
        }
      }
    }

    const templated = await this.fromTemplate(name, options);
    if ('game' in templated) {
      const note =
        problem !== null
          ? `The world file ${matchedFile ?? 'for it'} could not be loaded (${problem}), so the options were read from the template ${templated.file}.`
          : `No world file was found, so the options were read from the template ${templated.file}.`;
      this.loaded.set(wanted, templated.game);
      return { ok: true, game: templated.game, source: 'template', file: templated.file, note, tried };
    }
    tried.push(options.template !== undefined ? `the template ${options.template}` : `template folders: ${templated.searched.join('; ')}`);
    const why = problem !== null ? ` The world file ${matchedFile ?? 'for it'} was found but could not be loaded: ${problem}` : '';
    const hint = problem !== null
      ? ' Give a template YAML of the game with --template (advanced mode), or generate one from the Archipelago launcher ("Generate Template Options").'
      : ' Put the game\'s .apworld in Archipelago\'s custom_worlds folder, add its folder with --worlds (advanced mode), or give a template YAML with --template (advanced mode).';
    const near = closest(name, [...games.filter((g) => !g.hidden).map((g) => g.name), ...(await this.listCustom(options, bundled)).map((c) => c.name)]);
    const mean = near === undefined ? '' : ` Did you mean "${near}"?`;
    return { ok: false, message: `No game called "${name}" was found (Archipelago ${bundled.apVersion}).${mean}${why}${hint}`, tried };
  }
}
