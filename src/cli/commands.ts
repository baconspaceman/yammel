import { dirname, join, resolve } from 'node:path';
import { rateGame } from '../difficulty/registry';
import { YamlDocument } from '../model/document';
import { randomizableOptions } from '../randomize/roll';
import { engineOptionsFor } from '../renderer/state/seedOptions';
import type { CountFailure } from '../shared/api';
import type { GameSchema, OptionSchema, SchemaFile } from '../schema/types';
import { acceptsRandom } from '../randomize/randomSpec';
import { buildYaml, parseBand, validPlayerName } from './build';
import type { CommandDef, CommandResult, Ctx, FlagSpec } from './types';
import type { GameSource, ResolveOptions } from './worlds';
import { parseAssignments } from './values';

export const MAX_FUZZ = 200;
/** The dice use 32 bits, so a bigger seed would repeat a smaller one. */
const MAX_SEED = 4294967295;

/** A world refusing a YAML (its own error) is a finding about the YAML; anything else failing is a problem with the engine. */
function isWorldRefusal(failure: CountFailure): boolean {
  return failure.reason === 'failed' && failure.message.startsWith('world_error');
}

type SeedRead = { ok: true; seed: number } | { ok: false; message: string };

function readSeed(input: Record<string, unknown>, fresh: () => number): SeedRead {
  const given = input['seed'];
  if (given === undefined) return { ok: true, seed: fresh() };
  if (typeof given !== 'number' || !Number.isInteger(given) || given < 0 || given > MAX_SEED) {
    return { ok: false, message: '--seed must be a whole number from 0 to 4294967295.' };
  }
  return { ok: true, seed: given };
}

const bad = (message: string, data?: Record<string, unknown>): CommandResult => ({ ok: false, code: 1, message, ...(data ? { data } : {}) });

type GameFind = { ok: true; game: GameSchema } | { ok: false; message: string };

/**
 * A game by name: exact, then ignoring case, then by a single unique partial match. Hidden games are found too:
 * a world under development often hides itself from menus, and it is exactly the one an agent needs a YAML for.
 */
export function findGame(schema: SchemaFile, name: string): GameFind {
  const games = Object.values(schema.games);
  const wanted = name.trim().toLowerCase();
  const exact = games.find((g) => g.name === name) ?? games.find((g) => g.name.toLowerCase() === wanted);
  if (exact !== undefined) return { ok: true, game: exact };
  const partial = games.filter((g) => wanted !== '' && g.name.toLowerCase().includes(wanted));
  if (partial.length === 1) return { ok: true, game: partial[0]! };
  const near = (partial.length > 0 ? partial : games.filter((g) => wanted !== '' && wanted.includes(g.name.toLowerCase().slice(0, 4)))).slice(0, 8);
  const hint = near.length > 0 ? ` Did you mean: ${near.map((g) => `"${g.name}"`).join(', ')}?` : ' Run "games" to list them.';
  return { ok: false, message: `No game called "${name}" in the schema (Archipelago ${schema.apVersion}).${hint}` };
}

/** The flags that choose where a game comes from. The first is the mode switch; the others only work with it (advanced mode). */
export const worldFlags: FlagSpec[] = [
  { name: 'advanced', type: 'boolean', description: 'Advanced mode, for developers: also say where the game was found and what was tried, and allow --worlds, --template, --rescan and --no-auto.' },
  { name: 'worlds', type: 'list', description: '(advanced) An extra folder of .apworld files to search (repeatable).' },
  { name: 'template', type: 'string', description: "(advanced) A template YAML to read the game's options from, for a world that cannot be loaded or is still in development." },
  { name: 'rescan', type: 'boolean', description: '(advanced) Load the world file again even if it was loaded before.' },
  { name: 'no-auto', type: 'boolean', description: '(advanced) Search only the folders given with --worlds, not the usual ones.' },
];

type WorldInput = { ok: true; options: ResolveOptions; advanced: boolean } | { ok: false; message: string };

