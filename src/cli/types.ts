import type { DifficultyProfile } from '../difficulty/types';
import type { CountResult } from '../shared/api';
import type { SchemaFile } from '../schema/types';
import type { Worlds } from './worlds';

/**
 * What every command returns. `data` is plain JSON. `code` is the process exit code a failure should use:
 * 1 = the request was wrong (unknown game, bad value), 2 = a YAML was refused by the world, 3 = the check engine cannot run here.
 */
export type CommandResult =
  | { ok: true; data: Record<string, unknown>; exitCode?: 0 | 2 }
  | { ok: false; code: 1 | 2 | 3; message: string; data?: Record<string, unknown> };

/** Something this machine lacks (no schema yet, no Archipelago folder): reported with exit code 3, not as a mistake in the request. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupError';
  }
}

/** The part of the seed engine the commands use (the real SeedEngine, or a fake in tests). */
export interface CountEngine {
  count(game: string, options: Record<string, unknown>): Promise<CountResult>;
  stop(): void;
}

/** The file operations the commands use, so tests can run without touching the disk. */
export interface FilePort {
  readText(path: string): Promise<string>;
  /** Writes a new file. With overwrite false it must fail (return false) when the file already exists. */
  writeText(path: string, text: string, overwrite: boolean): Promise<boolean>;
  makeDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface Ctx {
  schema: SchemaFile;
  /** Finds games the shipped data does not have: custom worlds, then template YAMLs. */
  worlds: Worlds;
  /** Where the custom-world cache lives (shown in advanced diagnostics). */
  cacheFile: string;
  profiles: ReadonlyMap<string, DifficultyProfile>;
  files: FilePort;
  /** Starts (lazily) and returns the engine; the caller stops it when the command is done. */
  engine(): CountEngine;
  /** Runs the schema extractor against an Archipelago source folder. Resolves with a summary or an error message. */
  refreshSchema(apRoot: string | null): Promise<{ ok: true; summary: string; errors: { game: string; error: string }[] } | { ok: false; message: string }>;
  /** Called after the schema file was rewritten: forget the cached schema and stop the engine, which still holds the old world code. */
  invalidate(): void;
  /** A fresh seed when the person gave none. */
  newSeed(): number;
}

export type FlagType = 'string' | 'number' | 'boolean' | 'list';

export interface FlagSpec {
  name: string;
  type: FlagType;
  description: string;
}

export interface CommandDef {
  name: string;
  summary: string;
  /** The positional argument ("game", "file"), if the command takes one. */
  positional?: { name: string; description: string; required: boolean };
  flags: FlagSpec[];
  run(input: Record<string, unknown>, ctx: Ctx): Promise<CommandResult>;
}
