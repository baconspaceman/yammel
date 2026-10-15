import type { PresetsState } from '../presets/presets';
import type { HelperAction, HelperSnapshot } from './popout';
import type { RecommenderState } from '../recommend/state';
import type { CustomWorldsStatus, ScanResult } from './customWorlds';
import type { GenerateRequest, GenerateResult, GeneratorStatus } from './generate';
import type { HostFileContents, HostFileId, HostFileInfo, HostWriteRequest, HostWriteResult } from './host';
import type { Settings, SettingsPatch } from './settings';

/** The only things the window can ask the app to do. Implemented in src/main, exposed by src/preload. */

export type ApiResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface OpenedFile {
  path: string;
  text: string;
}

/** A YAML file opened or saved lately. The path is only ever used to ask the app to open it again. */
export interface RecentFile {
  path: string;
  name: string;
  /** The folder it is in. */
  folder: string;
}

export interface SaveRequest {
  /** A path this app previously returned from open/save, or null to ask where to save. */
  path: string | null;
  text: string;
  suggestedName: string;
}

export interface SaveResult {
  path: string;
}

export interface FolderYaml {
  fileName: string;
  text: string;
}

export interface SaveFolderResult {
  folder: string;
  /** Full paths actually written, in order. */
  written: string[];
}

/** Ask the seed engine how many checks a game has with these option values (as written in the YAML). */
export interface CountRequest {
  game: string;
  options: Record<string, unknown>;
}

export interface CountOk {
  ok: true;
  checks: number;
  items: number;
  /** Options set to random or weighted values: counted at their defaults because the roll decides them. */
  unresolved: string[];
  /** Options the engine could not use (unknown, or a value Archipelago rejects): counted at their defaults. */
  invalid: { key: string; message: string }[];
  ms: number;
}

export interface CountFailure {
  ok: false;
  /** unavailable: no engine can run here; timeout: it took too long; failed: it crashed or the world errored. */
  reason: 'unavailable' | 'timeout' | 'failed';
  message: string;
}

export type CountResult = CountOk | CountFailure;

export type SourceOrigin = 'settings' | 'env' | 'sibling';

/** What this machine has for Archipelago. Everything here is optional: without it the editor still works, minus the check count. */
export interface ArchipelagoFinding {
  /** The source folder in use (or the one that was tried and rejected), or null when none was found. */
  sourceRoot: string | null;
  origin: SourceOrigin | null;
  /** The Python the check engine will run with, or null. */
  python: string | null;
  /** A normal installed Archipelago (with its launcher), or null. Only looked at; used by later features. */
  installRoot: string | null;
  /** Plain-language reason the check engine cannot run, or null when it can. */
  problem: string | null;
}

export interface SettingsView {
  settings: Settings;
  finding: ArchipelagoFinding;
}

export type HelperId = 'claudeCode' | 'codex' | 'openRouter';

/** An optional AI helper: what it is, and whether it can be used right now. Never includes a key. */
export interface HelperStatus {
  id: HelperId;
  name: string;
  /** Switched on in Settings. */
  enabled: boolean;
  /** The program was found, or the key is saved. */
  ready: boolean;
  /** The model asked for, or null for the helper's own default. */
  model: string | null;
  /** Plain sentence about what it needs and what it costs. */
  note: string;
  /** OpenRouter only: a key is saved. */
  keySet?: boolean;
  /** OpenRouter only: this computer can keep a key safely. */
  canStoreKey?: boolean;
}

