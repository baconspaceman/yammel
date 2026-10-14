import type { Edit } from '../model/edits';
import type { YamlDocument } from '../model/document';
import type { GameSchema, OptionSchema } from '../schema/types';

/** One preset the person saved: a game's option values under a name. */
export interface UserPreset {
  id: string;
  name: string;
  game: string;
  /** Option key -> the value as written in the YAML (plain value, list, or weights map). */
  values: Record<string, unknown>;
  savedAt: string;
}

export interface PresetsState {
  presets: UserPreset[];
}

export const EMPTY_PRESETS: PresetsState = { presets: [] };
export const MAX_PRESETS = 200;
export const MAX_PRESET_NAME = 60;
export const MAX_PRESET_VALUES_BYTES = 100_000;
export const MAX_PRESETS_BYTES = 8 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads whatever was saved and returns a valid state; anything damaged is dropped one preset at a time. */
export function parsePresets(raw: unknown): PresetsState {
  if (!isRecord(raw) || !Array.isArray(raw['presets'])) return { presets: [] };
  const out: UserPreset[] = [];
  const ids = new Set<string>();
  for (const item of raw['presets']) {
    if (!isRecord(item)) continue;
    const { id, name, game, values, savedAt } = item;
    if (typeof id !== 'string' || id === '' || id.length > 64 || ids.has(id)) continue;
    if (typeof name !== 'string' || name.trim() === '' || typeof game !== 'string' || game === '' || game.length > 200) continue;
    if (!isRecord(values) || JSON.stringify(values).length > MAX_PRESET_VALUES_BYTES) continue;
    ids.add(id);
    out.push({ id, name: name.trim().slice(0, MAX_PRESET_NAME), game, values: structuredClone(values), savedAt: typeof savedAt === 'string' ? savedAt.slice(0, 40) : '' });
    if (out.length >= MAX_PRESETS) break;
  }
  return { presets: out };
}

/**
 * Archipelago's own presets store numbers for choices (goal: 1) and 0/1 or "true" for switches. Those work, but a YAML reads better
 * with the names, so they are written as names; anything that cannot be matched is written as it came.
 */
export function readableValue(option: OptionSchema, value: unknown): unknown {
  if (option.kind === 'choice' && typeof value === 'number') return option.choices?.find((choice) => choice.value === value)?.key ?? value;
  if (option.kind === 'toggle') {
    if (value === 0 || value === 1) return value === 1;
    if (value === 'true' || value === 'false') return value === 'true';
  }
  return value;
}

/** Edits that make a game's options match a preset. Keys the game does not have are left out; keys the preset does not mention are untouched. */
export function presetEdits(game: GameSchema, values: Readonly<Record<string, unknown>>): Edit[] {
  return Object.entries(values)
    .filter(([key]) => game.options[key] !== undefined)
    .map(([option, value]): Edit => ({ op: 'set', game: game.name, option, value: readableValue(game.options[option]!, value) }));
}

/** The options of one game that are written in this YAML, ready to be saved as a preset. */
export function captureOptions(doc: YamlDocument, game: GameSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(game.options)) {
    if (doc.has(game.name, key)) out[key] = structuredClone(doc.get(game.name, key));
  }
  return out;
}

/** A preset named like an existing one for the same game replaces it; otherwise it is added. */
export function addPreset(state: PresetsState, preset: Omit<UserPreset, 'id'>, makeId: () => string): PresetsState {
  const same = state.presets.find((existing) => existing.game === preset.game && existing.name.toLowerCase() === preset.name.toLowerCase());
  if (same !== undefined) return { presets: state.presets.map((existing) => (existing === same ? { ...preset, id: same.id } : existing)) };
  return { presets: [...state.presets, { ...preset, id: makeId() }] };
}

export function removePreset(state: PresetsState, id: string): PresetsState {
  return { presets: state.presets.filter((preset) => preset.id !== id) };
}
