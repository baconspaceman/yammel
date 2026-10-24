import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  IPC,
  type ApiResult,
  type CountResult,
  type SettingsView,
  type HelperStatus,
  type OpenedFile,
  type RecentFile,
  type SaveFolderResult,
  type SaveRequest,
  type SaveResult,
} from '../shared/api';
import { parseCountRequest } from './countRequest';
import { resolveEngineSpec, SeedEngine, type EngineSpec } from './engine';
import { FileError, MAX_YAML_BYTES, readYamlFile, saveTextSafely } from './files';
import { parseFolderFiles, writeYamlFolder } from './folderSave';
import { detectArchipelago } from './detect';
import { SettingsStore } from './settingsStore';
import { JsonFileStore } from './jsonStore';
import { findGenerator, generatorStatus, runGenerate } from './generate';
import type { GenerateRequest, GenerateResult, GeneratorStatus } from '../shared/generate';
import type { HostBackup, HostFileContents, HostFileInfo, HostWriteResult } from '../shared/host';
import type { CustomWorldsStatus, ScanResult } from '../shared/customWorlds';
import { isSendableSnapshot, parseHelperAction, type HelperSnapshot } from '../shared/popout';
import { MAX_PRESETS_BYTES, parsePresets, type PresetsState } from '../presets/presets';
import { addRecent, describeRecent, MAX_RECENT_BYTES, parseRecent, removeRecent, type RecentState } from './recent';
import { clearCustomWorlds, readSummary, scanBlocker, scanCustomWorlds, schemaWithCustom } from './customWorlds';
import { checkHostPaths, hostCandidates, listHostBackups, readHostBackup, readHostFile, writeHostFile } from './hostFile';
import { askHelper, helperStatuses, isHelperId } from './helpers/service';
import { SecretStore } from './helpers/secrets';
import { MAX_STATE_BYTES, parseRecommenderState, type RecommenderState } from '../recommend/state';
import { applyPatch, PYTHON_NAME } from '../shared/settings';

let mainWindow: BrowserWindow | null = null;

/** The check-counting engine. Starts on the first request and stops again when idle (see engine.ts). */
let engine: SeedEngine | null = null;
/** Custom world files the check engine has been asked to load (a custom game is counted from its own .apworld). */
let engineCustomFiles: string[] = [];

/** How to start the engine: the chosen source folder and Python, plus the custom world files counted so far. */
function engineSpec(): EngineSpec {
  const spec = resolveEngineSpec(process.env, app.getAppPath(), existsSync, settingsStore!.value);
  return 'unavailable' in spec ? spec : { ...spec, args: [...spec.args, ...engineCustomFiles.flatMap((file) => ['--custom-world', file])] };
}

/** The .apworld file a scanned custom game came from, or null for a game Archipelago itself has. */
async function customWorldFile(game: string): Promise<string | null> {
  const folder = settingsStore?.value.archipelago.customWorldsDir ?? null;
  const summary = await readSummary(app.getPath('userData'), folder);
  const found = summary?.games.find((g) => g.name === game);
  return found !== undefined && folder !== null ? join(folder, found.file) : null;
}

/** Saved settings (the Archipelago folder and the optional extras). Loaded before the window opens. */
let settingsStore: SettingsStore | null = null;
let settingsLock: Promise<void> = Promise.resolve();

/** What the recommender remembers (shown pairs, pins, thumbs). Lives only in the app's data folder. */
let recommenderStore: JsonFileStore<RecommenderState> | null = null;

/** The recently used YAML files, and the presets the person saved. */
let recentStore: JsonFileStore<RecentState> | null = null;
let presetsStore: JsonFileStore<PresetsState> | null = null;

/** Remembers a file in the recent list. A problem saving the list never stops opening or saving a file. */
function noteRecent(path: string): void {
  if (recentStore === null) return;
  void recentStore.save(addRecent(recentStore.value, path, new Date())).catch(() => undefined);
}

/** Keys for optional AI helpers, encrypted by the operating system. Never sent to the window. */
let secrets: SecretStore | null = null;