/** Reads the mode and the world-search flags. The developer flags are refused unless --advanced is given, so simple mode stays simple. */
export function readWorldInput(input: Record<string, unknown>): WorldInput {
  const advanced = input['advanced'] === true;
  const folders = list(input, 'worlds');
  const template = str(input, 'template');
  const used = [
    ...(folders.length > 0 ? ['--worlds'] : []),
    ...(template !== undefined ? ['--template'] : []),
    ...(input['rescan'] === true ? ['--rescan'] : []),
    ...(input['noAuto'] === true ? ['--no-auto'] : []),
  ];
  if (!advanced && used.length > 0) {
    return { ok: false, message: `${used.join(', ')} ${used.length === 1 ? 'is an advanced option' : 'are advanced options'}. Add --advanced to use ${used.length === 1 ? 'it' : 'them'}.` };
  }
  const options: ResolveOptions = {};
  if (folders.length > 0) options.folders = folders.map((f) => resolve(f));
  if (template !== undefined) options.template = resolve(template);
  if (input['rescan'] === true) options.rescan = true;
  if (input['noAuto'] === true) options.noAuto = true;
  return { ok: true, options, advanced };
}

/** What a result says about where its game came from: always the source, plus the diagnostics in advanced mode. */
type GameMeta = { gameFrom: GameSource; gameNote?: string; diagnostics?: Record<string, unknown> };

async function resolveGame(
  ctx: Ctx,
  input: Record<string, unknown>,
  name: string,
): Promise<{ ok: true; game: GameSchema; meta: GameMeta } | { ok: false; result: CommandResult }> {
  const world = readWorldInput(input);
  if (!world.ok) return { ok: false, result: bad(world.message) };
  const found = await ctx.worlds.resolve(ctx.schema, name, world.options);
  if (!found.ok) return { ok: false, result: bad(found.message, world.advanced ? { diagnostics: { tried: found.tried, cache: ctx.cacheFile } } : undefined) };
  const meta: GameMeta = { gameFrom: found.source };
  if (found.note !== undefined) meta.gameNote = found.note;
  if (world.advanced) {
    meta.diagnostics = { tried: found.tried, ...(found.file === undefined ? {} : { file: found.file }), cache: ctx.cacheFile, inferred: found.game.inferred === true };
  }
  return { ok: true, game: found.game, meta };
}

/** A game whose options came from a template has no world behind it, so the check engine cannot count it. */
function noEngineFor(game: GameSchema): CommandResult | null {
  if (game.inferred !== true) return null;
  return {
    ok: false,
    code: 3,
    message: `The checks of "${game.name}" cannot be counted: its options were read from a template, and no world file could be loaded for the check engine. The YAML itself can still be made and edited.`,
    data: { game: game.name, reason: 'template-only' },
  };
}

function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

