import type { Random } from '../roulette/random';
import { pairKey } from './score';
import type { PairScore } from './types';

/** The smallest and largest group the screen offers. Two is the ordinary pair view. */
export const MIN_GROUP = 3;
export const MAX_GROUP = 8;

/** How much the weakest pair counts next to the average of all pairs. A group is only as good as its worst match. */
const WEAKEST_SHARE = 0.35;
const RESTARTS = 60;
const MAX_PER_GAME_IN_RESULTS = 3;

export interface GroupScore {
  /** The games in alphabetical order. */
  games: string[];
  key: string;
  /** 0 to 100: mostly the average of every pair in the group, pulled down by the weakest one. */
  score: number;
  average: number;
  weakest: PairScore;
  strongest: PairScore;
  /** Why it was suggested. */
  reasons: string[];
  /** Things to know, including the weakest link when it is weak. */
  warnings: string[];
  /** At least one game has no drafted profile. */
  guessed: boolean;
}

export interface GroupInput {
  /** Every scored pair of the games to choose from (see scoreAllPairs). */
  pairs: readonly PairScore[];
  size: number;
  /** Games that must be in every group. */
  include?: readonly string[];
  /** Games that must not be in any group. */
  exclude?: readonly string[];
  /** How many groups to return. */
  count?: number;
  random: Random;
  /** Group keys to leave out (the ones already on screen). */
  avoid?: ReadonlySet<string>;
}

const SEPARATOR = '\u001f';
export const groupKey = (games: readonly string[]): string => [...games].sort().join(SEPARATOR);

/** A group's score from the pair scores of its members. */
export function scoreGroup(games: readonly string[], lookup: ReadonlyMap<string, PairScore>): GroupScore | null {
  const sorted = [...games].sort();
  const pairs: PairScore[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const pair = lookup.get(pairKey(sorted[i]!, sorted[j]!));
      if (pair === undefined) return null;
      pairs.push(pair);
    }
  }
  if (pairs.length === 0) return null;
  const average = pairs.reduce((sum, pair) => sum + pair.score, 0) / pairs.length;
  const byScore = [...pairs].sort((x, y) => x.score - y.score || x.key.localeCompare(y.key));
  const weakest = byScore[0]!;
  const strongest = byScore[byScore.length - 1]!;
  const score = (1 - WEAKEST_SHARE) * average + WEAKEST_SHARE * weakest.score;

  const reasons: string[] = [`Best match inside: ${strongest.a} and ${strongest.b} (${Math.round(strongest.score)}).`];
  if (strongest.reasons[0] !== undefined) reasons.push(strongest.reasons[0]);
  if (weakest.score >= 60) reasons.push(`Even the weakest pair, ${weakest.a} and ${weakest.b}, scores ${Math.round(weakest.score)}.`);

  const warnings: string[] = [];
  if (weakest.score < 50) {
    const why = weakest.warnings[0] ?? (weakest.reasons.length === 0 ? 'They do not have much going for them together.' : '');
    warnings.push(`Weakest link: ${weakest.a} and ${weakest.b} (${Math.round(weakest.score)}).${why === '' ? '' : ` ${why}`}`);
  }
  if (pairs.some((pair) => pair.guessed)) warnings.push('At least one game here has no drafted profile, so its scores use measured facts only.');

  return {
    games: sorted,
    key: groupKey(sorted),
    score: Math.round(score * 10) / 10,
    average: Math.round(average * 10) / 10,
    weakest,
    strongest,
    reasons,
    warnings,
    guessed: pairs.some((pair) => pair.guessed),
  };
}

/**
 * Finds groups of games that suit each other. It starts from the games you insisted on (or one at random), adds the
 * game that fits the group best at each step (picking at random among the best few, so repeated tries give different
 * groups), then swaps members while that helps. Many tries are made and the best different groups are returned, with
 * no game in more than three of them so the list has variety. The same random numbers give the same answer.
 */
