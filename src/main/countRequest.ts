import type { CountRequest } from '../shared/api';

const MAX_GAME_LENGTH = 200;
const MAX_OPTIONS = 500;
const MAX_JSON_BYTES = 200_000;
const MAX_DEPTH = 12;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True when no part of the value is nested deeper than the limit (checked without recursing past it). */
function withinDepth(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof value !== 'object' || value === null) return true;
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return children.every((child) => withinDepth(child, depth + 1));
}

/** Checks what the window sent before it is handed to the engine. Returns null when it is not acceptable. */
export function parseCountRequest(value: unknown): CountRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { game, options } = value as Record<string, unknown>;
  if (typeof game !== 'string' || game.length === 0 || game.length > MAX_GAME_LENGTH) return null;
  if (typeof options !== 'object' || options === null || Array.isArray(options)) return null;

  const entries = Object.entries(options as Record<string, unknown>).filter(([key]) => !FORBIDDEN_KEYS.has(key));
  if (entries.length > MAX_OPTIONS) return null;
  const clean = Object.fromEntries(entries);
  if (!withinDepth(clean)) return null; // checked before stringify, which would also choke on thousands of levels

  let json: string | undefined;
  try {
    json = JSON.stringify(clean);
  } catch {
    return null; // circular
  }
  if (json === undefined || json.length > MAX_JSON_BYTES) return null;
  // A function or symbol value silently disappears in JSON; refuse it instead of changing the meaning.
  if (Object.keys(JSON.parse(json) as object).length !== entries.length) return null;
  return { game, options: JSON.parse(json) as Record<string, unknown> };
}
