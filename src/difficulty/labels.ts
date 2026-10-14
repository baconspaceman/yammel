const BANDS: { below: number; label: string }[] = [
  { below: 2, label: 'Very easy' },
  { below: 4, label: 'Easy' },
  { below: 6, label: 'Moderate' },
  { below: 8, label: 'Hard' },
  { below: Number.POSITIVE_INFINITY, label: 'Very hard' },
];

/** The score as shown: one decimal. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** The word for a score. It uses the rounded score, so the number and the word on screen never disagree. */
export function labelFor(score: number): string {
  const shown = Number(formatScore(score));
  return (BANDS.find((band) => shown < band.below) ?? BANDS[BANDS.length - 1]!).label;
}
