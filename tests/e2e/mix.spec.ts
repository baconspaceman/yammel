import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { closeApp, launch, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// No seed engine is needed: the facts about each game ship with the app.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

async function openMix(page: Page) {
  await page.getByRole('button', { name: 'Games to mix' }).click();
  await expect(page.getByRole('heading', { name: 'Games to mix' })).toBeVisible();
  await expect(page.getByTestId('rec-card')).toHaveCount(10);
}

const titles = (page: Page) => page.getByTestId('rec-card').getByRole('heading').allTextContents();

test('shows ten ideas by itself, with a score, reasons and where each number came from', async ({ page }) => {
  await openMix(page);
  const first = page.getByTestId('rec-card').first();
  await expect(first.getByLabel(/^Score \d+ out of 100$/)).toBeVisible();
  await expect(first.getByRole('list', { name: 'Score breakdown' })).toBeVisible();
  await expect(first.getByText('Scanned').first()).toBeVisible();
  await expect(first.getByText('Drafted').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use these games' }).first()).toBeEnabled();
});

test('"Use these games" opens a YAML that mixes both games', async ({ page }) => {
  await openMix(page);
  const heading = (await titles(page))[0]!;
  const [a, b] = heading.split(' + ') as [string, string];
  await page.getByTestId('rec-card').first().getByRole('button', { name: 'Use these games' }).click();
  await expect(page.locator('.yaml')).toContainText('game:');
  await expect(page.locator('.yaml')).toContainText(`${a}: 50`);
  await expect(page.locator('.yaml')).toContainText(`${b}: 50`);
  // The editor lets the person move between the two games.
  await expect(page.getByRole('combobox').filter({ hasText: a })).toBeVisible();
});

test('remembers dismissals and never shows the same ten again soon, across app starts', async ({ userData }) => {
  // This test starts its own apps so that the user-data folder can be reused.
  const first = await launch({ userData, env: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });
  let before: string[] = [];
  try {
    await openMix(first.page);
    before = await titles(first.page);
    await first.page.getByTestId('rec-card').first().getByRole('button', { name: 'Never show this pair' }).click();
    await expect(first.page.getByTestId('rec-card')).toHaveCount(10);
    await expect.poll(() => JSON.parse(readFileSync(join(userData, 'recommender.json'), 'utf8')).dismissed.length).toBe(1);
  } finally {
    await closeApp(first.app);
  }
  const saved = JSON.parse(readFileSync(join(userData, 'recommender.json'), 'utf8'));
  expect(saved.launches).toBe(1);

  const second = await launch({ userData, env: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });
  try {
    await openMix(second.page);
    const after = await titles(second.page);
    expect(after.filter((title) => before.includes(title))).toEqual([]);
    expect(JSON.parse(readFileSync(join(userData, 'recommender.json'), 'utf8')).launches).toBe(2);
  } finally {
    await closeApp(second.app);
  }
});

test('"What goes well with" ranks every partner for one game', async ({ page }) => {
  await openMix(page);
  await page.getByRole('combobox').selectOption('Hollow Knight');
  const list = page.getByRole('list', { name: 'Games that go well with Hollow Knight' });
  await expect(list.getByTestId('rec-card')).toHaveCount(30);
  await expect(list.getByTestId('rec-card').first().getByRole('heading')).toContainText('Hollow Knight');
});

test('the screen never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(180_000);
  await openMix(page);
  await page.getByRole('button', { name: 'Tune the scoring' }).click();
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
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(60);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
