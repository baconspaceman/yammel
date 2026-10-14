import { basename } from 'node:path';

export const MAX_RECENT = 10;
export const MAX_RECENT_BYTES = 64 * 1024;

/** The YAML files the person opened or saved lately, newest first. Only paths this app returned from a dialog are ever stored. */
export interface RecentState {
  files: { path: string; at: string }[];
}

export const EMPTY_RECENT: RecentState = { files: [] };

/** Reads whatever was saved and returns a valid list (bad entries dropped, duplicates removed, at most ten). */
export function parseRecent(raw: unknown): RecentState {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { files?: unknown }).files)) return { files: [] };
  const seen = new Set<string>();
  const files: RecentState['files'] = [];
  for (const item of (raw as { files: unknown[] }).files) {
    if (typeof item !== 'object' || item === null) continue;
    const { path, at } = item as { path?: unknown; at?: unknown };
    if (typeof path !== 'string' || path === '' || path.length > 1024 || path.includes('\u0000')) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({ path, at: typeof at === 'string' ? at.slice(0, 40) : '' });
    if (files.length >= MAX_RECENT) break;
  }
  return { files };
}

/** Puts a path at the top. The same file never appears twice. */
export function addRecent(state: RecentState, path: string, now: Date): RecentState {
  const rest = state.files.filter((file) => file.path.toLowerCase() !== path.toLowerCase());
  return { files: [{ path, at: now.toISOString() }, ...rest].slice(0, MAX_RECENT) };
}

export function removeRecent(state: RecentState, path: string): RecentState {
  return { files: state.files.filter((file) => file.path !== path) };
}

export interface RecentEntry {
  path: string;
  name: string;
  /** The folder it is in, shown small. */
  folder: string;
}

export function describeRecent(state: RecentState, exists: (path: string) => boolean): RecentEntry[] {
  return state.files
    .filter((file) => exists(file.path))
    .map((file) => ({ path: file.path, name: basename(file.path), folder: file.path.slice(0, Math.max(0, file.path.length - basename(file.path).length - 1)) }));
}
