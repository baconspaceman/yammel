import { DEFAULT_WEIGHTS, PART_KEYS, WEIGHT_MAX, type Mood, type PairScore, type PartKey, type Weights } from './types';

/** Everything the recommender remembers. Lives only in the app's data folder and never leaves the machine. */
export interface RecommenderState {
  version: 1;
  /** How many times the app has been started with the recommender (the number of the current launch). */
  launches: number;
  /** Pair key -> the launch it was last shown in. */
  shown: Record<string, number>;
  pins: string[];
  dismissed: string[];
  thumbs: Record<string, 1 | -1>;
  weights: Weights;
  /** What each thumb changed in the sliders, so a thumb can be taken back and the changes can be listed. */
  nudges: { pair: string; part: PartKey; delta: number }[];
  mood: Mood;
  picks: string[];
  favourites: string[];
  dislikes: string[];
}

export const EMPTY_STATE: RecommenderState = {
  version: 1,
  launches: 0,
  shown: {},
  pins: [],
  dismissed: [],
  thumbs: {},
  weights: { ...DEFAULT_WEIGHTS },
  nudges: [],
  mood: 'balanced',
  picks: [],
  favourites: [],
  dislikes: [],
};

export const NUDGE = 0.05;
const MAX_NUDGE_LOG = 100;
const MAX_LIST = 5000;
/** Entries for pairs not shown for this many launches are dropped, so the file stays small. */
const FORGET_AFTER_LAUNCHES = 60;
export const MAX_STATE_BYTES = 1024 * 1024;

const MOODS: readonly Mood[] = ['similar', 'balanced', 'opposites'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item !== '' && item.length < 300))].slice(0, MAX_LIST);
}

function clampWeight(value: number): number {
  return Math.min(WEIGHT_MAX, Math.max(0, Math.round(value * 100) / 100));
}

/** Reads whatever was saved and returns a complete, valid state. Bad parts are dropped one by one. */
export function parseRecommenderState(raw: unknown): RecommenderState {
  const out: RecommenderState = structuredClone(EMPTY_STATE);
  if (!isRecord(raw)) return out;
  if (typeof raw['launches'] === 'number' && Number.isFinite(raw['launches']) && raw['launches'] >= 0) out.launches = Math.floor(raw['launches']);
  if (isRecord(raw['shown'])) {
    for (const [key, launch] of Object.entries(raw['shown']).slice(0, MAX_LIST)) {
      if (typeof launch === 'number' && Number.isFinite(launch)) out.shown[key] = Math.floor(launch);
    }
  }
  out.pins = stringList(raw['pins']);
  out.dismissed = stringList(raw['dismissed']);
  out.picks = stringList(raw['picks']);
  out.favourites = stringList(raw['favourites']);
  out.dislikes = stringList(raw['dislikes']);
  if (isRecord(raw['thumbs'])) {
    for (const [key, value] of Object.entries(raw['thumbs']).slice(0, MAX_LIST)) {
      if (value === 1 || value === -1) out.thumbs[key] = value;
    }
  }
  if (isRecord(raw['weights'])) {
    for (const key of PART_KEYS) {
      const value = raw['weights'][key];
      if (typeof value === 'number' && Number.isFinite(value)) out.weights[key] = clampWeight(value);
    }
  }
  if (Array.isArray(raw['nudges'])) {
    for (const entry of raw['nudges'].slice(-MAX_NUDGE_LOG)) {
      if (isRecord(entry) && typeof entry['pair'] === 'string' && PART_KEYS.includes(entry['part'] as PartKey) && typeof entry['delta'] === 'number') {
        out.nudges.push({ pair: entry['pair'], part: entry['part'] as PartKey, delta: entry['delta'] });
      }
    }
  }
  if (MOODS.includes(raw['mood'] as Mood)) out.mood = raw['mood'] as Mood;
  return out;
}