function list(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Comma-separated and repeated values together: `--lock a,b --lock c`. */
function splitList(values: string[]): string[] {
  return values.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s === '' ? 'game' : s;
}

function describeKind(option: OptionSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {
    key: option.key,
    name: option.displayName,
    kind: option.kind,
    default: option.default,
    simple: option.visibility.includes('simple_ui'),
    canBeRandom: acceptsRandom(option),
  };
  if (option.choices !== undefined) out['choices'] = option.choices.map((c) => c.key);
  if (option.min !== undefined) out['min'] = option.min;
  if (option.max !== undefined) out['max'] = option.max;
  if (option.specialNames !== undefined) out['specialNames'] = Object.keys(option.specialNames);
  return out;
}

async function readDocument(ctx: Ctx, file: string): Promise<{ ok: true; doc: YamlDocument } | { ok: false; result: CommandResult }> {
  let text: string;
  try {
    text = await ctx.files.readText(file);
  } catch {
    return { ok: false, result: bad(`The file "${file}" could not be read.`) };
  }
  const doc = YamlDocument.parse(text);
  if (!doc.isValid) {
    const issues = doc.issues.map((i) => `line ${i.line}: ${i.message}`);
    return { ok: false, result: bad(`"${file}" is not a usable player YAML (${issues[0] ?? 'parse error'}).`, { issues }) };
  }
  return { ok: true, doc };
}

async function pickGameIn(
  doc: YamlDocument,
  ctx: Ctx,
  input: Record<string, unknown>,
  wanted: string | undefined,
): Promise<{ ok: true; game: GameSchema; meta: GameMeta } | { ok: false; result: CommandResult }> {
  const names = doc.games();
  if (names.length === 0) return { ok: false, result: bad('The YAML does not say which game it is for (no "game:" line).') };
  let name = wanted;
  if (name === undefined) {
    if (names.length > 1) return { ok: false, result: bad(`The YAML names several games (${names.join(', ')}); choose one with --game.`) };
    name = names[0]!;
  }
  return resolveGame(ctx, input, name);
}

const common = {
  name: { name: 'name', type: 'string', description: 'Player name, 1 to 16 plain characters (default Player).' },
  seed: { name: 'seed', type: 'number', description: 'Seed for the dice; the same seed gives the same YAML. Default: a fresh one, reported back.' },
  set: { name: 'set', type: 'list', description: 'An option to set on purpose: key=value (repeatable). Never re-rolled.' },
  lock: { name: 'lock', type: 'list', description: 'Option keys to keep out of the roll (comma-separated or repeated).' },
  band: { name: 'band', type: 'string', description: 'Keep the difficulty estimate inside low-high (0 to 10), such as 2-4.' },
  force: { name: 'force', type: 'boolean', description: 'Overwrite files that already exist.' },
} as const;

export const COMMANDS: CommandDef[] = [
  {
    name: 'games',
    summary: 'List the games in the schema, with how many options each has and whether it has a difficulty rating.',
    flags: [{ name: 'hidden', type: 'boolean', description: 'Also list games that hide themselves from menus (worlds under development often do).' }, ...worldFlags],
    async run(input, ctx) {
      const world = readWorldInput(input);
      if (!world.ok) return bad(world.message);
      const shipped = Object.values(ctx.schema.games)
        .filter((g) => input['hidden'] === true || !g.hidden)
        .map((g) => ({
          name: g.name,
          source: 'bundled' as GameSource,
          hidden: g.hidden,
          options: Object.keys(g.options).length,
          randomizable: randomizableOptions(g).length,
          rating: rateGame(g, ctx.schema.apVersion, {}, ctx.profiles).source,
        }));
      // custom worlds found in the usual folders: named from each file's manifest, loaded only when one is asked for
      const custom = (await ctx.worlds.listCustom(world.options, ctx.schema)).map((c) => ({
        name: c.name,
        source: 'custom' as GameSource,
        file: c.file,
        loaded: c.loaded,
        ...(c.problem === undefined ? {} : { problem: c.problem }),
      }));
      const games = [...shipped, ...custom].sort((a, b) => a.name.localeCompare(b.name));
      const data: Record<string, unknown> = { apVersion: ctx.schema.apVersion, count: games.length, customCount: custom.length, games };
      if (world.advanced) data['diagnostics'] = { folders: ctx.worlds.folders(world.options), cache: ctx.cacheFile };
      return { ok: true, data };
    },
  },
  {
    name: 'options',
    summary: "List one game's options: kind, default, choices or range, and whether each can be random.",
    positional: { name: 'game', description: 'the game name', required: true },
    flags: [...worldFlags],
    async run(input, ctx) {
      const found = await resolveGame(ctx, input, str(input, 'game') ?? '');
      if (!found.ok) return found.result;
      const options = Object.values(found.game.options).map(describeKind);
      return { ok: true, data: { game: found.game.name, ...found.meta, count: options.length, options } };
    },
  },
  {
    name: 'new',
    summary: 'Make one player YAML for a game: defaults, explicit --set values, and optionally randomized (seeded, repeatable).',
    positional: { name: 'game', description: 'the game name', required: true },
    flags: [
      common.name,
      common.seed,
      { name: 'randomize', type: 'boolean', description: 'Re-roll every option that is not set or locked.' },
      common.set,
      common.lock,
      common.band,
      { name: 'out', type: 'string', description: 'Write the YAML to this file (otherwise it is returned in the result).' },
      common.force,
      ...worldFlags,
    ],
    async run(input, ctx) {
      const found = await resolveGame(ctx, input, str(input, 'game') ?? '');
      if (!found.ok) return found.result;
      const game = found.game;
      const sets = parseAssignments(game, list(input, 'set'));
      if (!sets.ok) return bad(sets.message);
      let band = null;
      if (str(input, 'band') !== undefined) {
        const parsed = parseBand(str(input, 'band')!);
        if (!parsed.ok) return bad(parsed.message);
        band = parsed.band;
      }
      const seedRead = readSeed(input, ctx.newSeed);
      if (!seedRead.ok) return bad(seedRead.message);
      const seed = seedRead.seed;
      const result = buildYaml({
        game,
        apVersion: ctx.schema.apVersion,
        profiles: ctx.profiles,
        name: str(input, 'name') ?? 'Player',
        seed,
        sets: sets.values,
        lock: splitList(list(input, 'lock')),
        randomize: input['randomize'] === true,
        band,
      });
      if (!result.ok) return bad(result.message);
      const data: Record<string, unknown> = {
        game: game.name,
        ...found.meta,
        name: str(input, 'name') ?? 'Player',
        seed,
        rolled: result.rolled,
        difficulty: result.difficulty,
        options: result.options,
      };
      const out = str(input, 'out');
      if (out === undefined) return { ok: true, data: { ...data, yaml: result.text } };
      const target = resolve(out); // absolute, so it means the same thing to whoever reads the result
      await ctx.files.makeDir(dirname(target));
      if (!(await ctx.files.writeText(target, result.text, input['force'] === true))) return bad(`"${target}" already exists. Use --force to replace it.`);
      return { ok: true, data: { ...data, file: target } };
    },
  },
  {
    name: 'fuzz',
    summary: 'Make N varied YAMLs of one game (seeded, repeatable) into a folder; with --check, ask the real engine whether the world accepts each.',
    positional: { name: 'game', description: 'the game name', required: true },
    flags: [
      { name: 'count', type: 'number', description: `How many YAMLs, 1 to ${MAX_FUZZ} (default 5).` },
      common.seed,
      { name: 'out', type: 'string', description: 'Folder to write the YAMLs into (created if missing).' },
      { name: 'check', type: 'boolean', description: 'Count the checks of each YAML with the real engine; a world error means that YAML was refused.' },
      { name: 'prefix', type: 'string', description: 'Player name prefix (default Fuzz, giving Fuzz1, Fuzz2, ...).' },
      common.set,
      common.lock,
      common.band,
      common.force,
      ...worldFlags,
    ],
    async run(input, ctx) {
      const found = await resolveGame(ctx, input, str(input, 'game') ?? '');
      if (!found.ok) return found.result;
      const game = found.game;
      const count = typeof input['count'] === 'number' ? input['count'] : 5;
      if (!Number.isInteger(count) || count < 1 || count > MAX_FUZZ) return bad(`--count must be a whole number from 1 to ${MAX_FUZZ}.`);
      const outArg = str(input, 'out');
      if (outArg === undefined) return bad('--out is required: the folder to write the YAMLs into.');
      const out = resolve(outArg);
      const sets = parseAssignments(game, list(input, 'set'));
      if (!sets.ok) return bad(sets.message);
      let band = null;
      if (str(input, 'band') !== undefined) {
        const parsed = parseBand(str(input, 'band')!);
        if (!parsed.ok) return bad(parsed.message);
        band = parsed.band;
      }
      const prefix = str(input, 'prefix') ?? 'Fuzz';
      if (!validPlayerName(`${prefix}${count}`)) return bad(`--prefix "${prefix}" is too long or has characters a player name cannot have.`);
      const seedRead = readSeed(input, ctx.newSeed);
      if (!seedRead.ok) return bad(seedRead.message);
      const baseSeed = seedRead.seed;
      const lock = splitList(list(input, 'lock'));

      const built: { file: string; seed: number; name: string; text: string; options: Record<string, unknown>; difficulty: unknown; rolled: number }[] = [];
      const width = String(count).length < 2 ? 2 : String(count).length;
      for (let i = 0; i < count; i += 1) {
        const seed = (baseSeed + i) % (MAX_SEED + 1); // wraps past the top instead of losing digits
        const name = `${prefix}${i + 1}`;
        const result = buildYaml({ game, apVersion: ctx.schema.apVersion, profiles: ctx.profiles, name, seed, sets: sets.values, lock, randomize: true, band });
        if (!result.ok) return bad(`YAML ${i + 1} (seed ${seed}): ${result.message}`);
        built.push({ file: join(out, `${String(i + 1).padStart(width, '0')}-${slug(game.name)}.yaml`), seed, name, text: result.text, options: result.options, difficulty: result.difficulty, rolled: result.rolled });
      }

      await ctx.files.makeDir(out);
      if (input['force'] !== true) {
        for (const item of built) if (await ctx.files.exists(item.file)) return bad(`"${item.file}" already exists. Use --force to replace it, or pick another folder.`);
      }
      for (const item of built) await ctx.files.writeText(item.file, item.text, true);

      const files: Record<string, unknown>[] = [];
      let accepted = 0;
      let refused = 0;
      let unavailable = 0;
      let unavailableMessage = '';
      const check = input['check'] === true;
      const blocked = check ? noEngineFor(game) : null;
      if (blocked !== null) return blocked;
      const engine = check ? ctx.engine() : null;
      try {
        for (const item of built) {
          const entry: Record<string, unknown> = { file: item.file, seed: item.seed, name: item.name, difficulty: item.difficulty, options: Object.keys(item.options).length };
          if (engine !== null && unavailable === 0) {
            const counted = await engine.count(game.name, item.options);
            if (counted.ok && counted.invalid.length === 0) {
              accepted += 1;
              entry['check'] = { ok: true, checks: counted.checks, items: counted.items, unresolved: counted.unresolved };
            } else if (counted.ok) {
              refused += 1;
              entry['check'] = { ok: false, reason: 'invalid', message: counted.invalid.map((i) => `${i.key}: ${i.message}`).join('; ') };
            } else if (!isWorldRefusal(counted)) {
              unavailable += 1; // a timeout, a crash, an unknown world or no engine at all: the YAML was not judged
              unavailableMessage = counted.message;
              entry['check'] = { ok: false, reason: counted.reason, message: counted.message };
            } else {
              refused += 1;
              entry['check'] = { ok: false, reason: counted.reason, message: counted.message };
            }
          }
          files.push(entry);
        }
      } finally {
        engine?.stop();
      }

      const data = {
        game: game.name,
        ...found.meta,
        seed: baseSeed,
        count,
        out,
        files,
        summary: { written: built.length, checked: check ? accepted + refused : 0, accepted, refused, unavailable },
      };
      if (unavailable > 0) return { ok: false, code: 3, message: `The YAMLs were written, but they could not be checked: ${unavailableMessage}`, data };
      return refused > 0 ? { ok: true, data, exitCode: 2 } : { ok: true, data };
    },
  },
  {
    name: 'count',
    summary: "Count a YAML's checks with the real engine (builds the world's locations; a world error means the YAML was refused).",
    positional: { name: 'file', description: 'path to the player YAML', required: true },
    flags: [{ name: 'game', type: 'string', description: 'Which game, when the YAML names several.' }, ...worldFlags],
    async run(input, ctx) {
      const file = str(input, 'file') ?? '';
      const read = await readDocument(ctx, file);
      if (!read.ok) return read.result;
      const picked = await pickGameIn(read.doc, ctx, input, str(input, 'game'));
      if (!picked.ok) return picked.result;
      const blocked = noEngineFor(picked.game);
      if (blocked !== null) return blocked;
      const engine = ctx.engine();
      try {
        const counted = await engine.count(picked.game.name, engineOptionsFor(read.doc, picked.game.name, picked.game));
        if (!counted.ok) {
          return { ok: false, code: isWorldRefusal(counted) ? 2 : 3, message: counted.message, data: { file, game: picked.game.name, reason: counted.reason } };
        }
        const data = { file, game: picked.game.name, ...picked.meta, checks: counted.checks, items: counted.items, unresolved: counted.unresolved, invalid: counted.invalid, ms: counted.ms };
        return counted.invalid.length > 0 ? { ok: true, data, exitCode: 2 } : { ok: true, data };
      } finally {
        engine.stop();
      }
    },
  },
  {
    name: 'rate',
    summary: 'Estimate the difficulty of a YAML (0 to 10), saying where the number comes from and what moved it.',
    positional: { name: 'file', description: 'path to the player YAML', required: true },
    flags: [{ name: 'game', type: 'string', description: 'Which game, when the YAML names several.' }, ...worldFlags],
    async run(input, ctx) {
      const file = str(input, 'file') ?? '';
      const read = await readDocument(ctx, file);
      if (!read.ok) return read.result;
      const picked = await pickGameIn(read.doc, ctx, input, str(input, 'game'));
      if (!picked.ok) return picked.result;
      const rating = rateGame(picked.game, ctx.schema.apVersion, engineOptionsFor(read.doc, picked.game.name, picked.game), ctx.profiles);
      return {
        ok: true,
        data: {
          file,
          game: picked.game.name,
          ...picked.meta,
          source: rating.source,
          status: rating.status,
          score: rating.score === null ? null : Math.round(rating.score * 10) / 10,
          label: rating.label,
          moved: rating.contributions.slice(0, 10).map((c) => ({ option: c.key, value: c.valueText, delta: c.delta })),
          approximated: rating.approximated,
          note: rating.note,
        },
      };
    },
  },
  {
    name: 'worlds',
    summary: 'Advanced mode, for developers: show the folders searched for custom worlds, every .apworld found there and whether it loaded (or why not). With --scan, load them all now.',
    flags: [{ name: 'scan', type: 'boolean', description: 'Load every world file the shipped data does not have (slow the first time; cached afterwards).' }, ...worldFlags],
    async run(input, ctx) {
      if (input['advanced'] !== true) return bad('"worlds" is an advanced command. Add --advanced. (Simple mode needs no setup: custom worlds are found automatically when you ask for a game by name.)');
      const world = readWorldInput(input);
      if (!world.ok) return bad(world.message);
      const scan = input['scan'] === true ? await ctx.worlds.loadAll(world.options, ctx.schema) : null;
      const files = await ctx.worlds.status(world.options);
      const count = (state: string) => files.filter((f) => f.state === state).length;
      return {
        ok: true,
        data: {
          folders: ctx.worlds.folders(world.options),
          cache: ctx.cacheFile,
          summary: { files: files.length, loaded: count('loaded'), problems: count('problem'), notLoaded: count('not-loaded') },
          ...(scan === null ? {} : { scanned: scan }),
          files: files.map(({ path: _path, ...rest }) => rest),
        },
      };
    },
  },
  {
    name: 'schema-refresh',
    summary: 'Re-read every world in an Archipelago source folder into the schema (so a world you are building shows up with its options).',
    flags: [{ name: 'ap-root', type: 'string', description: 'The Archipelago source folder (default: the clone next to this project, or ARCHIPELAGO_AP_ROOT).' }],
    async run(input, ctx) {
      const result = await ctx.refreshSchema(str(input, 'apRoot') ?? null);
      if (!result.ok) return { ok: false, code: 3, message: result.message };
      ctx.invalidate(); // the schema file changed and the engine still holds the old world code
      return { ok: true, data: { summary: result.summary, errors: result.errors } };
    },
  },
];

export function findCommand(name: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.name === name);
}
