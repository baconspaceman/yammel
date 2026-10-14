import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Tests run from the project root (npm run e2e). */
export const ROOT = process.cwd();
export const MINI_SCHEMA = join(ROOT, 'tests', 'fixtures', 'mini-schema.json');

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
}

/** Starts the built app with its own throwaway user-data folder, so tests never touch real settings or backups. */
export async function launch(
  options: { schema?: string; userData?: string; env?: Record<string, string> } = {},
): Promise<Launched> {
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), 'yamled-ud-'));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  if (options.schema !== undefined) env['ARCHIPELAGO_YAML_SCHEMA'] = options.schema;
  Object.assign(env, options.env ?? {});
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env, cwd: ROOT });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userData };
}

/** Makes the Open dialog answer with this file, as if the user had picked it, or cancel when null. */
export async function answerOpenDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = (async () =>
      filePath === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [filePath] }) as typeof dialog.showOpenDialog;
  }, path);
}

/** Makes the Save dialog answer with this path, or cancel when null. */
export async function answerSaveDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () =>
      filePath === null ? { canceled: true, filePath: undefined } : { canceled: false, filePath }) as typeof dialog.showSaveDialog;
  }, path);
}

export async function setWindowSize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    win.setContentSize(size.width, size.height);
  }, { width, height });
}

/**
 * Closes the app even when a document has unsaved changes: the app's own "discard changes?"
 * box is answered with "Discard", and a stuck process is killed after ten seconds.
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync;
    })
    .catch(() => undefined);
  const stuck = Symbol('stuck');
  const outcome = await Promise.race([
    app.close().then(() => 'closed' as const).catch(() => 'closed' as const),
    new Promise<typeof stuck>((resolve) => setTimeout(() => resolve(stuck), 10_000)),
  ]);
  if (outcome === stuck) app.process().kill();
}

/** Zooms the whole window like the user's "make everything bigger" setting (1.25 = 125%). */
export async function setZoom(app: ElectronApplication, factor: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, zoom) => {
    BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(zoom);
  }, factor);
}

/**
 * How many seed-engine Python processes are running right now, anywhere on this machine. Only python
 * processes are counted (the check itself, and the shell running it, also mention the script name).
 * A virtual-environment launcher may show up as two processes, so compare with zero or "more than before",
 * never with an exact number.
 */
export function seedEngineProcessCount(): number {
  const command =
    "(Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*seed_engine.py*' } | Measure-Object).Count";
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  return Number(out.trim());
}

/** How many Archipelago generator programs are running right now (for checking that Stop really stops them). */
export function generatorProcessCount(): number {
  const command =
    "(Get-CimInstance Win32_Process | Where-Object { ($_.Name -like 'python*' -and $_.CommandLine -like '*Generate.py*') -or $_.Name -like 'ArchipelagoGenerate*' } | Measure-Object).Count";
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  return Number(out.trim());
}