export function findGroups(input: GroupInput): GroupScore[] {
  const size = Math.max(MIN_GROUP, Math.min(MAX_GROUP, Math.trunc(input.size)));
  const count = input.count ?? 10;
  const excluded = new Set(input.exclude ?? []);
  const lookup = new Map(input.pairs.map((pair) => [pair.key, pair]));
  const names = [...new Set(input.pairs.flatMap((pair) => [pair.a, pair.b]))].filter((name) => !excluded.has(name)).sort();
  const index = new Map(names.map((name, i) => [name, i]));
  const must = [...new Set(input.include ?? [])].flatMap((name) => (index.has(name) ? [index.get(name)!] : []));
  const n = names.length;
  if (n < size || must.length > size) return [];

  // The pair scores as plain numbers, so the many small comparisons below stay fast.
  const matrix = new Float64Array(n * n);
  for (const pair of input.pairs) {
    const x = index.get(pair.a);
    const y = index.get(pair.b);
    if (x !== undefined && y !== undefined) {
      matrix[x * n + y] = pair.score;
      matrix[y * n + x] = pair.score;
    }
  }
  const quick = (members: readonly number[]): number => {
    let total = 0;
    let min = Number.POSITIVE_INFINITY;
    let pairs = 0;
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const value = matrix[members[i]! * n + members[j]!]!;
        total += value;
        if (value < min) min = value;
        pairs += 1;
      }
    }
    return pairs === 0 ? 0 : (1 - WEAKEST_SHARE) * (total / pairs) + WEAKEST_SHARE * min;
  };
  const gain = (members: readonly number[], candidate: number): number => {
    let total = 0;
    let min = Number.POSITIVE_INFINITY;
    for (const member of members) {
      const value = matrix[member * n + candidate]!;
      total += value;
      if (value < min) min = value;
    }
    return members.length === 0 ? 0 : (1 - WEAKEST_SHARE) * (total / members.length) + WEAKEST_SHARE * min;
  };

  /** The best new group among many tries that start differently, never using the games in `banned`. */
  const search = (banned: ReadonlySet<number>, taken: ReadonlySet<string>): GroupScore | null => {
    const open: number[] = [];
    for (let id = 0; id < n; id += 1) if (!banned.has(id) || must.includes(id)) open.push(id);
    if (open.length < size) return null;
    let bestMembers: number[] | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let attempt = 0; attempt < RESTARTS; attempt += 1) {
      const members = [...must];
      if (members.length === 0) members.push(open[Math.floor(input.random() * open.length)]!);
      while (members.length < size) {
        const ranked: { id: number; value: number }[] = [];
        for (const id of open) if (!members.includes(id)) ranked.push({ id, value: gain(members, id) });
        ranked.sort((x, y) => y.value - x.value || x.id - y.id);
        members.push(ranked[Math.floor(input.random() * Math.min(3, ranked.length))]!.id);
      }
      // Swap a member for a better one while that raises the group's score.
      let value = quick(members);
      for (let round = 0; round < 3; round += 1) {
        let improved = false;
        for (let slot = 0; slot < members.length; slot += 1) {
          if (must.includes(members[slot]!)) continue;
          for (const candidate of open) {
            if (members.includes(candidate)) continue;
            const previous = members[slot]!;
            members[slot] = candidate;
            const trial = quick(members);
            if (trial > value + 0.05) {
              value = trial;
              improved = true;
            } else {
              members[slot] = previous;
            }
          }
        }
        if (!improved) break;
      }
      const key = groupKey(members.map((member) => names[member]!));
      if (taken.has(key) || input.avoid?.has(key)) continue;
      if (value > bestValue) {
        bestValue = value;
        bestMembers = [...members];
      }
    }
    return bestMembers === null ? null : scoreGroup(bestMembers.map((member) => names[member]!), lookup);
  };

  // One group at a time, best first. A game that has been used a few times is set aside for the next ones, so the list has variety;
  // when that leaves too few games the limit is raised a step.
  const used = new Map<number, number>();
  const taken = new Set<string>();
  const out: GroupScore[] = [];
  const extraBans = new Set<number>();
  let cap = MAX_PER_GAME_IN_RESULTS;
  let failures = 0;
  while (out.length < count && failures < 80) {
    const banned = new Set<number>([...used].filter(([, uses]) => uses >= cap).map(([id]) => id));
    for (const id of extraBans) banned.add(id);
    const group = search(banned, taken);
    if (group !== null) {
      out.push(group);
      taken.add(group.key);
      for (const game of group.games) used.set(index.get(game)!, (used.get(index.get(game)!) ?? 0) + 1);
      extraBans.clear();
      continue;
    }
    // Nothing new came out: set one more game aside so the next try has to look elsewhere, and now and then allow a game to be used once more.
    failures += 1;
    if (failures % 4 === 0) cap += 1;
    const sources = out.length > 0 ? out.map((group) => group.games) : [...(input.avoid ?? [])].map((key) => key.split(SEPARATOR));
    const members = sources.length > 0 ? sources[Math.floor(input.random() * sources.length)]!.flatMap((game) => (index.has(game) && !must.includes(index.get(game)!) ? [index.get(game)!] : [])) : [];
    if (members.length > 0) extraBans.add(members[Math.floor(input.random() * members.length)]!);
    else break;
  }
  return out;
}