export interface EditorApi {
  /** The text of schema.json. */
  loadSchema(): Promise<ApiResult<string>>;
  /** Shows the Open dialog. The value is null when the user cancels. */
  openYaml(): Promise<ApiResult<OpenedFile | null>>;
  /** Saves safely (backup, then replace). The value is null when the user cancels the Save dialog. */
  saveYaml(request: SaveRequest): Promise<ApiResult<SaveResult | null>>;
  /** Asks for a folder, then writes each file into it without overwriting anything. The value is null when the user cancels. */
  saveYamlFolder(files: FolderYaml[]): Promise<ApiResult<SaveFolderResult | null>>;
  /** The YAML files opened or saved lately that still exist, newest first. */
  recentFiles(): Promise<ApiResult<RecentFile[]>>;
  /** Opens one of the recent files (only paths from that list are accepted). A file that is gone is removed from the list. */
  openRecent(path: string): Promise<ApiResult<OpenedFile>>;
  /** Forgets the recent files list. */
  clearRecent(): Promise<ApiResult<null>>;
  /** The presets the person saved. */
  loadPresets(): Promise<ApiResult<PresetsState>>;
  /** Saves the presets (cleaned and size-checked by the app). */
  savePresets(state: PresetsState): Promise<ApiResult<null>>;
  /** Counts a game's checks with the seed engine. Never throws: failures come back as a CountFailure. */
  countChecks(request: CountRequest): Promise<CountResult>;
  /** The saved settings and what was found on this machine. */
  getSettings(): Promise<ApiResult<SettingsView>>;
  /** Changes some settings (unknown fields are ignored), saves them, and restarts the check engine if needed. */
  saveSettings(patch: SettingsPatch): Promise<ApiResult<SettingsView>>;
  /** Shows a folder picker for the Archipelago source folder. Null when the user cancels. The choice is not saved until saveSettings. */
  pickArchipelagoFolder(): Promise<ApiResult<string | null>>;
  /** Shows a file picker for a Python program. Null when the user cancels. */
  pickPythonFile(): Promise<ApiResult<string | null>>;
  /** Whether a seed can be made here, and with what. */
  generatorStatus(): Promise<ApiResult<GeneratorStatus>>;
  /** Runs Archipelago's generator on the open YAML (and chosen extra files). One run at a time; never throws. */
  generate(request: GenerateRequest): Promise<ApiResult<GenerateResult>>;
  /** Stops the run in progress, if any. */
  cancelGenerate(): Promise<ApiResult<null>>;
  /** Shows a file dialog for other players' YAMLs. The files are not read until a seed is made. Empty when cancelled. */
  pickPlayerYamls(): Promise<ApiResult<string[]>>;
  /** Shows a folder this app wrote a seed into, in the file manager. Only those folders can be shown. */
  revealSeed(path: string): Promise<ApiResult<null>>;
  /** Opens the helper chat in its own window (or brings it forward). Main window only. */
  openHelperWindow(): Promise<ApiResult<null>>;
  /** Closes that window. Either window may ask. */
  closeHelperWindow(): Promise<ApiResult<null>>;
  /** Whether the helper window is open right now. */
  isHelperWindowOpen(): Promise<ApiResult<boolean>>;
  /** The main window gives the pop-out a fresh copy of the conversation. Main window only. */
  publishHelper(snapshot: HelperSnapshot): Promise<ApiResult<null>>;
  /** The pop-out asks for the latest copy when it opens. Pop-out only. */
  getHelperSnapshot(): Promise<ApiResult<HelperSnapshot | null>>;
  /** The pop-out tells the main window what the person typed or clicked. Pop-out only. */
  sendHelperAction(action: HelperAction): Promise<ApiResult<null>>;
  /** Called with each new copy of the conversation (pop-out). Returns a function that stops listening. */
  onHelperSnapshot(listener: (snapshot: HelperSnapshot) => void): () => void;
  /** Called with each action from the pop-out (main window). */
  onHelperAction(listener: (action: HelperAction) => void): () => void;
  /** Called when the pop-out opens or closes (main window). */
  onHelperWindow(listener: (open: boolean) => void): () => void;
  /** The custom worlds folder, whether it can be scanned, and what the last scan found. */
  customWorldsStatus(): Promise<ApiResult<CustomWorldsStatus>>;
  /** Shows a folder picker for the custom worlds folder. Null when cancelled. Not saved until saveSettings. */
  pickCustomWorlds(): Promise<ApiResult<string | null>>;
  /** Scans the chosen custom worlds folder with Archipelago's own loader. One scan at a time; takes minutes for a big folder. Never throws. */
  scanCustomWorlds(): Promise<ApiResult<ScanResult>>;
  /** Stops a scan in progress. */
  cancelScan(): Promise<ApiResult<null>>;
  /** The host.yaml files this computer has (installed Archipelago and/or the source folder). Empty when there are none. */
  hostFiles(): Promise<ApiResult<HostFileInfo[]>>;
  /** Reads one of them. */
  readHost(id: HostFileId): Promise<ApiResult<HostFileContents>>;
  /** Writes a changed host.yaml after a backup. Refused if the file changed since it was read. */
  writeHost(request: HostWriteRequest): Promise<ApiResult<HostWriteResult>>;
  /** For each path shown in the host.yaml form, whether something is there (relative paths are read from the host.yaml's folder). */
  checkHostPaths(id: HostFileId, values: string[]): Promise<ApiResult<boolean[]>>;
  /** Shows a file or folder picker for a path setting. Null when the user cancels. */
  pickHostPath(kind: 'file' | 'folder'): Promise<ApiResult<string | null>>;
  /** The optional AI helpers and whether each is ready. */
  helperStatus(): Promise<ApiResult<HelperStatus[]>>;
  /** Sends a request to a helper that is switched on and returns its answer text. Never throws. */
  askHelper(request: { helperId: HelperId; prompt: string }): Promise<ApiResult<string>>;
  /** Saves (or, with null, removes) the OpenRouter key. The key is encrypted by the system and never sent back to the window. */
  setOpenRouterKey(key: string | null): Promise<ApiResult<HelperStatus[]>>;
  /** What the "Games to mix" recommender remembers (an empty state the first time). */
  loadRecommender(): Promise<ApiResult<RecommenderState>>;
  /** Saves it. The state is cleaned and size-checked by the app before it is written. */
  saveRecommender(state: RecommenderState): Promise<ApiResult<null>>;
}

