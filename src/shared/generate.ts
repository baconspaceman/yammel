/** What the window and the main process say to each other about making a seed. */

export type GenerateMode = 'check' | 'make';

export interface GenerateRequest {
  /** check: run the generator without writing anything. make: write a real seed into a new folder. */
  mode: GenerateMode;
  /** The YAML being edited, as text. */
  yaml: { name: string; text: string };
  /** Other players' files, as returned by pickPlayerYamls earlier in this run. */
  extraFiles: string[];
}

export interface GenerateSuccess {
  ok: true;
  mode: GenerateMode;
  /** The seed archive that was written (make only). */
  seedFile: string | null;
  /** The spoiler file, when the generator wrote one. */
  spoilerFile: string | null;
  /** The folder holding the output (make only). */
  folder: string | null;
  seconds: number;
  /** The end of the generator's own log, for the curious. */
  log: string;
}

export interface GenerateFailure {
  ok: false;
  /** unavailable: nothing to run it with. failed: the generator ran and refused. stopped: cancelled or timed out. */
  reason: 'unavailable' | 'failed' | 'stopped';
  /** Plain-language lines about what went wrong, most useful first. */
  problems: string[];
  log: string;
}

export type GenerateResult = GenerateSuccess | GenerateFailure;

/** Whether a seed can be made on this machine, and with what. */
export interface GeneratorStatus {
  available: boolean;
  /** source: the Archipelago source folder with its Python. installed: the installed ArchipelagoGenerate program. */
  kind: 'source' | 'installed' | null;
  /** Where its host.yaml is, or null. */
  hostYaml: string | null;
  /** Plain sentence about why not, or null. */
  problem: string | null;
}

export interface PickedYamls {
  /** Full paths, as returned by the dialog (shown by file name only). */
  files: string[];
}
