/** What a game is like, drafted by hand for every bundled game (data/feel-profiles.json). Judgement, not measurement. */
export interface Feel {
  genre: string;
  /** 1 relaxed .. 5 frantic. */
  pace: number;
  /** 1 under an hour .. 5 twenty hours or more. */
  length: number;
  tones: string[];
  era: 'classic' | 'mid' | 'modern';
  /** Franchise or maker groups: games sharing one count as the same series. */
  families: string[];
  activities: string[];
}

export interface FeelFile {
  note: string;
  games: Record<string, Feel>;
}

/** Facts measured by running the world's own early generation steps (data/world-features.json). */
export interface WorldFacts {
  checks: number;
  items: number;
  /** How many checks can be reached with nothing collected, or null when the world could not be asked. */
  earlyOpen: number | null;
  /** The world needs a ROM, ISO or program the player supplies. */
  needsFile: boolean;
  /** BizHawk systems the game's client runs on (for example GB), or none for a normal client. */
  systems: string[];
}

export interface WorldFactsFile {
  apVersion: string;
  scannedAt: string;
  games: Record<string, WorldFacts>;
  failed: Record<string, string>;
}

/** Where a number or reason came from, so the screen can say how far to trust it. */
export type Source = 'scanned' | 'drafted' | 'guessed';

export interface GameInfo {
  name: string;
  /** null for a world with no drafted profile: it gets a Guessed label and no vibe or contrast score. */
  feel: Feel | null;
  /** null when the world was never scanned. */
  facts: WorldFacts | null;
  /** The difficulty gauge's score (0 to 10) at default options, or null when the game is not rated. */
  difficulty: number | null;
}

export type Mood = 'similar' | 'balanced' | 'opposites';

export type PartKey = 'friction' | 'length' | 'difficulty' | 'startup' | 'vibe' | 'contrast';

export const PART_KEYS: readonly PartKey[] = ['friction', 'length', 'difficulty', 'startup', 'vibe', 'contrast'];

export const PART_LABELS: Record<PartKey, string> = {
  friction: 'Easy to set up',
  length: 'Length balance',
  difficulty: 'Difficulty fit',
  startup: 'No dead starts',
  vibe: 'Vibe match',
  contrast: 'Contrast',
};

/** The person's sliders. 1 is the default; 0 switches a part off; 2 counts it double. */
export type Weights = Record<PartKey, number>;

export const DEFAULT_WEIGHTS: Weights = { friction: 1, length: 1, difficulty: 1, startup: 1, vibe: 1, contrast: 1 };
export const WEIGHT_MAX = 2;

export interface Part {
  key: PartKey;
  /** 0 to 1. */
  value: number;
  /** The weight this part had in the score (mood and sliders included). */
  weight: number;
  source: Source;
  reason: string;
}

export interface PairScore {
  /** The two games in alphabetical order. */
  a: string;
  b: string;
  key: string;
  /** 0 to 100. */
  score: number;
  parts: Part[];
  /** Why it was suggested, strongest first. */
  reasons: string[];
  warnings: string[];
  /** What mostly makes it a good pair: alike, different, or just easy to run together. */
  kind: 'similar' | 'contrast' | 'practical';
  /** At least one game has no drafted profile. */
  guessed: boolean;
}