const helperDeps = () => ({ settings: () => settingsStore!.value, secrets: secrets!, env: process.env as Record<string, string | undefined> });

/** The seed run in progress (one at a time), the extra player files the person picked, and the seed folders this app made. */
let generating: AbortController | null = null;
/** The custom-worlds scan in progress (one at a time). */
let scanning: AbortController | null = null;
const approvedPlayerFiles = new Set<string>();
const seedFolders = new Set<string>();
const seedsRoot = () => process.env['ARCHIPELAGO_YAML_SEEDS'] ?? join(app.getPath('documents'), 'Yammel', 'Seeds');

/** Folders and programs the user picked in a dialog. Settings may only point at these, never at a path the page made up. */
const approvedSettingPaths = new Set<string>();

/** Paths the user picked in a dialog. The window may only write to these, never to an arbitrary path. */
const approvedPaths = new Set<string>();

const YAML_FILTERS = [{ name: 'YAML files', extensions: ['yaml', 'yml'] }];

function schemaPath(): string {
  return process.env['ARCHIPELAGO_YAML_SCHEMA'] ?? join(app.getAppPath(), 'data', 'schema.json');
}

function fail<T>(error: unknown): ApiResult<T> {
  if (error instanceof FileError) return { ok: false, message: error.message };
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return { ok: false, message: 'That file could not be found.' };
  if (code === 'EACCES' || code === 'EPERM') return { ok: false, message: 'Permission was denied for that file.' };
  if (code === 'EBUSY') return { ok: false, message: 'That file is in use by another program.' };
  return { ok: false, message: 'The file operation failed.' };
}

/** The app's picture for the window frame and the taskbar, when the file is there. */
function appIcon(): { icon: string } | Record<string, never> {
  const path = join(app.getAppPath(), 'assets', 'icon', 'icon-256.png');
  return existsSync(path) ? { icon: path } : {};
}

/** The helper chat's own window, when open, and the latest copy of the conversation the main window gave it. */
let helperWindow: BrowserWindow | null = null;
let helperSnapshot: HelperSnapshot | null = null;

const fromHelperWindow = (event: IpcMainInvokeEvent): boolean => helperWindow !== null && event.senderFrame === helperWindow.webContents.mainFrame;

function tellMainWindow(channel: string, value: unknown): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}

function openHelperWindow(): void {
  if (helperWindow !== null && !helperWindow.isDestroyed()) {
    helperWindow.show();
    helperWindow.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 340,
    minHeight: 420,
    show: false,
    title: 'Helper - Yammel',
    ...appIcon(),
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  helperWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    helperWindow = null;
    tellMainWindow(IPC.helperWindowEvent, false);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined) void win.loadURL(`${devUrl}?view=helper`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view: 'helper' } });
  tellMainWindow(IPC.helperWindowEvent, true);
}

function fromOurWindow(event: IpcMainInvokeEvent): boolean {
  return mainWindow !== null && event.senderFrame === mainWindow.webContents.mainFrame;
}

function isSaveRequest(value: unknown): value is SaveRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v['path'] === null || typeof v['path'] === 'string') &&
    typeof v['text'] === 'string' &&
    Buffer.byteLength(v['text'], 'utf8') <= MAX_YAML_BYTES &&
    typeof v['suggestedName'] === 'string'
  );
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80);
  return /\.ya?ml$/i.test(cleaned) ? cleaned : `${cleaned || 'player'}.yaml`;
}

function settingsView(): SettingsView {
  const saved = settingsStore!.value;
  // YAMMEL_SKIP_WELCOME is for tests and scripted runs: it hides the first-run card without saving anything.
  const settings = process.env['YAMMEL_SKIP_WELCOME'] === '1' && !saved.welcome.seen ? { ...saved, welcome: { seen: true } } : saved;
  return { settings, finding: detectArchipelago({ settings, env: process.env, appPath: app.getAppPath() }) };
}

