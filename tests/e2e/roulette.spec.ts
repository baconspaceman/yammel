import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// No seed engine is needed here, so it is pointed at a folder that does not exist.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

async function openRoulette(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Game roulette' }).click();
  await expect(page.getByRole('heading', { name: 'Game roulette' })).toBeVisible();
}

async function setCount(page: import('@playwright/test').Page, count: number) {
  await page.getByLabel('How many games').fill(String(count));
  await expect(page.locator('.roulette__value')).toHaveText(String(count));
}

/** Presses Spin and waits for the reveal to finish (while spinning the slots show cycling placeholder names). */
async function spin(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Spin' }).click();
  await expect(page.getByText('Spinning…')).toHaveCount(0, { timeout: 10_000 });
}

test('spins the chosen number of different games, makes a YAML for each, and opens one in the editor', async ({ page }) => {
  await openRoulette(page);
  await setCount(page, 4);
  await spin(page);
  const items = page.getByRole('list', { name: 'Roulette results' }).getByRole('listitem');
  await expect(items).toHaveCount(4, { timeout: 10_000 });
  const names = await items.locator('.roulette__name').allTextContents();
  expect(new Set(names).size).toBe(4);

  await page.getByRole('button', { name: `Open ${names[1]} in editor` }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
  await expect(page.locator('.yaml')).toContainText(`game: ${names[1]}`);
  await expect(page.locator('.yaml')).toContainText('name: Roulette2');
});

test('games only: shows the picks, makes no YAML files, but can start one game', async ({ page }) => {
  await openRoulette(page);
  await page.getByLabel('Games only').check();
  await setCount(page, 2);
  await spin(page);
  const items = page.getByRole('list', { name: 'Roulette results' }).getByRole('listitem');
  await expect(items).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Save all YAMLs/ })).toHaveCount(0);
  const first = (await items.first().locator('.roulette__name').textContent()) ?? '';
  await items.first().getByRole('button', { name: 'Start a YAML for this game' }).click();
  await expect(page.locator('.yaml')).toContainText(`game: ${first}`);
});

test('YAMLs only: one game goes straight into the editor, several show a list without a reveal', async ({ page }) => {
  await openRoulette(page);
  await page.getByLabel('YAMLs only').check();
  await setCount(page, 1);
  await page.getByRole('button', { name: 'Spin' }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
  await expect(page.locator('.yaml')).toContainText('name: Roulette1');

  await page.getByRole('button', { name: 'New' }).click();
  await openRoulette(page);
  await page.getByLabel('YAMLs only').check();
  await setCount(page, 3);
  await spin(page);
  await expect(page.getByRole('list', { name: 'Roulette results' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Spinning…')).toHaveCount(0);
});

test('re-roll replaces only one game and never repeats another', async ({ page }) => {
  await openRoulette(page);
  await setCount(page, 5);
  await spin(page);
  const names = page.getByRole('list', { name: 'Roulette results' }).locator('.roulette__name');
  await expect(names).toHaveCount(5, { timeout: 10_000 });
  const before = await names.allTextContents();
  await page.getByRole('button', { name: `Re-roll ${before[2]}` }).click();
  const after = await names.allTextContents();
  expect(after).toHaveLength(5);
  expect(after[2]).not.toBe(before[2]);
  expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
  expect(new Set(after).size).toBe(5);
});

test('saves every YAML into a chosen folder and never overwrites what is already there', async ({ app, page }) => {
  const folder = mkdtempSync(join(tmpdir(), 'yamled-roulette-'));
  await answerOpenDialog(app, folder); // the folder dialog is answered like the open dialog
  await openRoulette(page);
  await setCount(page, 3);
  await spin(page);
  await expect(page.getByRole('list', { name: 'Roulette results' }).getByRole('listitem')).toHaveCount(3, { timeout: 10_000 });

  await page.getByRole('button', { name: /Save all YAMLs/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved 3 files' })).toBeVisible();
  const first = readdirSync(folder).sort();
  expect(first).toHaveLength(3);
  expect(first.every((n) => /^0[1-3]-[a-z0-9-]+\.yaml$/.test(n))).toBe(true);
  const original = first.map((n) => readFileSync(join(folder, n), 'utf8'));
  expect(original[0]).toMatch(/^name: Roulette1\ngame: /);

  await page.getByRole('button', { name: /Save all YAMLs/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved 3 files' })).toBeVisible();
  const second = readdirSync(folder).sort();
  expect(second).toHaveLength(6);
  expect(second.filter((n) => n.includes('(2)'))).toHaveLength(3);
  expect(first.map((n) => readFileSync(join(folder, n), 'utf8'))).toEqual(original); // originals untouched
});

test('cancelling the folder dialog saves nothing', async ({ app, page }) => {
  await answerOpenDialog(app, null);
  await openRoulette(page);
  await spin(page);
  await page.getByRole('button', { name: /Save all YAMLs/ }).click({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Nothing was saved.' })).toBeVisible();
});

test('the roulette never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(180_000);
  await openRoulette(page);
  await setCount(page, 10);
  await spin(page);
  await expect(page.getByRole('list', { name: 'Roulette results' }).getByRole('listitem')).toHaveCount(10, { timeout: 10_000 });
  await page.getByRole('button', { name: /Save all YAMLs/ }).click({ trial: true });

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
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(20);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
