import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);

/** Finds an option by searching for it, which also opens whichever group it is in. */
const find = async (page: Page, words: string) => {
  await page.getByRole('searchbox', { name: /Search options/ }).fill(words);
};

test('weighted values: switch to weights, change one, and the YAML and checker agree', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  const hard = card(page, 'hard_mode');
  await hard.getByRole('combobox', { name: 'How Hard Mode is decided' }).selectOption('weighted');
  const editor = hard.getByRole('group', { name: 'Weighted values for Hard Mode' });
  await expect(editor).toBeVisible();
  await expect(editor.getByText('On', { exact: true })).toBeVisible();
  await expect(page.locator('.yaml')).toContainText('hard_mode:');
  await expect(page.locator('.yaml')).toContainText('true: 50');
  const box = editor.getByRole('textbox', { name: 'Hard Mode: weight of On' });
  await box.fill('150');
  await box.press('Enter');
  await expect(page.locator('.yaml')).toContainText('true: 150');
  await expect(editor.getByLabel('75 percent')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Problems' })).toContainText('No problems found');
  // Back to a single value keeps the heaviest one.
  await hard.getByRole('combobox', { name: 'How Hard Mode is decided' }).selectOption('fixed');
  await expect(page.locator('.yaml')).toContainText('hard_mode: true');
  await expect(hard.getByRole('switch')).toBeChecked();
  // Undo steps back through the changes one at a time.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(editor).toBeVisible();
});

test('a number can be weighted too, with only numbers inside its range', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  const chance = card(page, 'trap_chance');
  await chance.getByRole('combobox', { name: 'How Trap Chance is decided' }).selectOption('weighted');
  const editor = chance.getByRole('group', { name: 'Weighted values for Trap Chance' });
  await editor.getByRole('textbox', { name: 'Add a number to Trap Chance' }).fill('500');
  await editor.getByRole('textbox', { name: 'Add a number to Trap Chance' }).press('Enter');
  await expect(editor.getByRole('alert')).toContainText('Must be between');
  await editor.getByRole('textbox', { name: 'Add a number to Trap Chance' }).fill('40');
  await editor.getByRole('textbox', { name: 'Add a number to Trap Chance' }).press('Enter');
  await expect(page.locator('.yaml')).toContainText('40: 50');
  await expect(page.getByRole('region', { name: 'Problems' })).toContainText('No problems found');
});

test('item lists: search, add, count, remove, and the checker accepts the names', async ({ page }) => {
  await page.getByRole('button', { name: /^A Link to the Past/ }).click();
  await find(page, 'local items');
  const local = card(page, 'local_items');
  await local.getByRole('textbox', { name: 'Add to Local Items' }).fill('hookshot');
  await local.getByRole('list', { name: 'Matching names for Local Items' }).getByRole('button', { name: 'Hookshot' }).click();
  await expect(page.locator('.yaml')).toContainText('local_items');
  await expect(page.locator('.yaml')).toContainText('Hookshot');
  await expect(local.getByText('1 chosen')).toBeVisible();

  await find(page, 'start inventory');
  const inventory = card(page, 'start_inventory');
  await inventory.getByRole('textbox', { name: 'Add to Start Inventory' }).fill('Bombos');
  await inventory.getByRole('textbox', { name: 'Add to Start Inventory' }).press('Enter');
  const count = inventory.getByRole('textbox', { name: 'Start Inventory: how many Bombos' });
  await count.fill('2');
  await count.press('Enter');
  await expect(page.locator('.yaml')).toContainText('Bombos: 2');
  await expect(page.getByRole('region', { name: 'Problems' })).toContainText('No problems found');

  await find(page, 'local items');
  await local.getByRole('button', { name: 'Remove Hookshot from Local Items' }).click();
  await expect(page.locator('.yaml')).not.toContainText('local_items');
});

test('a made-up item name is refused', async ({ page }) => {
  await page.getByRole('button', { name: /^A Link to the Past/ }).click();
  await find(page, 'local items');
  const local = card(page, 'local_items');
  await local.getByRole('textbox', { name: 'Add to Local Items' }).fill('Banana Sword');
  await local.getByRole('textbox', { name: 'Add to Local Items' }).press('Enter');
  await expect(local.getByRole('alert')).toContainText('not a name in this game');
  await expect(page.locator('.yaml')).not.toContainText('Banana');
});

test('the raw tab edits the whole text, with undo, and refuses text that is not a YAML', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('tab', { name: 'Raw' }).click();
  const raw = page.getByRole('textbox', { name: 'Raw YAML text' });
  const original = await raw.inputValue();
  await raw.fill(`# my notes\n${original}`);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('tab', { name: 'YAML' }).click();
  await expect(page.locator('.yaml')).toContainText('# my notes');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.yaml')).not.toContainText('# my notes');

  await page.getByRole('tab', { name: 'Raw' }).click();
  await raw.fill('name: [unclosed');
  await expect(page.getByRole('list', { name: 'Problems in this text' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await page.getByRole('button', { name: 'Revert' }).click();
  await expect(raw).toHaveValue(original);
});

test('mixing games: add a second game, set the odds, and the editor can switch between them', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('button', { name: 'Mix with another game' }).click();
  await page.getByRole('combobox', { name: 'Add a game' }).selectOption('A Hat in Time');
  await expect(page.locator('.yaml')).toContainText('APQuest: 50');
  await expect(page.locator('.yaml')).toContainText('A Hat in Time: 50');
  const box = page.getByRole('textbox', { name: 'Weight of APQuest' });
  await box.fill('150');
  await box.press('Enter');
  await expect(page.getByLabel('75 percent')).toBeVisible();
  await page.locator('#meta-game').selectOption('A Hat in Time');
  await expect(page.getByPlaceholder('Search options in A Hat in Time')).toBeVisible();
  await page.getByRole('button', { name: 'Remove A Hat in Time' }).click();
  await expect(page.locator('.yaml')).not.toContainText('A Hat in Time');
});

test('the advanced editors never overlap or clip text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(240_000);
  await page.getByRole('button', { name: /^A Link to the Past/ }).click();
  await find(page, 'swordless');
  await card(page, 'swordless').getByRole('combobox', { name: 'How Swordless is decided' }).selectOption('weighted');
  await find(page, 'local items');
  const local = card(page, 'local_items');
  await local.getByRole('textbox', { name: 'Add to Local Items' }).fill('Hookshot');
  await local.getByRole('textbox', { name: 'Add to Local Items' }).press('Enter');
  await local.getByRole('textbox', { name: 'Add to Local Items' }).fill('bo');
  await page.getByRole('button', { name: 'Mix with another game' }).click();
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
