import type { GameSchema, OptionSchema } from '../schema/types';
import { PROFILE_FORMAT, type DifficultyProfile } from './types';

const STATUSES = ['drafted', 'reviewed', 'estimated'];
/** No single option should move the score by more than this. */
export const MAX_SHIFT = 5;
const PROFILE_KEYS = ['format', 'game', 'apVersion', 'status', 'base', 'options'];
const EFFECT_KEYS = ['why', 'values', 'curve'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShift(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_SHIFT;
}

function validateValues(where: string, option: OptionSchema, values: unknown, issues: string[]): void {
  if (!isRecord(values)) {
    issues.push(`${where}: "values" must be an object.`);
    return;
  }
  let allowed: string[];
  switch (option.kind) {
    case 'toggle':
      allowed = ['true', 'false'];
      break;
    case 'choice':
    case 'text_choice':
      allowed = (option.choices ?? []).map((c) => c.key);
      break;
    case 'named_range':
      allowed = Object.keys(option.specialNames ?? {});
      break;
    default:
      issues.push(`${where}: "values" cannot be used on a ${option.kind} option (use "curve").`);
      return;
  }
  for (const [key, shift] of Object.entries(values)) {
    if (!allowed.includes(key)) issues.push(`${where}: "${key}" is not a value of this option (allowed: ${allowed.join(', ')}).`);
    if (!isShift(shift)) issues.push(`${where}: the shift for "${key}" must be a number between -${MAX_SHIFT} and ${MAX_SHIFT}.`);
  }
}

function validateCurve(where: string, option: OptionSchema, curve: unknown, issues: string[]): void {
  if (option.kind !== 'range' && option.kind !== 'named_range') {
    issues.push(`${where}: "curve" can only be used on a range or named range (this is a ${option.kind}).`);
    return;
  }
  if (!Array.isArray(curve) || curve.length < 2) {
    issues.push(`${where}: "curve" needs at least two points.`);
    return;
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of curve) {
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !isShift(point[1])) {
      issues.push(`${where}: every curve point must be [value, shift] with a shift between -${MAX_SHIFT} and ${MAX_SHIFT}.`);
      return;
    }
    const x = point[0] as number;
    if (x <= previous) issues.push(`${where}: curve values must rise (${x} comes after ${previous}).`);
    if ((option.min !== undefined && x < option.min) || (option.max !== undefined && x > option.max)) {
      issues.push(`${where}: curve value ${x} is outside the option's range ${option.min} to ${option.max}.`);
    }
    previous = x;
  }
}

/** Everything wrong with a profile for this game, in plain words. Empty means the profile is sound. */
export function validateProfile(profile: unknown, game: GameSchema): string[] {
  if (!isRecord(profile)) return ['The profile must be an object.'];
  const issues: string[] = [];
  for (const key of Object.keys(profile)) if (!PROFILE_KEYS.includes(key)) issues.push(`Unknown field "${key}".`);
  if (profile['format'] !== PROFILE_FORMAT) issues.push(`"format" must be ${PROFILE_FORMAT}.`);
  if (profile['game'] !== game.name) issues.push(`"game" is "${String(profile['game'])}" but this is the profile for "${game.name}".`);
  if (typeof profile['apVersion'] !== 'string' || profile['apVersion'] === '') issues.push('"apVersion" must be text such as "0.6.7".');
  if (typeof profile['status'] !== 'string' || !STATUSES.includes(profile['status'])) {
    issues.push(`"status" must be one of ${STATUSES.join(', ')}.`);
  }
  const base = profile['base'];
  if (typeof base !== 'number' || !Number.isFinite(base) || base < 0 || base > 10) issues.push('"base" must be a number from 0 to 10.');

  const options = profile['options'];
  if (!isRecord(options)) {
    issues.push('"options" must be an object.');
    return issues;
  }
  for (const [key, effect] of Object.entries(options)) {
    const where = `Option "${key}"`;
    const option = game.options[key];
    if (option === undefined) {
      issues.push(`${where} does not exist in ${game.name}.`);
      continue;
    }
    if (!isRecord(effect)) {
      issues.push(`${where}: must be an object.`);
      continue;
    }
    for (const field of Object.keys(effect)) if (!EFFECT_KEYS.includes(field)) issues.push(`${where}: unknown field "${field}".`);
    if (effect['why'] !== undefined && (typeof effect['why'] !== 'string' || effect['why'].trim() === '')) {
      issues.push(`${where}: "why" must be a sentence.`);
    }
    if (effect['values'] === undefined && effect['curve'] === undefined) issues.push(`${where}: needs "values" or "curve".`);
    if (effect['values'] !== undefined) validateValues(where, option, effect['values'], issues);
    if (effect['curve'] !== undefined) validateCurve(where, option, effect['curve'], issues);
  }
  return issues;
}

/** The profile, typed, if it is sound for this game; otherwise null. */
export function asProfile(profile: unknown, game: GameSchema): DifficultyProfile | null {
  return validateProfile(profile, game).length === 0 ? (profile as DifficultyProfile) : null;
}
