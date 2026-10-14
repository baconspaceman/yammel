import type { GameSchema, OptionSchema } from '../schema/types';

const STOPWORDS = new Set(
  (
    'a an the to of for in on off at by is are was be am it its this that these those and or with my me i we you your our ' +
    'please can could would should will do does did how what which where why when who want like need make set turn switch put use ' +
    'give get let lets show tell find search look about option options setting settings thing things some any more less much very ' +
    'really just also so as if then than too up down into from there here have has had change changes enable disable activate ' +
    'yes no true false'
  ).split(' '),
);

/** Words that mean the same thing in a game's option names. Keep this short and obvious. */
const SYNONYMS: Record<string, string[]> = {
  die: ['death'],
  dying: ['death'],
  died: ['death'],
  dead: ['death'],
  checks: ['location', 'locations'],
  check: ['location', 'locations'],
  chest: ['chests'],
  chests: ['chest'],
  money: ['coin', 'coins', 'gold', 'cash'],
  hp: ['health'],
  life: ['lives'],
  hearts: ['health'],
  speed: ['fast', 'quick'],
  shuffle: ['randomize', 'randomise'],
  randomise: ['shuffle', 'randomize'],
  randomize: ['shuffle'],
  boss: ['bosses'],
  bosses: ['boss'],
  traps: ['trap'],
  trap: ['traps'],
  goal: ['goals', 'victory', 'ending'],
  win: ['goal', 'victory'],
  hint: ['hints'],
  hints: ['hint'],
  item: ['items'],
  items: ['item'],
};

/** Cuts a word down so "chests" and "chest", or "shuffling" and "shuffle", match. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
  return w;
}

/** The meaningful words of a sentence (lowercase, without filler words). Numbers are kept. */
export function words(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // ShuffleStorybookPages -> Shuffle Storybook Pages
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '' && !STOPWORDS.has(word));
}

/** One group per asked word: the word itself and what it can also mean. A group counts once, however many words it has. */
function groups(tokens: string[]): string[][] {
  return tokens.map((token) => [stem(token), ...(Object.prototype.hasOwnProperty.call(SYNONYMS, token) ? SYNONYMS[token]!.map(stem) : [])]);
}

function expand(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const token of tokens) {
    out.add(stem(token));
    for (const extra of Object.prototype.hasOwnProperty.call(SYNONYMS, token) ? SYNONYMS[token]! : []) out.add(stem(extra));
  }
  return [...out];
}

export interface OptionMatch {
  option: OptionSchema;
  /** Higher is a better match. Only meaningful for ordering and for the "is this clearly the one?" check. */
  score: number;
  /** How many of the asked-for words were found. */
  hits: number;
}

/** Options whose name, key or description share words with the query, best first. */
export function searchOptions(game: GameSchema, query: string, limit = 5): OptionMatch[] {
  const asked = groups(words(query));
  if (asked.length === 0) return [];
  const matches: OptionMatch[] = [];
  for (const option of Object.values(game.options)) {
    const names = new Set(expand(words(`${option.displayName} ${option.key}`)));
    const description = new Set(expand(words(option.description)));
    let score = 0;
    let hits = 0;
    for (const group of asked) {
      if (names.has(group[0]!)) {
        score += 4;
        hits += 1;
      } else if (group.some((word) => names.has(word))) {
        score += 2.5;
        hits += 1;
      } else if (group.some((word) => [...names].some((name) => name.length >= 4 && word.length >= 4 && (name.startsWith(word) || word.startsWith(name))))) {
        score += 2;
        hits += 1;
      } else if (group.some((word) => description.has(word))) {
        score += 0.5;
        hits += 1;
      }
    }
    if (hits === 0) continue;
    score *= hits / asked.length; // matching only part of what was asked counts for less
    // Saying the option's whole name ("goal" for Goal) beats an option that merely shares the word.
    const spoken = words(query).join(' ');
    if (spoken !== '' && (words(option.displayName).join(' ') === spoken || words(option.key).join(' ') === spoken)) score += 3;
    matches.push({ option, score, hits });
  }
  return matches.sort((a, b) => b.score - a.score || a.option.displayName.localeCompare(b.option.displayName)).slice(0, limit);
}

/** The best match when it clearly beats the second one; otherwise null (the caller asks which was meant). */
export function clearWinner(matches: readonly OptionMatch[]): OptionMatch | null {
  const [first, second] = matches;
  if (first === undefined) return null;
  if (second === undefined) return first.score >= 3 ? first : null;
  return first.score >= 3 && first.score >= second.score * 1.25 ? first : null;
}
