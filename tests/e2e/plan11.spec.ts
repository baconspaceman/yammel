import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

const DIR = mkdtempSync(join(tmpdir(), 'yamled-p11-'));
const write = (name: string, text: string) => {
  const path = join(DIR, name);
  writeFileSync(path, text, 'utf8');
  return path;
};
const pickFolder = (app: import('@playwright/test').ElectronApplication, path: string) =>
  app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, path);

const TWO = `# first
name: Alice
game: APQuest
APQuest:
  hard_mode: true
---
name: Bob
game: APQuest
APQuest:
  hammer: true
`;

test('presets: the game\'s own presets apply as one undoable step', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('tab', { name: 'Presets' }).click();
  const list = page.getByRole('list', { name: 'Presets that come with APQuest' });
  await expect(list).toContainText('boring');
  await list.locator('li', { hasText: 'the true way to play' }).getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/^Applied "the true way to play"/)).toBeVisible();
  await page.getByRole('tab', { name: 'YAML' }).click();
  await expect(page.getByLabel('YAML text', { exact: true })).toContainText('hard_mode: true');
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('YAML text', { exact: true })).not.toContainText('hard_mode: true');
});

test('presets: your own can be saved, survive a restart of the list, replace by name, apply to a fresh YAML, and be deleted', async ({ page, userData }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('tab', { name: 'Presets' }).click();
  await page.getByLabel('Preset name').fill('Empty');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nothing is set' })).toBeVisible();

  // set something through the first built-in preset, then save it under my own name
  await page.getByRole('list', { name: 'Presets that come with APQuest' }).locator('li', { hasText: 'the true way to play' }).getByRole('button', { name: 'Apply' }).click();
  await page.getByLabel('Preset name').fill('My hard run');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByText(/Saved the preset "My hard run"/)).toBeVisible();
  const mine = page.getByRole('list', { name: 'Your presets for APQuest' });
  await expect(mine).toContainText('My hard run');
  expect(JSON.parse(readFileSync(join(userData, 'presets.json'), 'utf8')).presets[0].name).toBe('My hard run');

  // saving the same name again replaces it instead of adding another
  await page.getByLabel('Preset name').fill('my hard run');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByText(/Replaced the preset/)).toBeVisible();
  await expect(mine.locator('li')).toHaveCount(1);

  // apply to a different, fresh YAML after going back to the start
  await page.getByRole('button', { name: 'Delete the preset my hard run' }).click();
  await expect(page.getByText(/Deleted the preset/)).toBeVisible();
  await expect(page.getByText('You have not saved any yet.')).toBeVisible();
  expect(JSON.parse(readFileSync(join(userData, 'presets.json'), 'utf8')).presets).toEqual([]);
});

test('recent files: opened and saved files are listed on the start screen, open again with one click, and can be cleared', async ({ app, page }) => {
  const one = write('recent-one.yaml', 'name: One\ngame: APQuest\nAPQuest: {}\n');
  await expect(page.getByRole('region', { name: 'Recent files' })).toHaveCount(0);
  await answerOpenDialog(app, one);
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.getByLabel('YAML text', { exact: true })).toContainText('name: One');
  await page.reload();
  const recent = page.getByRole('region', { name: 'Recent files' });
  await expect(recent).toContainText('recent-one.yaml');
  await recent.getByRole('button', { name: /recent-one\.yaml/ }).click();
  await expect(page.getByLabel('YAML text', { exact: true })).toContainText('name: One');
  await page.reload();
  await page.getByRole('button', { name: 'Clear this list' }).click();
  await expect(page.getByRole('region', { name: 'Recent files' })).toHaveCount(0);
});

test('recent files: a file that is gone says so, is removed, and the window cannot open files that are not in the list', async ({ app, page }) => {
  const gone = write('recent-gone.yaml', 'name: Gone\ngame: APQuest\nAPQuest: {}\n');
  await answerOpenDialog(app, gone);
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.getByLabel('YAML text', { exact: true })).toContainText('name: Gone');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Recent files' })).toContainText('recent-gone.yaml');
  const { rmSync } = await import('node:fs');
  rmSync(gone);
  // files that no longer exist are not even listed
  await page.reload();
  await expect(page.getByRole('region', { name: 'Recent files' })).toHaveCount(0);
  const refused = await page.evaluate(() => window.api.openRecent('C:\\Windows\\win.ini'));
  expect(refused.ok).toBe(false);
});

test('a file with several players asks which one, never changes the original, and can be split into one file each', async ({ app, page }) => {
  const multi = write('two-players.yaml', TWO);
  await answerOpenDialog(app, multi);
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.getByRole('heading', { name: 'This file has 2 players' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Players in this file' });
  await expect(list).toContainText('Alice');
  await expect(list).toContainText('Bob');

  const out = mkdtempSync(join(tmpdir(), 'yamled-split-'));
  await pickFolder(app, out);
  await page.getByRole('button', { name: /Save each player as its own file/ }).click();
  await expect(page.getByText(/^Saved 2 files to /)).toBeVisible();
  expect(readdirSync(out).sort()).toEqual(['alice-apquest.yaml', 'bob-apquest.yaml']);
  expect(readFileSync(join(out, 'alice-apquest.yaml'), 'utf8')).toContain('# first');
  expect(readFileSync(join(out, 'bob-apquest.yaml'), 'utf8')).not.toContain('Alice');

  await list.locator('li', { hasText: 'Bob' }).getByRole('button', { name: 'Edit this one' }).click();
  await expect(page.getByLabel('YAML text', { exact: true })).toContainText('name: Bob');
  await expect(page.getByLabel('YAML text', { exact: true })).not.toContainText('Alice');
  expect(readFileSync(multi, 'utf8')).toBe(TWO);
  expect(existsSync(multi)).toBe(true);
});

test('the new screens never overlap or clip text, in both themes, small windows and zoom', async ({ app, page }) => {
  const multi = write('layout-two.yaml', TWO);
  await answerOpenDialog(app, multi);
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.getByRole('heading', { name: 'This file has 2 players' })).toBeVisible();
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
      expect(report.problems, `multi ${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
  await setZoom(app, 1);
  await setWindowSize(app, 1280, 800);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('tab', { name: 'Presets' }).click();
  await expect(page.getByRole('region', { name: 'Presets' })).toBeVisible();
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
      expect(report.problems, `presets ${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
