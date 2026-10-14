import type { Random } from '../roulette/random';
import type { RecommenderState } from './state';
import type { PairScore } from './types';

export const TEN = 10;
/** A pair is not shown again until this many launches have passed. */
export const NOVELTY_LAUNCHES = 5;
const MAX_PER_GAME = 3;
const MAX_GUESSED = 2;

export interface PickInput {
  pairs: readonly PairScore[];
  state: RecommenderState;
  random: Random;
  count?: number;
  /** Pair keys to leave out (for "give me ten more": the ones already on screen). */
  avoid?: ReadonlySet<string>;
}

export interface PickResult {
  pairs: PairScore[];
  /** Fewer than `count` unseen pairs were left, so some earlier ones were brought back. */
  reshuffled: boolean;
}

/** Higher scores are much more likely to be drawn, but nothing is certain. */
const drawWeight = (pair: PairScore): number => Math.exp((pair.score - 50) / 12);

interface Limits {
  perGame: number;
  guessed: number;
  /** The most cards of one kind (alike or different). Infinity switches the rule off. */
  perKind: number;
}

/**
 * Chooses the cards to show. Pinned pairs come first and count toward the total. The rest are a weighted
 * random draw from pairs that were not dismissed and were not shown in the last few launches, keeping
 * variety: no game on more than three cards, at most two cards with a guessed game, and no more than 7 in
 * 10 of one kind. If that cannot fill the list, rules are relaxed in turn, and as a last step the
 * longest-ago-shown pairs are brought back (and `reshuffled` says so).
 * Pairs already shown in the current launch count as unseen, so the same state gives the same ten again.
 */
export function pickCards(input: PickInput): PickResult {
  const count = input.count ?? TEN;
  const { state, random } = input;
  const avoid = input.avoid ?? new Set<string>();
  const dismissed = new Set(state.dismissed);
  const pinned = new Set(state.pins);

  const pins = input.pairs.filter((pair) => pinned.has(pair.key) && !dismissed.has(pair.key) && !avoid.has(pair.key)).slice(0, count);
  const chosen: PairScore[] = [...pins];
  const taken = new Set(chosen.map((pair) => pair.key));

  const usable = input.pairs.filter((pair) => !dismissed.has(pair.key) && !pinned.has(pair.key) && !avoid.has(pair.key));
  const lastShown = (pair: PairScore): number => state.shown[pair.key] ?? Number.NEGATIVE_INFINITY;
  // A pair shown earlier in this same launch stays eligible, so the opening ten are stable while the app is open.
  const unseen = usable.filter((pair) => lastShown(pair) === state.launches || state.launches - lastShown(pair) > NOVELTY_LAUNCHES);

  const kindCap = Math.max(1, Math.ceil(count * 0.7));
  const passes: Limits[] = [
    { perGame: MAX_PER_GAME, guessed: MAX_GUESSED, perKind: kindCap },
    { perGame: MAX_PER_GAME, guessed: MAX_GUESSED, perKind: Number.POSITIVE_INFINITY },
    { perGame: MAX_PER_GAME + 1, guessed: MAX_GUESSED + 1, perKind: Number.POSITIVE_INFINITY },
  ];

  const fits = (pair: PairScore, limits: Limits): boolean => {
    if (taken.has(pair.key)) return false;
    const gameUse = (game: string): number => chosen.filter((card) => card.a === game || card.b === game).length;
    if (gameUse(pair.a) >= limits.perGame || gameUse(pair.b) >= limits.perGame) return false;
    if (pair.guessed && chosen.filter((card) => card.guessed).length >= limits.guessed) return false;
    return chosen.filter((card) => card.kind === pair.kind).length < limits.perKind;
  };

  const draw = (pool: readonly PairScore[], limits: Limits): boolean => {
    const candidates = pool.filter((pair) => fits(pair, limits));
    if (candidates.length === 0) return false;
    const total = candidates.reduce((sum, pair) => sum + drawWeight(pair), 0);
    let target = random() * total;
    let pick = candidates[candidates.length - 1]!;
    for (const pair of candidates) {
      target -= drawWeight(pair);
      if (target <= 0) {
        pick = pair;
        break;
      }
    }
    chosen.push(pick);
    taken.add(pick.key);
    return true;
  };

  for (const limits of passes) {
    while (chosen.length < count && draw(unseen, limits)) {
      /* keep drawing */
    }
  }

  let reshuffled = false;
  if (chosen.length < count) {
    // Not enough fresh pairs: bring back the ones shown longest ago, best score first among equals.
    const older = usable.filter((pair) => !taken.has(pair.key)).sort((x, y) => lastShown(x) - lastShown(y) || y.score - x.score);
    for (const pair of older) {
      if (chosen.length >= count) break;
      if (fits(pair, passes[passes.length - 1]!)) {
        chosen.push(pair);
        taken.add(pair.key);
        reshuffled = true;
      }
    }
  }
  return { pairs: chosen.sort((x, y) => y.score - x.score), reshuffled };
}

/** Every partner for one game, best first, for the "what goes well with this game?" view. */
export function partnersFor(game: string, pairs: readonly PairScore[], state: RecommenderState): PairScore[] {
  const dismissed = new Set(state.dismissed);
  return pairs.filter((pair) => (pair.a === game || pair.b === game) && !dismissed.has(pair.key)).sort((x, y) => y.score - x.score);
}