/** Counts a new start: the launch number goes up, and long-forgotten pairs are dropped. */
export function beginLaunch(state: RecommenderState): RecommenderState {
  const launches = state.launches + 1;
  const shown: Record<string, number> = {};
  for (const [key, launch] of Object.entries(state.shown)) {
    if (launches - launch <= FORGET_AFTER_LAUNCHES) shown[key] = launch;
  }
  return { ...state, launches, shown };
}

export function recordShown(state: RecommenderState, pairs: readonly PairScore[]): RecommenderState {
  const shown = { ...state.shown };
  for (const pair of pairs) shown[pair.key] = state.launches;
  return { ...state, shown };
}

const toggle = (list: readonly string[], item: string, on: boolean): string[] =>
  on ? (list.includes(item) ? [...list] : [...list, item]) : list.filter((entry) => entry !== item);

export const setPinned = (state: RecommenderState, key: string, on: boolean): RecommenderState => ({ ...state, pins: toggle(state.pins, key, on) });

/** "Never show this pair". A dismissed pair is also unpinned. */
export const dismissPair = (state: RecommenderState, key: string): RecommenderState => ({
  ...state,
  dismissed: toggle(state.dismissed, key, true),
  pins: toggle(state.pins, key, false),
});

export const setPick = (state: RecommenderState, key: string, on: boolean): RecommenderState => ({ ...state, picks: toggle(state.picks, key, on) });
export const setFavourite = (state: RecommenderState, game: string, on: boolean): RecommenderState => ({
  ...state,
  favourites: toggle(state.favourites, game, on),
  dislikes: on ? toggle(state.dislikes, game, false) : state.dislikes,
});
export const setDislike = (state: RecommenderState, game: string, on: boolean): RecommenderState => ({
  ...state,
  dislikes: toggle(state.dislikes, game, on),
  favourites: on ? toggle(state.favourites, game, false) : state.favourites,
});

export const setMood = (state: RecommenderState, mood: Mood): RecommenderState => ({ ...state, mood });

export function setWeight(state: RecommenderState, part: PartKey, value: number): RecommenderState {
  return { ...state, weights: { ...state.weights, [part]: clampWeight(value) } };
}

/** Back to the default sliders, and the list of thumb changes is cleared with them. */
export const resetWeights = (state: RecommenderState): RecommenderState => ({ ...state, weights: { ...DEFAULT_WEIGHTS }, nudges: [] });

/** Forgets what was shown, dismissed and thumbed. Pins, picks, favourites and the sliders stay. */
export const clearHistory = (state: RecommenderState): RecommenderState => ({ ...state, shown: {}, dismissed: [], thumbs: {} });

/**
 * A thumb up or down on a card. It nudges the two parts that contributed most to that pair, by a small
 * step, in the matching direction. Changing or removing a thumb first takes back what it did before.
 */
export function setThumb(state: RecommenderState, pair: PairScore, value: 1 | -1 | 0): RecommenderState {
  let next: RecommenderState = state;
  const before = state.thumbs[pair.key];
  if (before !== undefined) {
    const undone = state.nudges.filter((entry) => entry.pair === pair.key);
    const weights = { ...state.weights };
    for (const entry of undone) weights[entry.part] = clampWeight(weights[entry.part] - entry.delta);
    const thumbs = { ...state.thumbs };
    delete thumbs[pair.key];
    next = { ...state, weights, thumbs, nudges: state.nudges.filter((entry) => entry.pair !== pair.key) };
  }
  if (value === 0) return next;
  const top = [...pair.parts].sort((x, y) => y.value * y.weight - x.value * x.weight).slice(0, 2);
  const weights = { ...next.weights };
  const nudges = [...next.nudges];
  for (const part of top) {
    const delta = value * NUDGE;
    const changed = clampWeight(weights[part.key] + delta);
    if (changed === weights[part.key]) continue;
    nudges.push({ pair: pair.key, part: part.key, delta: Math.round((changed - weights[part.key]) * 100) / 100 });
    weights[part.key] = changed;
  }
  return { ...next, weights, thumbs: { ...next.thumbs, [pair.key]: value }, nudges: nudges.slice(-MAX_NUDGE_LOG) };
}
