import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

const openTriggers = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('tab', { name: 'Triggers' }).click();
  await expect(page.getByRole('heading', { name: 'Triggers' })).toBeVisible();
};
const yaml = (page: import('@playwright/test').Page) => page.getByRole('tab', { name: 'Raw' });

test('add a trigger, change its parts, and see it in the YAML; undo takes it back', async ({ page }) => {
  await openTriggers(page);
  await expect(page.getByText('No triggers yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a trigger' }).click();
  const card = page.getByRole('listitem', { name: 'Trigger 1' });
  await expect(card).toBeVisible();

  await page.getByRole('button', { name: 'Add a change to trigger 1' }).click();
  await expect(card.getByRole('button', { name: 'Remove change 1 from trigger 1' })).toBeVisible();

  // The same YAML shows in the Raw tab.
  await yaml(page).click();
  const raw = page.getByRole('textbox', { name: 'Raw YAML text' });
  await expect(raw).toHaveValue(/triggers:/);
  await expect(raw).toHaveValue(/option_category: APQuest/);
  await expect(raw).toHaveValue(/option_name: /);
  await expect(raw).toHaveValue(/options:/);

  await page.getByRole('tab', { name: 'Triggers' }).click();
  await page.getByRole('button', { name: 'Undo' }).click(); // the change
  await page.getByRole('button', { name: 'Undo' }).click(); // the trigger
  await expect(page.getByText('No triggers yet.')).toBeVisible();
});

test('a problem with a trigger is listed with a fix button that works', async ({ page }) => {
  await openTriggers(page);
  await page.getByRole('button', { name: 'Add a trigger' }).click();
  // Make the trigger wait for a value the watched option never has.
  await yaml(page).click();
  const raw = page.getByRole('textbox', { name: 'Raw YAML text' });
  const text = await raw.inputValue();
  const broken = text.replace(/option_result: .*/, 'option_result: definitely-not-a-value');
  await raw.fill(broken);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('tab', { name: 'Triggers' }).click();
  const list = page.getByRole('list', { name: 'Problems with the triggers' });
  await expect(list).toContainText('never fire');
  await list.getByRole('button', { name: /^Wait for / }).first().click();
  await expect(page.getByRole('list', { name: 'Problems with the triggers' })).toHaveCount(0);
});

test('the Triggers tab never overlaps or clips text, in both themes, small windows and zoom', async ({ page, app }) => {
  await openTriggers(page);
  await page.getByRole('button', { name: 'Add a trigger' }).click();
  await page.getByRole('button', { name: 'Add a change to trigger 1' }).click();
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
