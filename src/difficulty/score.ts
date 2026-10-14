import type { GameSchema, OptionSchema } from '../schema/types';
import type { Contribution, DifficultyProfile, OptionEffect, ScoreResult } from './types';

export const SCORE_MIN = 0;
export const SCORE_MAX = 10;

/** Samples used to average a numeric option that is set to plain "random". */
const RANDOM_SAMPLES = 21;

function clamp(value: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
}

/** Straight-line shift between curve points; outside the curve the nearest end point holds. */
export function curveAt(curve: readonly [number, number][], x: number): number {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i]!;
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]!;
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** The value of an object's own key, never one inherited from Object.prototype ("constructor", "toString"...). */
function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** The words Archipelago's Toggle accepts, in any case (see Toggle.from_text in Options.py). */
const TRUE_WORDS = ['true', 'on', 'yes', 'enabled', '1'];
const FALSE_WORDS = ['false', 'off', 'no', 'disabled', '0', 'none', 'null'];

/** 'true' or 'false' for whatever YAML value stands for a switch, or null. */
function toggleKey(raw: unknown): 'true' | 'false' | null {
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  const word = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (TRUE_WORDS.includes(word)) return 'true';
  if (FALSE_WORDS.includes(word)) return 'false';
  return null;
}

/**
 * The choice key a YAML value stands for, or null. Archipelago lowercases choice text, so any case matches; YAML turns an
 * unquoted on/off/yes/no into a boolean (or the text "true"/"false" when it was a mapping key), so those are matched back to
 * choices called on/off/yes/no.
 */
function choiceKeyOf(option: OptionSchema, raw: unknown): string | null {
  const byLowercase = new Map((option.choices ?? []).map((c) => [c.key.toLowerCase(), c.key]));
  const candidates: string[] = [];
  const asToggle = typeof raw === 'boolean' || typeof raw === 'string' ? toggleKey(raw) : null;
  if (typeof raw === 'boolean' || (typeof raw === 'string' && ['true', 'false'].includes(raw.trim().toLowerCase()))) {
    candidates.push(...(asToggle === 'true' ? ['true', 'on', 'yes'] : ['false', 'off', 'no']));
  } else if (typeof raw === 'string' || typeof raw === 'number') {
    candidates.push(String(raw).trim().toLowerCase());
  }
  for (const candidate of candidates) {
    const canonical = own(option.aliases, candidate) ?? candidate;
    const key = byLowercase.get(canonical.toLowerCase());
    if (key !== undefined) return key;
  }
  return null;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Shift for one concrete value; null when the value cannot be read for this option. */
function concreteShift(effect: OptionEffect, option: OptionSchema, raw: unknown): number | null {
  switch (option.kind) {
    case 'toggle': {
      const key = toggleKey(raw);
      return key === null ? null : (own(effect.values, key) ?? 0);
    }
    case 'choice':
    case 'text_choice': {
      const key = choiceKeyOf(option, raw);
      return key === null ? null : (own(effect.values, key) ?? 0);
    }
    case 'range':
    case 'named_range': {
      if (typeof raw === 'string' && option.specialNames !== undefined) {
        const wanted = raw.trim().toLowerCase();
        const name = Object.keys(option.specialNames).find((n) => n.toLowerCase() === wanted);
        if (name !== undefined) {
          const listed = own(effect.values, name);
          if (listed !== undefined) return listed;
          return effect.curve === undefined ? 0 : curveAt(effect.curve, option.specialNames[name]!);
        }
      }
      let number = Number.NaN;
      if (typeof raw === 'number') number = raw;
      else if (typeof raw === 'string' && DECIMAL.test(raw.trim())) number = Number(raw.trim());
      if (!Number.isFinite(number)) return null;
      return effect.curve === undefined ? 0 : curveAt(effect.curve, number);
    }
    default:
      return null;
  }
}

/** Average shift over everything "random" can pick. */
function uniformShift(effect: OptionEffect, option: OptionSchema): number | null {
  switch (option.kind) {
    case 'toggle':
      return ((own(effect.values, 'true') ?? 0) + (own(effect.values, 'false') ?? 0)) / 2;
    case 'choice':
    case 'text_choice': {
      const choices = option.choices ?? [];
      if (choices.length === 0) return null;
      return choices.reduce((sum, c) => sum + (own(effect.values, c.key) ?? 0), 0) / choices.length;
    }
    case 'range':
    case 'named_range': {
      if (option.min === undefined || option.max === undefined || effect.curve === undefined) return 0;
      let sum = 0;
      for (let i = 0; i < RANDOM_SAMPLES; i += 1) {
        sum += curveAt(effect.curve, option.min + ((option.max - option.min) * i) / (RANDOM_SAMPLES - 1));
      }
      return sum / RANDOM_SAMPLES;
    }
    default:
      return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Shift {
  value: number;
  /** True when the value was random or weighted and is counted as an average. */
  averaged: boolean;
}

/** Shift for a value as written in the YAML: a concrete value, plain "random", or a weighted table. null when it cannot be read. */
function shiftOf(effect: OptionEffect, option: OptionSchema, raw: unknown): Shift | null {
  if (isPlainObject(raw)) {
    let weighted = 0;
    let total = 0;
    for (const [key, weight] of Object.entries(raw)) {
      const w = typeof weight === 'number' ? weight : Number(weight);
      if (!Number.isFinite(w) || w < 0) return null;
      if (w === 0) continue;
      const shift = key.trim().toLowerCase() === 'random' ? uniformShift(effect, option) : concreteShift(effect, option, key);
      if (shift === null) return null;
      weighted += w * shift;
      total += w;
    }
    return total > 0 ? { value: weighted / total, averaged: true } : null;
  }
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'random') {
    const shift = uniformShift(effect, option);
    return shift === null ? null : { value: shift, averaged: true };
  }
  const shift = concreteShift(effect, option, raw);
  return shift === null ? null : { value: shift, averaged: false };
}

function valueText(option: OptionSchema, raw: unknown): string {
  if (isPlainObject(raw)) return 'weighted';
  if (option.kind === 'toggle' && typeof raw === 'boolean') return raw ? 'On' : 'Off';
  if (option.kind === 'choice' || option.kind === 'text_choice') {
    const key = choiceKeyOf(option, raw);
    const label = (option.choices ?? []).find((c) => c.key === key)?.label;
    if (label !== undefined) return label;
  }
  return String(raw);
}

/**
 * Score one game's option values with a profile. `values` holds only the options the YAML sets (as in engineOptionsFor);
 * anything missing is at its default and shifts nothing.
 */
export function scoreProfile(profile: DifficultyProfile, game: GameSchema, values: Record<string, unknown>): ScoreResult {
  const contributions: Contribution[] = [];
  const approximated: string[] = [];
  let total = profile.base;

  for (const [key, effect] of Object.entries(profile.options)) {
    const option = game.options[key];
    if (option === undefined || !Object.hasOwn(values, key)) continue;
    const raw = values[key];
    if (raw === null || raw === undefined) continue;

    const current = shiftOf(effect, option, raw);
    if (current === null) {
      approximated.push(option.displayName);
      continue;
    }
    if (current.averaged) approximated.push(option.displayName);
    const atDefault = shiftOf(effect, option, option.default)?.value ?? 0;
    const delta = current.value - atDefault;
    total += delta;
    const shown = Math.round(delta * 100) / 100;
    if (shown !== 0) {
      contributions.push({ key, displayName: option.displayName, valueText: valueText(option, raw), delta: shown, why: effect.why ?? null });
    }
  }

  contributions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
  return { score: clamp(total), contributions, approximated };
}
