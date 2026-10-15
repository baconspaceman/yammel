import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

const open = async (page: Page, game: RegExp) => {
  await page.getByRole('button', { name: game }).click();
  await page.getByRole('tab', { name: 'Plando' }).click();
  await expect(page.getByRole('heading', { name: 'Plando', exact: true })).toBeVisible();
};
const rawText = async (page: Page) => {
  await page.getByRole('tab', { name: 'Raw' }).click();
  return page.getByRole('textbox', { name: 'Raw YAML text' });
};

test('place an item at a location, see it in the YAML, and undo it', async ({ page }) => {
  await open(page, /^APQuest/);
  await expect(page.getByText('No placements yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add an item placement' }).click();
  const card = page.getByRole('listitem', { name: 'Placement 1' });
  await card.getByRole('textbox', { name: 'Add to Items' }).fill('Sword');
  await card.getByRole('textbox', { name: 'Add to Items' }).press('Enter');
  await card.getByRole('textbox', { name: 'Add to Locations' }).fill('Bottom Left Chest');
  await card.getByRole('textbox', { name: 'Add to Locations' }).press('Enter');
  await expect(card.getByText('Sword', { exact: true })).toBeVisible();
  // A placement that is complete and valid has no problems listed.
  await expect(page.getByRole('list', { name: /Problems with/ })).toHaveCount(0);

  const raw = await rawText(page);
  await expect(raw).toHaveValue(/plando_items:/);
  await expect(raw).toHaveValue(/item: Sword/);
  await expect(raw).toHaveValue(/location: Bottom Left Chest/);

  await page.getByRole('tab', { name: 'Plando' }).click();
  await card.getByLabel('If it goes wrong').selectOption('true');
  await page.getByRole('tab', { name: 'Raw' }).click();
  await expect(raw).toHaveValue(/force: true/);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(raw).not.toHaveValue(/force: true/);
});

test('a wrong item name is listed with a fix that works', async ({ page }) => {
  await open(page, /^APQuest/);
  await page.getByRole('button', { name: 'Add an item placement' }).click();
  const raw = await rawText(page);
  const text = await raw.inputValue();
  await raw.fill(text.replace('items: []', 'item: Swrod'));
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('tab', { name: 'Plando' }).click();
  const problems = page.getByRole('list', { name: 'Problems with Plando Items' });
  await expect(problems).toContainText('not an item');
  await problems.getByRole('button', { name: 'Use "Sword"' }).click();
  await expect(page.getByRole('list', { name: 'Problems with Plando Items' })).toHaveCount(0);
});

test('connection plando offers the game\'s real names', async ({ page }) => {
  await open(page, /^A Link to the Past/);
  await page.getByRole('button', { name: 'Add a connection' }).click();
  const card = page.getByRole('listitem', { name: 'Connection 1' });
  await card.getByLabel('Entrance').fill('Sanctuary');
  await card.getByLabel('Entrance').press('Enter');
  await card.getByLabel('Exit').fill('Hyrule Castle Entrance (South)');
  await card.getByLabel('Exit').press('Enter');
  const raw = await rawText(page);
  await expect(raw).toHaveValue(/plando_connections:/);
  await expect(raw).toHaveValue(/entrance: Sanctuary/);
  await expect(raw).toHaveValue(/exit: Hyrule Castle Entrance \(South\)/);
  await page.getByRole('tab', { name: 'Plando' }).click();
  await expect(page.getByRole('list', { name: /Problems with/ })).toHaveCount(0);
});

test('the Plando tab never overlaps or clips text, in both themes, small windows and zoom', async ({ page, app }) => {
  await open(page, /^APQuest/);
  await page.getByRole('button', { name: 'Add an item placement' }).click();
  const card = page.getByRole('listitem', { name: 'Placement 1' });
  await card.getByRole('textbox', { name: 'Add to Items' }).fill('Sword');
  await card.getByRole('textbox', { name: 'Add to Items' }).press('Enter');
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
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
