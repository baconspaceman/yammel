import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// The validator needs no engine, so none is provided.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

const BAD = [
  'name: ABCDEFGHIJKLMNOPQRSTUV',
  'game: APQuest',
  'APQuest:',
  '  extra_starting_chest: ture',
  '  hardmode: true',
  '',
].join('\n');

async function openBad(page: import('@playwright/test').Page, app: import('@playwright/test').ElectronApplication) {
  const file = join(mkdtempSync(join(tmpdir(), 'yamled-validate-')), 'bad.yaml');
  writeFileSync(file, BAD, 'utf8');
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Problems' })).toBeVisible();
}

test('a new YAML has no problems and says so', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await expect(page.getByRole('region', { name: 'Problems' })).toContainText('No problems found');
});

test('problems are listed, shown on the option, and fixed one click at a time with undo', async ({ app, page }) => {
  await openBad(page, app);
  const bar = page.getByRole('region', { name: 'Problems' });
  await expect(bar).toContainText('1 error and 2 warnings');
  // The option card carries its own message and fix.
  const card = page.locator('article[data-key="extra_starting_chest"]');
  await expect(card).toContainText('"ture" is not on or off');
  await card.getByRole('button', { name: 'Use true' }).click();
  await expect(page.locator('.yaml')).toContainText('extra_starting_chest: true');
  await expect(bar).toContainText('2 warnings');
  // Undo brings the problem back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(bar).toContainText('1 error and 2 warnings');
});

test('"Apply the suggested fixes" clears everything in one undo step', async ({ app, page }) => {
  await openBad(page, app);
  await page.getByRole('button', { name: /Apply the suggested fixes/ }).click();
  const bar = page.getByRole('region', { name: 'Problems' });
  await expect(bar).toContainText('No problems found');
  await expect(page.locator('.yaml')).toContainText('extra_starting_chest: true');
  await expect(page.locator('.yaml')).not.toContainText('hardmode');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(bar).toContainText('1 error and 2 warnings');
});

test('"Show the option" jumps to the option', async ({ app, page }) => {
  await openBad(page, app);
  await page.getByRole('button', { name: 'Show the list' }).click();
  await page.getByRole('list', { name: 'Problems found' }).getByRole('button', { name: 'Show the option' }).first().click();
  await expect(page.locator('article[data-key="extra_starting_chest"]')).toBeInViewport();
});

test('the problem list never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(180_000);
  await openBad(page, app);
  await page.getByRole('button', { name: 'Show the list' }).click();
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
