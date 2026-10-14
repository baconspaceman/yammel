import { rateGame } from '../difficulty/registry';
import type { DifficultyProfile } from '../difficulty/types';
import type { SchemaFile } from '../schema/types';
import type { Feel, FeelFile, GameInfo, WorldFacts, WorldFactsFile } from './types';

const ERAS = ['classic', 'mid', 'modern'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const scale = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;

function parseFeel(raw: unknown): Feel | null {
  if (!isRecord(raw)) return null;
  const pace = scale(raw['pace']);
  const length = scale(raw['length']);
  const era = ERAS.find((candidate) => candidate === raw['era']);
  if (typeof raw['genre'] !== 'string' || pace === null || length === null || era === undefined) return null;
  return {
    genre: raw['genre'],
    pace,
    length,
    tones: strings(raw['tones']),
    era,
    families: strings(raw['families']),
    activities: strings(raw['activities']),
  };
}

/** Reads the shipped feel profiles. A damaged entry is skipped, so that game is simply "guessed". */
export function parseFeelFile(raw: unknown): FeelFile {
  const out: FeelFile = { note: '', games: {} };
  if (!isRecord(raw)) return out;
  if (typeof raw['note'] === 'string') out.note = raw['note'];
  if (isRecord(raw['games'])) {
    for (const [name, entry] of Object.entries(raw['games'])) {
      const feel = parseFeel(entry);
      if (feel !== null) out.games[name] = feel;
    }
  }
  return out;
}

function parseFacts(raw: unknown): WorldFacts | null {
  if (!isRecord(raw)) return null;
  const checks = raw['checks'];
  const items = raw['items'];
  if (typeof checks !== 'number' || !Number.isFinite(checks) || checks < 0) return null;
  const earlyOpen = raw['earlyOpen'];
  return {
    checks,
    items: typeof items === 'number' && Number.isFinite(items) ? items : 0,
    earlyOpen: typeof earlyOpen === 'number' && Number.isFinite(earlyOpen) ? earlyOpen : null,
    needsFile: raw['needsFile'] === true,
    systems: strings(raw['systems']),
  };
}

/** Reads the shipped world facts. A world that failed to scan, or has a damaged entry, has no facts. */
export function parseFactsFile(raw: unknown): WorldFactsFile {
  const out: WorldFactsFile = { apVersion: '', scannedAt: '', games: {}, failed: {} };
  if (!isRecord(raw)) return out;
  if (typeof raw['apVersion'] === 'string') out.apVersion = raw['apVersion'];
  if (typeof raw['scannedAt'] === 'string') out.scannedAt = raw['scannedAt'];
  if (isRecord(raw['games'])) {
    for (const [name, entry] of Object.entries(raw['games'])) {
      const facts = parseFacts(entry);
      if (facts !== null) out.games[name] = facts;
    }
  }
  return out;
}

/**
 * One GameInfo for every visible game in the schema. Feel and facts are looked up by name; a game missing
 * from either simply has null there. The difficulty is only used for games with a curated rating (an
 * "Estimated" number is a movement from a guessed midpoint, not a rating).
 */
export function buildGameInfos(
  schema: SchemaFile,
  feel: FeelFile | null,
  facts: WorldFactsFile | null,
  profiles: ReadonlyMap<string, DifficultyProfile>,
): GameInfo[] {
  return Object.values(schema.games)
    .filter((game) => !game.hidden)
    .map((game) => {
      const rating = rateGame(game, schema.apVersion, {}, profiles);
      return {
        name: game.name,
        feel: feel?.games[game.name] ?? null,
        facts: facts?.games[game.name] ?? null,
        difficulty: rating.source === 'rated' ? rating.score : null,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}
