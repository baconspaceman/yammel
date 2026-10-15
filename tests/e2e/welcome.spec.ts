import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { checkEverything } from './layoutCheck';

// The first-run card is switched off for every other test; here it is switched back on.
test.use({ extraEnv: { YAMMEL_SKIP_WELCOME: '0' } });

test('a first run shows the welcome card once, and closing it is remembered', async ({ page, userData }) => {
  const card = page.getByRole('dialog', { name: 'Welcome to Yammel' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('listitem')).toHaveCount(4);
  await expect(card.getByRole('button', { name: 'Got it' })).toBeFocused();
  const report = await checkEverything(page);
  expect(report.problems).toEqual([]);
  expect(existsSync(join(userData, 'settings.json'))).toBe(false); // showing it saves nothing

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect.poll(() => existsSync(join(userData, 'settings.json'))).toBe(true);
  expect(JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).welcome.seen).toBe(true);

  // The start screen works underneath.
  await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
});

test('Settings can bring the card back', async ({ page }) => {
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Show the welcome card again' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Yammel' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeHidden();
});
