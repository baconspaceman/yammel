import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// A throwaway custom worlds folder with one real tiny world and one broken one, scanned by the REAL Archipelago loader.
const CLONE = join(process.cwd(), '..', 'archipelago-dev', 'Archipelago');
const PYTHON = join(CLONE, '.venv', 'Scripts', 'python.exe');
const FOLDER = mkdtempSync(join(tmpdir(), 'yamled-customworlds-'));
execFileSync(PYTHON, [join(process.cwd(), 'tests', 'fixtures', 'make-tiny-apworld.py'), FOLDER]);

const pickFolder = (app: import('@playwright/test').ElectronApplication, path: string) =>
  app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, path);

const openCustom = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Add custom worlds' }).click();
  await expect(page.getByRole('heading', { name: 'Custom worlds' })).toBeVisible();
};

test('choosing a folder scans it with the real loader, adds the game, and a YAML can be made for it', async ({ app, page, userData }) => {
  test.setTimeout(240_000);
  await pickFolder(app, FOLDER);
  await openCustom(page);
  await expect(page.getByTestId('custom-folder')).toHaveText('Not chosen');
  await page.getByRole('button', { name: /Choose/ }).click();
  await expect(page.getByText(/Found 1 custom game\./)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('custom-summary')).toContainText('1 custom game available, 1 file could not be added');
  await page.getByText('The games found').click();
  await expect(page.getByRole('list', { name: 'Custom games' })).toContainText('Tiny Custom E2E Game');
  await page.getByText('Files that could not be added').click();
  await expect(page.getByRole('list', { name: 'Files that could not be added' })).toContainText('broken_e2e_world.apworld');
  expect(readdirSync(FOLDER).sort()).toEqual(['broken_e2e_world.apworld', 'tiny_e2e_world.apworld']); // the folder itself is only read
  expect(existsSync(join(userData, 'custom-worlds', 'schema.json'))).toBe(true);

  // Make a YAML for it straight from the list: the world's own options are there.
  await page.getByRole('button', { name: 'Make a YAML' }).click();
  await expect(page.locator('article[data-key="tiny_switch"]')).toBeVisible();
  await expect(page.locator('article[data-key="tiny_number"]')).toBeVisible();
  await expect(page.getByLabel('YAML text', { exact: true })).toContainText('game: Tiny Custom E2E Game');
});

test('the game is tagged custom on the start screen, and forgetting the folder removes it again', async ({ app, page, userData }) => {
  test.setTimeout(240_000);
  await pickFolder(app, FOLDER);
  await openCustom(page);
  await page.getByRole('button', { name: /Choose/ }).click();
  await expect(page.getByText(/Found 1 custom game\./)).toBeVisible({ timeout: 180_000 });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByLabel('Search games').fill('Tiny Custom');
  await expect(page.getByRole('list', { name: 'Games' })).toContainText('custom');
  await page.getByRole('button', { name: /Tiny Custom E2E Game/ }).click();
  await expect(page.locator('article[data-key="tiny_switch"]')).toBeVisible();

  // Forget: the cached scan is deleted and the setting is cleared.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Forget this folder' }).click();
  await expect(page.getByTestId('custom-folder')).toHaveText('Not chosen');
  expect(existsSync(join(userData, 'custom-worlds'))).toBe(false);
  expect(JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).archipelago.customWorldsDir).toBeNull();
});

test('starter YAMLs can be saved for every custom game, without touching the folder', async ({ app, page }) => {
  test.setTimeout(240_000);
  const out = mkdtempSync(join(tmpdir(), 'yamled-starters-'));
  await pickFolder(app, FOLDER);
  await openCustom(page);
  await page.getByRole('button', { name: /Choose/ }).click();
  await expect(page.getByText(/Found 1 custom game\./)).toBeVisible({ timeout: 180_000 });
  await pickFolder(app, out);
  await page.getByRole('button', { name: /Save a starter YAML for every custom game/ }).click();
  await expect(page.getByText(/^Saved 1 file to /)).toBeVisible();
  const files = readdirSync(out);
  expect(files).toEqual(['tiny-custom-e2e-game.yaml']);
  expect(readFileSync(join(out, files[0]!), 'utf8')).toContain('game: Tiny Custom E2E Game');
  expect(readdirSync(FOLDER)).toHaveLength(2);
});

test('the page cannot point the custom worlds setting at a folder it did not pick', async ({ page, userData }) => {
  const reply = await page.evaluate(() => window.api.saveSettings({ archipelago: { customWorldsDir: 'C:\\Windows\\System32' } }));
  expect(reply.ok).toBe(false);
  expect(existsSync(join(userData, 'settings.json'))).toBe(false);
});

test('the custom worlds screen never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(240_000);
  await pickFolder(app, FOLDER);
  await openCustom(page);
  await page.getByRole('button', { name: /Choose/ }).click();
  await expect(page.getByText(/Found 1 custom game\./)).toBeVisible({ timeout: 180_000 });
  await page.getByText('The games found').click();
  await page.getByText('Files that could not be added').click();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [width, height, zoom] of [
      [900, 600, 1],
      [1280, 720, 1],
      [900, 600, 2],
    ] as const) {
      await setZoom(app, zoom);
      await setWindowSize(app, width, height);
      const report = await checkEverything(page);
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(10);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
