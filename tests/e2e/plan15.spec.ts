import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, closeApp, launch } from './helpers';

// Playwright pretends the computer is in light mode unless told otherwise; these tests are about the app's own setting.
const followRealSetting = (page: import('@playwright/test').Page) => page.emulateMedia({ colorScheme: null });
const isDark = (page: import('@playwright/test').Page) => page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
const pageColor = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const file = (text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'yamled-p15-')), 'demo.yaml');
  writeFileSync(path, text, 'utf8');
  return path;
};
const LTTP = 'name: Anthony\ngame: A Link to the Past\nA Link to the Past:\n  mode: open\n  item_pool: normal\n';

test('the look can be set to light or dark in Settings, restyles the whole app at once, and is remembered', async ({ page, userData }) => {
  await followRealSetting(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const group = page.getByRole('radiogroup', { name: 'Appearance' });
  await expect(group.getByLabel('Same as my computer')).toBeChecked();

  await group.getByLabel('Dark').click();
  await expect.poll(() => isDark(page)).toBe(true);
  const dark = await pageColor(page);

  await group.getByLabel('Light').click();
  await expect.poll(() => isDark(page)).toBe(false);
  const light = await pageColor(page);
  expect(light).not.toBe(dark);
  await expect.poll(() => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).appearance.theme).toBe('light');
});

test('the toolbar button steps through Auto, Light and Dark', async ({ app, page, userData }) => {
  await followRealSetting(page);
  await answerOpenDialog(app, file(LTTP));
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  const button = page.getByRole('button', { name: /^Look: / });
  await expect(button).toHaveText('Auto');
  await button.click();
  await expect(button).toHaveText('Light');
  await expect.poll(() => isDark(page)).toBe(false);
  await button.click();
  await expect(button).toHaveText('Dark');
  await expect.poll(() => isDark(page)).toBe(true);
  await button.click();
  await expect(button).toHaveText('Auto');
  await expect.poll(() => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).appearance.theme).toBe('system');
});

test('a saved look is used from the very start, and a damaged value falls back to the computer\'s setting', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'yamled-ud-'));
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ version: 1, appearance: { theme: 'dark' } }));
  const first = await launch({ userData });
  try {
    await followRealSetting(first.page);
    await expect.poll(() => isDark(first.page)).toBe(true);
  } finally {
    await closeApp(first.app);
  }
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ version: 1, appearance: { theme: 'purple' } }));
  const second = await launch({ userData });
  try {
    await second.page.getByRole('button', { name: 'Settings' }).click();
    await expect(second.page.getByRole('radiogroup', { name: 'Appearance' }).getByLabel('Same as my computer')).toBeChecked();
  } finally {
    await closeApp(second.app);
  }
});

test('aim for a difficulty: drag to a target, see the changes first, apply them as one undo step', async ({ app, page }) => {
  await answerOpenDialog(app, file(LTTP));
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.getByTestId('difficulty-value')).toBeVisible();
  const score = async () => Number(await page.getByTestId('difficulty-value').textContent());
  const before = await score();
  await page.getByRole('button', { name: 'Aim for a difficulty' }).click();
  const slider = page.getByRole('slider', { name: 'Drag to the difficulty you want' });
  await slider.fill('8');
  await expect(page.getByRole('region', { name: 'Aim for a difficulty' }).locator('output')).toContainText('8.0');
  await page.getByRole('button', { name: 'Show the changes' }).click();
  const result = page.getByTestId('aim-result');
  await expect(result).toContainText('This moves it from');
  // nothing has changed yet
  expect(await score()).toBe(before);
  await page.getByRole('button', { name: 'Apply these changes' }).click();
  await expect(page.getByRole('region', { name: 'Aim for a difficulty' })).toHaveCount(0);
  await expect.poll(score).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(score).toBe(before);
});

test('aim for a difficulty: aiming at where it already is says so, and a game with no rating does not offer it', async ({ app, page }) => {
  await answerOpenDialog(app, file(LTTP));
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await page.getByRole('button', { name: 'Aim for a difficulty' }).click();
  await page.getByRole('button', { name: 'Show the changes' }).click(); // the slider starts at the current value
  await expect(page.getByTestId('aim-result')).toContainText('about where it is now');

  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('button', { name: /^Stardew Valley/ }).click();
  await expect(page.getByTestId('difficulty-value')).toHaveText('Not rated');
  await expect(page.getByRole('button', { name: 'Aim for a difficulty' })).toHaveCount(0);
});
