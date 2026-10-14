/** Edit distance between two words (case-insensitive). */
export function distance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 0;
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= y.length; j += 1) {
      row.push(Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1)));
    }
    previous = row;
  }
  return previous[y.length]!;
}

/** The candidate that is nearest to `word`, if any is close enough to be a believable typo. */
export function closest(word: string, candidates: readonly string[]): string | undefined {
  const cleaned = word.trim().toLowerCase().replace(/[\s_-]+/g, '');
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const target = candidate.toLowerCase().replace(/[\s_-]+/g, '');
    const score = distance(cleaned, target);
    // A candidate that contains the word (or the other way round) is a good guess even when it is much longer.
    const contained = (cleaned.length >= 4 && target.includes(cleaned)) || (target.length >= 5 && cleaned.includes(target)) ? 1 : score;
    const used = Math.min(score, contained);
    if (used < bestScore) {
      bestScore = used;
      best = candidate;
    }
  }
  if (best === undefined) return undefined;
  const limit = Math.max(2, Math.floor(cleaned.length / 3));
  return bestScore <= limit ? best : undefined;
}
