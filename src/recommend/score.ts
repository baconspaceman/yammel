import {
  PART_KEYS,
  type Feel,
  type GameInfo,
  type Mood,
  type PairScore,
  type Part,
  type PartKey,
  type Source,
  type Weights,
  DEFAULT_WEIGHTS,
} from './types';

/** How much each part counts before the mood and the person's sliders are applied. */
const BASE_WEIGHT: Record<PartKey, number> = { friction: 1, length: 1, difficulty: 0.6, startup: 0.8, vibe: 1, contrast: 1 };

/**
 * Taste comes first and practical fit second, so in "Balanced" the two taste parts together weigh about as
 * much as all four practical parts. "Similar vibes" leans on vibe match, "Opposites attract" on contrast.
 */
const MOOD_WEIGHT: Record<Mood, { vibe: number; contrast: number }> = {
  similar: { vibe: 3.2, contrast: 0.4 },
  balanced: { vibe: 1.8, contrast: 1.8 },
  opposites: { vibe: 0.4, contrast: 3.2 },
};

const PICK_BONUS = 8;
const FAVOURITE_BONUS = 4;
const DISLIKE_PENALTY = 12;

export interface ScoreOptions {
  mood?: Mood;
  weights?: Weights;
  /** Pair keys the person added to their picks list. */
  picks?: ReadonlySet<string>;
  favourites?: ReadonlySet<string>;
  dislikes?: ReadonlySet<string>;
}