export const IPC = {
  loadSchema: 'schema:load',
  openYaml: 'file:open',
  saveYaml: 'file:save',
  saveYamlFolder: 'file:save-folder',
  countChecks: 'engine:count',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  pickArchipelagoFolder: 'settings:pick-folder',
  pickPythonFile: 'settings:pick-python',
  generatorStatus: 'generate:status',
  generate: 'generate:run',
  cancelGenerate: 'generate:cancel',
  pickPlayerYamls: 'generate:pick-yamls',
  revealSeed: 'generate:reveal',
  openHelperWindow: 'helperwin:open',
  closeHelperWindow: 'helperwin:close',
  isHelperWindowOpen: 'helperwin:is-open',
  publishHelper: 'helperwin:publish',
  getHelperSnapshot: 'helperwin:get',
  sendHelperAction: 'helperwin:action',
  helperSnapshotEvent: 'helperwin:snapshot',
  helperActionEvent: 'helperwin:do',
  helperWindowEvent: 'helperwin:state',
  recentFiles: 'recent:list',
  openRecent: 'recent:open',
  clearRecent: 'recent:clear',
  loadPresets: 'presets:load',
  savePresets: 'presets:save',
  customWorldsStatus: 'custom:status',
  pickCustomWorlds: 'custom:pick',
  scanCustomWorlds: 'custom:scan',
  cancelScan: 'custom:cancel',
  hostFiles: 'host:files',
  readHost: 'host:read',
  writeHost: 'host:write',
  checkHostPaths: 'host:check-paths',
  pickHostPath: 'host:pick-path',
  helperStatus: 'helper:status',
  askHelper: 'helper:ask',
  setOpenRouterKey: 'helper:set-key',
  loadRecommender: 'recommender:load',
  saveRecommender: 'recommender:save',
} as const;