function registerIpc(): void {
  const idleMs = Number(process.env['ARCHIPELAGO_ENGINE_IDLE_MS']);
  engine = new SeedEngine(
    engineSpec(),
    Number.isFinite(idleMs) && idleMs > 0 ? { idleMs } : {},
  );

  ipcMain.handle(IPC.getSettings, async (event): Promise<ApiResult<SettingsView>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: settingsView() };
  });

  ipcMain.handle(IPC.saveSettings, (event, patch: unknown): Promise<ApiResult<SettingsView>> => {
    if (!fromOurWindow(event) || settingsStore === null || engine === null) return Promise.resolve({ ok: false, message: 'Request refused.' });
    // One at a time, so a second change is applied on top of the first instead of on stale settings.
    const run = async (): Promise<ApiResult<SettingsView>> => {
      const before = settingsStore!.value;
      const next = applyPatch(before, patch);
      const fields = ['sourceRoot', 'pythonPath', 'customWorldsDir'] as const;
      for (const field of fields) {
        const path = next.archipelago[field];
        if (path !== null && path !== before.archipelago[field] && !approvedSettingPaths.has(path)) {
          return { ok: false, message: 'Choose that folder or program with the Browse button.' };
        }
      }
      try {
        await settingsStore!.save(next);
      } catch {
        return { ok: false, message: 'The settings could not be saved.' };
      }
      if (next.archipelago.customWorldsDir !== before.archipelago.customWorldsDir) engineCustomFiles = [];
      engine!.reconfigure(engineSpec());
      // The window's own "prefers dark" follows this, so the whole page restyles without any page code.
      nativeTheme.themeSource = next.appearance.theme;
      // A different (or removed) custom worlds folder makes the old scan wrong, so it is dropped.
      if (next.archipelago.customWorldsDir !== before.archipelago.customWorldsDir) {
        scanning?.abort();
        // The new folder is already saved; an old scan file that is still in use must not turn that into an error.
        await clearCustomWorlds(app.getPath('userData')).catch(() => undefined);
      }
      return { ok: true, value: settingsView() };
    };
    const result = settingsLock.then(run, run);
    settingsLock = result.then(() => undefined, () => undefined);
    return result;
  });

  ipcMain.handle(IPC.generatorStatus, async (event): Promise<ApiResult<GeneratorStatus>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: generatorStatus(findGenerator(settingsView().finding)) };
  });

  ipcMain.handle(IPC.pickPlayerYamls, async (event): Promise<ApiResult<string[]>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    const picked = await dialog.showOpenDialog(mainWindow, { title: "Choose other players' YAML files", properties: ['openFile', 'multiSelections'], filters: YAML_FILTERS });
    if (picked.canceled) return { ok: true, value: [] };
    const files = picked.filePaths.map((file) => resolve(file)).slice(0, 40);
    for (const file of files) approvedPlayerFiles.add(file);
    return { ok: true, value: files };
  });

  ipcMain.handle(IPC.generate, async (event, request: unknown): Promise<ApiResult<GenerateResult>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    const r = typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {};
    const yaml = typeof r['yaml'] === 'object' && r['yaml'] !== null ? (r['yaml'] as Record<string, unknown>) : {};
    const extra = Array.isArray(r['extraFiles']) ? r['extraFiles'] : [];
    if ((r['mode'] !== 'check' && r['mode'] !== 'make') || typeof yaml['name'] !== 'string' || typeof yaml['text'] !== 'string' || Buffer.byteLength(yaml['text'], 'utf8') > MAX_YAML_BYTES || extra.length > 40 || !extra.every((file) => typeof file === 'string')) {
      return { ok: false, message: 'That request was not valid.' };
    }
    if (generating !== null) return { ok: false, message: 'A seed is already being made.' };
    const spec = findGenerator(settingsView().finding);
    if ('unavailable' in spec) return { ok: true, value: { ok: false, reason: 'unavailable', problems: [spec.unavailable], log: '' } };
    generating = new AbortController();
    try {
      const result = await runGenerate(r as unknown as GenerateRequest, { spec, seedsRoot: seedsRoot(), env: process.env, approvedFiles: approvedPlayerFiles, signal: generating.signal });
      if (result.ok && result.folder !== null) seedFolders.add(result.folder);
      return { ok: true, value: result };
    } finally {
      generating = null;
    }
  });

  ipcMain.handle(IPC.cancelGenerate, async (event): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    generating?.abort();
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.revealSeed, async (event, path: unknown): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event) || typeof path !== 'string') return { ok: false, message: 'Request refused.' };
    const target = resolve(path);
    const inside = [...seedFolders].some((folder) => target === folder || target.startsWith(`${folder}\\`) || target.startsWith(`${folder}/`));
    if (!inside) return { ok: false, message: 'Only seeds made in this session can be shown.' };
    shell.showItemInFolder(target);
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.hostFiles, async (event): Promise<ApiResult<HostFileInfo[]>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: hostCandidates(settingsView().finding) };
  });

  ipcMain.handle(IPC.readHost, async (event, id: unknown): Promise<ApiResult<HostFileContents>> => {
    if (!fromOurWindow(event) || settingsStore === null || (id !== 'installed' && id !== 'source')) return { ok: false, message: 'Request refused.' };
    try {
      return { ok: true, value: await readHostFile(settingsView().finding, id) };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IPC.writeHost, async (event, request: unknown): Promise<ApiResult<HostWriteResult>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    const r = typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {};
    if ((r['id'] !== 'installed' && r['id'] !== 'source') || typeof r['text'] !== 'string' || typeof r['expected'] !== 'string') {
      return { ok: false, message: 'That request was not valid.' };
    }
    try {
      return { ok: true, value: await writeHostFile(settingsView().finding, r['id'], r['text'], r['expected'], join(app.getPath('userData'), 'backups')) };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IPC.checkHostPaths, async (event, id: unknown, values: unknown): Promise<ApiResult<boolean[]>> => {
    if (!fromOurWindow(event) || settingsStore === null || (id !== 'installed' && id !== 'source') || !Array.isArray(values)) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: checkHostPaths(settingsView().finding, id, values) };
  });

  ipcMain.handle(IPC.listHostBackups, async (event): Promise<ApiResult<HostBackup[]>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: await listHostBackups(join(app.getPath('userData'), 'backups')) };
  });

  ipcMain.handle(IPC.readHostBackup, async (event, name: unknown): Promise<ApiResult<string>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    try {
      return { ok: true, value: await readHostBackup(join(app.getPath('userData'), 'backups'), name) };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IPC.pickHostPath, async (event, kind: unknown): Promise<ApiResult<string | null>> => {
    if (!fromOurWindow(event) || mainWindow === null || (kind !== 'file' && kind !== 'folder')) return { ok: false, message: 'Request refused.' };
    const picked = await dialog.showOpenDialog(mainWindow, { title: kind === 'folder' ? 'Choose a folder' : 'Choose a file', properties: [kind === 'folder' ? 'openDirectory' : 'openFile'] });
    return { ok: true, value: picked.canceled || picked.filePaths[0] === undefined ? null : resolve(picked.filePaths[0]) };
  });

  ipcMain.handle(IPC.helperStatus, async (event): Promise<ApiResult<HelperStatus[]>> => {
    if (!fromOurWindow(event) || secrets === null || settingsStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: helperStatuses(helperDeps()) };
  });

  ipcMain.handle(IPC.askHelper, async (event, request: unknown): Promise<ApiResult<string>> => {
    if (!fromOurWindow(event) || secrets === null || settingsStore === null) return { ok: false, message: 'Request refused.' };
    const r = typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {};
    if (!isHelperId(r['helperId'])) return { ok: false, message: 'That helper is not known.' };
    const answer = await askHelper(helperDeps(), r['helperId'], r['prompt']);
    return answer.ok ? { ok: true, value: answer.text } : { ok: false, message: answer.message };
  });

  ipcMain.handle(IPC.setOpenRouterKey, async (event, key: unknown): Promise<ApiResult<HelperStatus[]>> => {
    if (!fromOurWindow(event) || secrets === null || settingsStore === null) return { ok: false, message: 'Request refused.' };
    if (key !== null && (typeof key !== 'string' || key.length > 400 || /[\s\u0000-\u001f]/.test(key))) return { ok: false, message: 'That does not look like a key.' };
    try {
      await secrets.set('openRouter', key);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'The key could not be saved.' };
    }
    return { ok: true, value: helperStatuses(helperDeps()) };
  });

  ipcMain.handle(IPC.loadRecommender, async (event): Promise<ApiResult<RecommenderState>> => {
    if (!fromOurWindow(event) || recommenderStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: recommenderStore.value };
  });

  ipcMain.handle(IPC.saveRecommender, async (event, state: unknown): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event) || recommenderStore === null) return { ok: false, message: 'Request refused.' };
    try {
      await recommenderStore.save(parseRecommenderState(state));
      return { ok: true, value: null };
    } catch {
      return { ok: false, message: 'Your recommendation history could not be saved.' };
    }
  });

  ipcMain.handle(IPC.pickArchipelagoFolder, async (event): Promise<ApiResult<string | null>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose your Archipelago source folder',
      properties: ['openDirectory'],
    });
    const chosen = picked.filePaths[0];
    if (picked.canceled || chosen === undefined) return { ok: true, value: null };
    approvedSettingPaths.add(resolve(chosen));
    return { ok: true, value: resolve(chosen) };
  });

  ipcMain.handle(IPC.pickCustomWorlds, async (event): Promise<ApiResult<string | null>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    const picked = await dialog.showOpenDialog(mainWindow, { title: 'Choose your custom worlds folder (the one with .apworld files)', properties: ['openDirectory'] });
    const chosen = picked.filePaths[0];
    if (picked.canceled || chosen === undefined) return { ok: true, value: null };
    approvedSettingPaths.add(resolve(chosen));
    return { ok: true, value: resolve(chosen) };
  });

  ipcMain.handle(IPC.customWorldsStatus, async (event): Promise<ApiResult<CustomWorldsStatus>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    const folder = settingsStore.value.archipelago.customWorldsDir;
    const blocker = scanBlocker(settingsView().finding);
    return { ok: true, value: { folder, canScan: blocker === null, reason: blocker, scanning: scanning !== null, summary: await readSummary(app.getPath('userData'), folder) } };
  });

  ipcMain.handle(IPC.scanCustomWorlds, async (event): Promise<ApiResult<ScanResult>> => {
    if (!fromOurWindow(event) || settingsStore === null) return { ok: false, message: 'Request refused.' };
    const folder = settingsStore.value.archipelago.customWorldsDir;
    if (folder === null) return { ok: false, message: 'Choose a custom worlds folder first.' };
    if (!existsSync(folder)) return { ok: true, value: { ok: false, reason: 'failed', message: `The folder ${folder} was not found.` } };
    if (scanning !== null) return { ok: false, message: 'A scan is already running.' };
    scanning = new AbortController();
    try {
      const result = await scanCustomWorlds({ finding: settingsView().finding, folder, script: join(app.getAppPath(), 'extractor', 'schema_extract.py'), userData: app.getPath('userData'), env: process.env, signal: scanning.signal });
      return { ok: true, value: result };
    } finally {
      scanning = null;
    }
  });

  ipcMain.handle(IPC.cancelScan, async (event): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    scanning?.abort();
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.pickPythonFile, async (event): Promise<ApiResult<string | null>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a Python program',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Python', extensions: ['exe'] }] : [],
    });
    const chosen = picked.filePaths[0];
    if (picked.canceled || chosen === undefined) return { ok: true, value: null };
    const path = resolve(chosen);
    if (!PYTHON_NAME.test(basename(path))) return { ok: false, message: 'Choose a file named python or python.exe.' };
    approvedSettingPaths.add(path);
    return { ok: true, value: path };
  });

  ipcMain.handle(IPC.countChecks, async (event, request: unknown): Promise<CountResult> => {
    if (!fromOurWindow(event) || engine === null) return { ok: false, reason: 'failed', message: 'Request refused.' };
    const parsed = parseCountRequest(request);
    if (parsed === null) return { ok: false, reason: 'failed', message: 'That request was not valid.' };
    // A custom game is counted from its own .apworld: the first count of one restarts the engine with that file added.
    const file = await customWorldFile(parsed.game);
    if (file !== null && !engineCustomFiles.includes(file)) {
      engineCustomFiles = [...engineCustomFiles, file];
      engine.reconfigure(engineSpec());
    }
    return engine.count(parsed.game, parsed.options);
  });

  ipcMain.handle(IPC.loadSchema, async (event): Promise<ApiResult<string>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    try {
      return { ok: true, value: await schemaWithCustom(schemaPath(), app.getPath('userData'), settingsStore?.value.archipelago.customWorldsDir ?? null) };
    } catch {
      return { ok: false, message: 'The game option data (schema.json) could not be read.' };
    }
  });

  ipcMain.handle(IPC.openYaml, async (event): Promise<ApiResult<OpenedFile | null>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    try {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Open a player YAML',
        properties: ['openFile'],
        filters: YAML_FILTERS,
      });
      const chosen = picked.filePaths[0];
      if (picked.canceled || chosen === undefined) return { ok: true, value: null };
      const path = resolve(chosen);
      const text = await readYamlFile(path);
      approvedPaths.add(path);
      noteRecent(path);
      return { ok: true, value: { path, text } };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IPC.openHelperWindow, async (event): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    openHelperWindow();
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.closeHelperWindow, async (event): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event) && !fromHelperWindow(event)) return { ok: false, message: 'Request refused.' };
    if (helperWindow !== null && !helperWindow.isDestroyed()) helperWindow.close();
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.isHelperWindowOpen, async (event): Promise<ApiResult<boolean>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: helperWindow !== null && !helperWindow.isDestroyed() };
  });

  ipcMain.handle(IPC.publishHelper, async (event, snapshot: unknown): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event)) return { ok: false, message: 'Request refused.' };
    if (!isSendableSnapshot(snapshot)) return { ok: false, message: 'That was not a conversation.' };
    helperSnapshot = snapshot;
    if (helperWindow !== null && !helperWindow.isDestroyed()) helperWindow.webContents.send(IPC.helperSnapshotEvent, snapshot);
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.getHelperSnapshot, async (event): Promise<ApiResult<HelperSnapshot | null>> => {
    if (!fromHelperWindow(event)) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: helperSnapshot };
  });

  ipcMain.handle(IPC.sendHelperAction, async (event, raw: unknown): Promise<ApiResult<null>> => {
    if (!fromHelperWindow(event)) return { ok: false, message: 'Request refused.' };
    const action = parseHelperAction(raw);
    if (action === null) return { ok: false, message: 'That was not something the helper can do.' };
    tellMainWindow(IPC.helperActionEvent, action);
    // "Show me" is about the main window, so bring it forward.
    if (action.type === 'point' && mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.focus();
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.recentFiles, async (event): Promise<ApiResult<RecentFile[]>> => {
    if (!fromOurWindow(event) || recentStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: describeRecent(recentStore.value, existsSync) };
  });

  ipcMain.handle(IPC.openRecent, async (event, request: unknown): Promise<ApiResult<OpenedFile>> => {
    if (!fromOurWindow(event) || recentStore === null || typeof request !== 'string') return { ok: false, message: 'Request refused.' };
    // Only a path this app itself listed can be opened this way; the window cannot name any other file.
    if (!recentStore.value.files.some((file) => file.path === request)) return { ok: false, message: 'That file is not in the recent list.' };
    try {
      const text = await readYamlFile(request);
      approvedPaths.add(request);
      noteRecent(request);
      return { ok: true, value: { path: request, text } };
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (missing) await recentStore.save(removeRecent(recentStore.value, request)).catch(() => undefined);
      return missing ? { ok: false, message: 'That file is not there any more, so it was taken off the list.' } : fail(error);
    }
  });

  ipcMain.handle(IPC.clearRecent, async (event): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event) || recentStore === null) return { ok: false, message: 'Request refused.' };
    await recentStore.save({ files: [] }).catch(() => undefined);
    return { ok: true, value: null };
  });

  ipcMain.handle(IPC.loadPresets, async (event): Promise<ApiResult<PresetsState>> => {
    if (!fromOurWindow(event) || presetsStore === null) return { ok: false, message: 'Request refused.' };
    return { ok: true, value: presetsStore.value };
  });

  ipcMain.handle(IPC.savePresets, async (event, state: unknown): Promise<ApiResult<null>> => {
    if (!fromOurWindow(event) || presetsStore === null) return { ok: false, message: 'Request refused.' };
    try {
      await presetsStore.save(parsePresets(state));
      return { ok: true, value: null };
    } catch {
      return { ok: false, message: 'The presets could not be saved.' };
    }
  });

  ipcMain.handle(IPC.saveYaml, async (event, request: unknown): Promise<ApiResult<SaveResult | null>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    if (!isSaveRequest(request)) return { ok: false, message: 'That save request was not valid.' };
    try {
      let target = request.path !== null ? resolve(request.path) : null;
      if (target !== null && !approvedPaths.has(target)) target = null; // never write to an unapproved path
      if (target === null) {
        const picked = await dialog.showSaveDialog(mainWindow, {
          title: 'Save player YAML',
          defaultPath: join(app.getPath('documents'), safeFileName(request.suggestedName)),
          filters: YAML_FILTERS,
        });
        if (picked.canceled || picked.filePath === undefined) return { ok: true, value: null };
        target = resolve(picked.filePath);
      }
      await saveTextSafely(target, request.text, join(app.getPath('userData'), 'backups'));
      approvedPaths.add(target);
      noteRecent(target);
      return { ok: true, value: { path: target } };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IPC.saveYamlFolder, async (event, request: unknown): Promise<ApiResult<SaveFolderResult | null>> => {
    if (!fromOurWindow(event) || mainWindow === null) return { ok: false, message: 'Request refused.' };
    const files = parseFolderFiles(request);
    if (files === null) return { ok: false, message: 'That save request was not valid.' };
    try {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose a folder for the YAML files',
        properties: ['openDirectory', 'createDirectory'],
      });
      const chosen = picked.filePaths[0];
      if (picked.canceled || chosen === undefined) return { ok: true, value: null };
      const folder = resolve(chosen);
      const written = await writeYamlFolder(folder, files, join(app.getPath('userData'), 'backups'));
      return { ok: true, value: { folder, written } };
    } catch (error) {
      return fail(error);
    }
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Yammel',
    ...appIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
    helperSnapshot = null;
    // The helper window belongs to the main window: it goes when the main window goes.
    if (helperWindow !== null && !helperWindow.isDestroyed()) helperWindow.close();
  });

  // The page asks to stay open when there are unsaved changes; this is where the user decides.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'You have unsaved changes.',
      detail: 'If you close now, they will be lost.',
      buttons: ['Keep editing', 'Discard changes'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault(); // ignore the page's request and close anyway
  });

  // The window may only ever show our own page.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(async () => {
  app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  });
  settingsStore = SettingsStore.in(app.getPath('userData'));
  await settingsStore.load();
  nativeTheme.themeSource = settingsStore.value.appearance.theme;
  recommenderStore = new JsonFileStore(join(app.getPath('userData'), 'recommender.json'), parseRecommenderState, MAX_STATE_BYTES);
  await recommenderStore.load();
  recentStore = new JsonFileStore(join(app.getPath('userData'), 'recent.json'), parseRecent, MAX_RECENT_BYTES);
  await recentStore.load();
  presetsStore = new JsonFileStore(join(app.getPath('userData'), 'presets.json'), parsePresets, MAX_PRESETS_BYTES);
  await presetsStore.load();
  secrets = SecretStore.in(app.getPath('userData'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
    decrypt: (base64) => safeStorage.decryptString(Buffer.from(base64, 'base64')),
  });
  await secrets.load();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  engine?.stop(); // never leave the Python process behind
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