/** The same key for (A, B) and (B, A). */
export function pairKey(x: string, y: string): string {
  return x < y ? `${x}\u001f${y}` : `${y}\u001f${x}`;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function jaccard(x: readonly string[], y: readonly string[]): number {
  if (x.length === 0 && y.length === 0) return 0;
  const a = new Set(x);
  const intersection = y.filter((item) => a.has(item)).length;
  return intersection / new Set([...x, ...y]).size;
}

const ERA_ORDER = { classic: 0, mid: 1, modern: 2 } as const;

interface Raw {
  value: number;
  source: Source;
  reason: string;
}

function friction(a: GameInfo, b: GameInfo): Raw | null {
  if (a.facts === null || b.facts === null) return null;
  const files = [a, b].filter((game) => game.facts!.needsFile);
  const emulators = new Set([...a.facts.systems, ...b.facts.systems]);
  const cost = files.length + emulators.size;
  const value = clamp01(1 - cost / 4);
  if (cost === 0) return { value, source: 'scanned', reason: 'Neither game needs a ROM, an emulator or a file you supply.' };
  const needs: string[] = [];
  for (const game of [a, b]) {
    const bits: string[] = [];
    if (game.facts!.needsFile) bits.push('a file you supply');
    if (game.facts!.systems.length > 0) bits.push(`BizHawk (${game.facts!.systems.join(', ')})`);
    if (bits.length > 0) needs.push(`${game.name} needs ${bits.join(' and ')}`);
  }
  return { value, source: 'scanned', reason: `${needs.join('; ')}.` };
}

function length(a: GameInfo, b: GameInfo): Raw | null {
  if (a.facts !== null && b.facts !== null) {
    const small = Math.max(1, Math.min(a.facts.checks, b.facts.checks));
    const large = Math.max(1, Math.max(a.facts.checks, b.facts.checks));
    const ratio = small / large;
    const verdict = ratio >= 0.7 ? 'well matched' : ratio >= 0.4 ? 'a fair match' : 'very different in size';
    return {
      value: clamp01(Math.sqrt(ratio)),
      source: 'scanned',
      reason: `${a.name} has ${a.facts.checks} checks and ${b.name} has ${b.facts.checks}: ${verdict}.`,
    };
  }
  if (a.feel !== null && b.feel !== null) {
    const gap = Math.abs(a.feel.length - b.feel.length);
    return {
      value: clamp01(1 - gap / 4),
      source: 'drafted',
      reason: gap <= 1 ? 'They should take about the same time to finish.' : 'One is much longer than the other.',
    };
  }
  return null;
}

function difficulty(a: GameInfo, b: GameInfo): Raw | null {
  if (a.difficulty === null || b.difficulty === null) return null;
  const gap = Math.abs(a.difficulty - b.difficulty);
  return {
    value: clamp01(1 - gap / 10),
    source: 'drafted',
    reason: `Rated ${a.difficulty.toFixed(1)} and ${b.difficulty.toFixed(1)} out of 10 (drafted ratings).`,
  };
}

/** A "dead start" is a game with next to nothing to do before you find your first item. */
function isDeadStart(game: GameInfo): boolean | null {
  const facts = game.facts;
  if (facts === null || facts.earlyOpen === null) return null;
  return facts.earlyOpen <= 2 || facts.earlyOpen / Math.max(1, facts.checks) < 0.03;
}

function startup(a: GameInfo, b: GameInfo): Raw | null {
  const deadA = isDeadStart(a);
  const deadB = isDeadStart(b);
  if (deadA === null || deadB === null) return null;
  if (deadA && deadB) {
    return { value: 0.15, source: 'scanned', reason: `Neither game has much open at the start (${a.facts!.earlyOpen} and ${b.facts!.earlyOpen} checks), so early play can stall.` };
  }
  if (deadA !== deadB) {
    const [closed, open] = deadA ? [a, b] : [b, a];
    return {
      value: 1,
      source: 'scanned',
      reason: `${closed.name} has ${closed.facts!.earlyOpen} checks open at the start but ${open.name} has ${open.facts!.earlyOpen}, so there is always something to do.`,
    };
  }
  return { value: 0.75, source: 'scanned', reason: 'Both games give you things to do from the start.' };
}

function vibe(a: Feel, b: Feel): Raw {
  const tones = jaccard(a.tones, b.tones);
  const activities = jaccard(a.activities, b.activities);
  const eraGap = Math.abs(ERA_ORDER[a.era] - ERA_ORDER[b.era]);
  const era = eraGap === 0 ? 1 : eraGap === 1 ? 0.5 : 0;
  const sameSeries = a.families.some((family) => b.families.includes(family));
  const value = clamp01(tones * 0.35 + activities * 0.3 + era * 0.15 + (sameSeries ? 0.2 : 0));
  const shared = a.tones.filter((tone) => b.tones.includes(tone));
  const bits: string[] = [];
  if (sameSeries) bits.push('from the same series');
  if (shared.length > 0) bits.push(`both ${shared.join(' and ')}`);
  if (a.era === b.era) bits.push(`from the same era (${a.era})`);
  const common = a.activities.filter((activity) => b.activities.includes(activity));
  if (common.length > 0) bits.push(`both about ${common.slice(0, 2).join(' and ')}`);
  return {
    value,
    source: 'drafted',
    reason: bits.length > 0 ? `They feel alike: ${bits.join(', ')}.` : 'They do not have much in common in feel.',
  };
}

function contrast(a: Feel, b: Feel): Raw {
  const pace = Math.abs(a.pace - b.pace) / 4;
  const genre = a.genre === b.genre ? 0 : 1;
  const lengthGap = Math.abs(a.length - b.length) / 4;
  const activities = 1 - jaccard(a.activities, b.activities);
  let value = clamp01(pace * 0.3 + genre * 0.3 + lengthGap * 0.2 + activities * 0.2);
  const nearDuplicate = a.genre === b.genre && Math.abs(a.pace - b.pace) <= 1 && jaccard(a.activities, b.activities) > 0.6;
  if (nearDuplicate) value *= 0.3;
  const bits: string[] = [];
  if (genre === 1) bits.push(`${a.genre} against ${b.genre}`);
  if (Math.abs(a.pace - b.pace) >= 2) bits.push(a.pace < b.pace ? 'one is calmer, one faster' : 'one is faster, one calmer');
  return {
    value,
    source: 'drafted',
    reason: nearDuplicate
      ? 'They are close to the same kind of game, so they add little variety.'
      : bits.length > 0
        ? `They play differently: ${bits.join(', ')}.`
        : 'They play fairly similarly.',
  };
}

/** Scores one pair from 0 to 100 and says why. Pure and deterministic. */
export function scorePair(a: GameInfo, b: GameInfo, options: ScoreOptions = {}): PairScore {
  const [first, second] = a.name <= b.name ? [a, b] : [b, a];
  const mood = MOOD_WEIGHT[options.mood ?? 'balanced'];
  const sliders = options.weights ?? DEFAULT_WEIGHTS;

  const raws: [PartKey, Raw | null][] = [
    ['friction', friction(first, second)],
    ['length', length(first, second)],
    ['difficulty', difficulty(first, second)],
    ['startup', startup(first, second)],
    ['vibe', first.feel !== null && second.feel !== null ? vibe(first.feel, second.feel) : null],
    ['contrast', first.feel !== null && second.feel !== null ? contrast(first.feel, second.feel) : null],
  ];

  const parts: Part[] = [];
  for (const [key, raw] of raws) {
    if (raw === null) continue;
    const moodFactor = key === 'vibe' ? mood.vibe : key === 'contrast' ? mood.contrast : 1;
    parts.push({ key, value: raw.value, weight: BASE_WEIGHT[key] * moodFactor * (sliders[key] ?? 1), source: raw.source, reason: raw.reason });
  }
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  let score = totalWeight > 0 ? (100 * parts.reduce((sum, part) => sum + part.weight * part.value, 0)) / totalWeight : 0;

  const key = pairKey(first.name, second.name);
  if (options.picks?.has(key)) score += PICK_BONUS;
  for (const game of [first.name, second.name]) {
    if (options.favourites?.has(game)) score += FAVOURITE_BONUS;
    if (options.dislikes?.has(game)) score -= DISLIKE_PENALTY;
  }
  score = Math.min(100, Math.max(0, score));

  const vibePart = parts.find((part) => part.key === 'vibe');
  const contrastPart = parts.find((part) => part.key === 'contrast');
  const kind: PairScore['kind'] =
    vibePart !== undefined && contrastPart !== undefined
      ? vibePart.value * vibePart.weight >= contrastPart.value * contrastPart.weight
        ? 'similar'
        : 'contrast'
      : 'practical';

  const strongest = [...parts].sort((x, y) => y.value * y.weight - x.value * x.weight);
  const reasons = strongest.filter((part) => part.value >= 0.6 && part.weight > 0).map((part) => part.reason).slice(0, 4);
  const warnings = parts.filter((part) => part.value < 0.4 && part.key !== 'vibe' && part.key !== 'contrast').map((part) => part.reason);
  const unprofiled = [first, second].filter((game) => game.feel === null).map((game) => game.name);
  if (unprofiled.length > 0) warnings.push(`No drafted profile for ${unprofiled.join(' and ')}, so this uses measured facts only.`);

  return {
    a: first.name,
    b: second.name,
    key,
    score: Math.round(score * 10) / 10,
    parts,
    reasons,
    warnings,
    kind,
    guessed: unprofiled.length > 0,
  };
}

/** Every pair of the given games, scored. 80 games make 3,160 pairs. */
export function scoreAllPairs(games: readonly GameInfo[], options: ScoreOptions = {}): PairScore[] {
  const pairs: PairScore[] = [];
  for (let i = 0; i < games.length; i += 1) {
    for (let j = i + 1; j < games.length; j += 1) pairs.push(scorePair(games[i]!, games[j]!, options));
  }
  return pairs;
}

export { PART_KEYS };
