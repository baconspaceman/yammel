import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// The app is started as a friend's machine would be: no Archipelago source folder to be found.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

const REAL_CLONE = join(process.cwd(), '..', 'archipelago-dev', 'Archipelago');

test('the editor is fully usable with nothing set up, and says what is missing instead of failing', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await expect(page.getByTestId('checks-value')).toHaveText('Unavailable', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Set up check counts' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText(/^Off\. The folder .* was not found\./)).toBeVisible();
  await expect(page.getByText(/Nothing on this page is required/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  // The open document is exactly as it was left.
  await expect(page.locator('article[data-key="extra_starting_chest"]')).toBeVisible();
});

test('writes no settings file until something is changed', async ({ page, userData }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect(existsSync(join(userData, 'settings.json'))).toBe(false);
});

test('the page cannot point settings at a folder or program it did not pick with the dialog', async ({ page, userData }) => {
  const result = await page.evaluate(() =>
    window.api.saveSettings({ archipelago: { sourceRoot: 'C:\\Windows\\System32', pythonPath: 'C:\\Windows\\System32\\cmd.exe' } }),
  );
  expect(result.ok).toBe(false);
  expect(existsSync(join(userData, 'settings.json'))).toBe(false);
  const secret = await page.evaluate(() =>
    (window.api.saveSettings as unknown as (p: unknown) => Promise<{ ok: boolean }>)({ integrations: { openRouter: { enabled: true } }, apiKey: 'sk-not-saved' }),
  );
  expect(secret.ok).toBe(true); // switching an extra on is allowed; an unknown field is simply dropped
  expect(readFileSync(join(userData, 'settings.json'), 'utf8')).not.toContain('sk-not-saved');
});

test('choosing the Archipelago folder turns the check count on without restarting', async ({ app, page, userData }) => {
  test.skip(!existsSync(REAL_CLONE), 'needs the Archipelago source clone next to this project');
  test.setTimeout(240_000);
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await expect(page.getByTestId('checks-value')).toHaveText('Unavailable', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Set up check counts' }).click();
  await answerOpenDialog(app, REAL_CLONE);
  await page.getByRole('button', { name: /Browse/ }).first().click();
  await expect(page.getByText(/^Ready\. Using /)).toBeVisible({ timeout: 10_000 });
  expect(JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).archipelago.sourceRoot).toBe(REAL_CLONE);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('checks-value')).toHaveText('6', { timeout: 120_000 });
});

test('Settings never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
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
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(8);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
