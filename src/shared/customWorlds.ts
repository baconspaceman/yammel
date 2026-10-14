/** One custom game found by a scan. */
export interface CustomGame {
  name: string;
  /** The .apworld file it came from. */
  file: string;
}

/** A file in the custom worlds folder that could not be added, with the reason in plain words. */
export interface CustomProblem {
  file: string;
  error: string;
}

/** What the last scan of the custom worlds folder found. Kept on disk so a scan is only needed once. */
export interface CustomWorldsSummary {
  folder: string;
  scannedAt: string;
  games: CustomGame[];
  problems: CustomProblem[];
}

export interface CustomWorldsStatus {
  /** The chosen folder, or null. */
  folder: string | null;
  /** A scan can run: an Archipelago source folder and its Python were found. */
  canScan: boolean;
  /** Plain reason a scan cannot run, or null. */
  reason: string | null;
  /** A scan is running now. */
  scanning: boolean;
  /** The last scan of this folder, or null. */
  summary: CustomWorldsSummary | null;
}

export type ScanResult = { ok: true; summary: CustomWorldsSummary } | { ok: false; reason: 'unavailable' | 'failed' | 'stopped'; message: string };
