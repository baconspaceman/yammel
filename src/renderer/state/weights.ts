import type { Edit } from '../../model/edits';
import type { OptionSchema } from '../../schema/types';

/** Kinds whose single value can be replaced by "pick one of these, with these weights". */
export const WEIGHTED_KINDS: readonly string[] = ['toggle', 'choice', 'text_choice', 'range', 'named_range'];

export function canWeigh(option: OptionSchema): boolean {
  return option.supportsWeighting && WEIGHTED_KINDS.includes(option.kind);
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/** The weights in the file as numbers, or null when the option does not hold a weights map (or one this editor cannot show). */
export function weightsOf(option: OptionSchema, raw: unknown): Record<string, number> | null {
  if (!canWeigh(option) || !isPlainObject(raw)) return null;
  const entries = Object.entries(raw);
  // Archipelago reads each weight with int(), so a fractional weight would be cut; those are left to the Raw tab.
  if (entries.length === 0 || !entries.every(([, weight]) => typeof weight === 'number' && Number.isInteger(weight) && weight >= 0)) return null;
  return Object.fromEntries(entries as [string, number][]);
}

/** What a value is called on screen: "On", a choice's label, a number as it is. */
export function valueLabel(option: OptionSchema, key: string): string {
  if (option.kind === 'toggle') return /^(true|on|yes)$/i.test(key) ? 'On' : /^(false|off|no)$/i.test(key) ? 'Off' : key;
  return option.choices?.find((choice) => choice.key.toLowerCase() === key.toLowerCase())?.label ?? key;
}

/** The first weights a person sees when they switch an option to weighted: two values, evenly weighted, one of them the current one. */
export function initialWeights(option: OptionSchema, current: unknown): Record<string, number> {
  if (option.kind === 'toggle') return { true: 50, false: 50 };
  if (option.kind === 'choice' || option.kind === 'text_choice') {
    const keys = (option.choices ?? []).map((choice) => choice.key);
    const here = typeof current === 'string' && keys.includes(current) ? current : keys.includes(String(option.default)) ? String(option.default) : keys[0];
    const other = keys.find((key) => key !== here);
    if (here === undefined) return {};
    return other === undefined ? { [here]: 50 } : { [here]: 50, [other]: 50 };
  }
  const min = option.min ?? 0;
  const max = option.max ?? 0;
  const here = typeof current === 'number' && Number.isInteger(current) ? current : typeof option.default === 'number' && option.default >= min && option.default <= max ? option.default : min;
  const other = here === min ? max : min;
  return other === here ? { [String(here)]: 50 } : { [String(here)]: 50, [String(other)]: 50 };
}

/** Values that can still be added, in a sensible order, for the "Add a value" list. Numbers are typed instead. */
export function addableValues(option: OptionSchema, weights: Record<string, number>): { key: string; label: string }[] {
  const have = new Set(Object.keys(weights).map((key) => key.toLowerCase()));
  if (option.kind === 'toggle') return ['true', 'false'].filter((key) => !have.has(key)).map((key) => ({ key, label: valueLabel(option, key) }));
  if (option.kind === 'choice' || option.kind === 'text_choice') {
    return (option.choices ?? []).filter((choice) => !have.has(choice.key.toLowerCase())).map((choice) => ({ key: choice.key, label: choice.label }));
  }
  return [...Object.keys(option.specialNames ?? {}), ...(option.extraWords ?? [])]
    .filter((name) => !have.has(name.toLowerCase()))
    .map((name) => ({ key: name, label: name }));
}

export function isNumeric(option: OptionSchema): boolean {
  return option.kind === 'range' || option.kind === 'named_range';
}

/** Each weight as a whole-number percentage of the total (0 for all when the total is 0). They may not add to exactly 100. */
export function percentages(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, total > 0 ? Math.round((weight / total) * 100) : 0]));
}

export function setWeightsEdit(game: string, option: OptionSchema, weights: Record<string, number>): Edit {
  // Whole-number keys are written as numbers (`40: 50`) only for number options; a choice's names stay text.
  return { op: 'setWeights', game, option: option.key, weights, numericKeys: isNumeric(option) };
}

/** Why these weights cannot be saved yet, or null when they can. */
export function weightsProblem(weights: Record<string, number>): string | null {
  if (Object.keys(weights).length === 0) return 'Add at least one value.';
  if (!Object.values(weights).some((weight) => weight > 0)) return 'At least one weight must be above 0, or nothing can be picked.';
  return null;
}
