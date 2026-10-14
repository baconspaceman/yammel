import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// Nothing here sends anything to a real AI service: switching a helper on and saving a key never makes a request.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

const KEY = 'sk-or-test-key-1234567890';

test('every AI helper is off by default, and the Helper still works without any', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const section = page.getByRole('region', { name: 'Optional AI helpers' }).or(page.locator('section[aria-labelledby="settings-extras"]'));
  await expect(section).toContainText('already works on its own, for free');
  for (const name of ['Claude Code', 'Codex', 'OpenRouter']) {
    await expect(page.getByRole('group', { name }).getByRole('checkbox')).not.toBeChecked();
  }
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('button', { name: 'Helper', exact: true }).click();
  // Only the built-in guide is offered.
  const options = await page.getByLabel('Who answers').locator('option').allTextContents();
  expect(options).toEqual(['Built-in guide']);
});

test('turning a helper on asks first, and saves nothing if the answer is no', async ({ page, userData }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  let asked = '';
  page.once('dialog', async (dialog) => {
    asked = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole('group', { name: 'OpenRouter' }).getByRole('checkbox').check({ force: true }).catch(() => undefined);
  await expect.poll(() => asked).toContain('your current YAML');
  expect(asked).toContain('charges your own account');
  await expect(page.getByRole('group', { name: 'OpenRouter' }).getByRole('checkbox')).not.toBeChecked();
  expect(existsSync(join(userData, 'settings.json'))).toBe(false);
});

test('a saved OpenRouter key is encrypted on disk, never shown again, and makes the helper selectable', async ({ page, userData }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  page.on('dialog', (dialog) => void dialog.accept());
  const card = page.getByRole('group', { name: 'OpenRouter' });
  await card.getByRole('checkbox').click(); // saved a moment later, so it is not checked at once
  await expect(card.getByRole('checkbox')).toBeChecked();
  await expect(card.getByText(/Switched on, but not ready yet/)).toBeVisible();
  await card.getByLabel('OpenRouter key').fill(KEY);
  await card.getByRole('button', { name: 'Save key' }).click();
  await expect(card.getByText(/A key is saved/)).toBeVisible();
  await expect(card.getByLabel('OpenRouter key')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText(KEY);

  const settings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
  expect(settings.integrations.openRouter.enabled).toBe(true);
  expect(readFileSync(join(userData, 'settings.json'), 'utf8')).not.toContain(KEY);
  const secrets = readFileSync(join(userData, 'secrets.json'), 'utf8');
  expect(secrets).not.toContain(KEY);
  expect(secrets).toContain('openRouter');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await page.getByRole('button', { name: 'Helper', exact: true }).click();
  const options = await page.getByLabel('Who answers').locator('option').allTextContents();
  expect(options).toEqual(['Built-in guide', 'OpenRouter']);

  // Removing the key switches it off in practice.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'OpenRouter' }).getByRole('button', { name: 'Remove key' }).click();
  await expect(page.getByRole('group', { name: 'OpenRouter' }).getByText(/Needs your own OpenRouter key/)).toBeVisible();
});

test('the page can never read a key back, whatever it asks', async ({ page }) => {
  await page.evaluate((key) => window.api.setOpenRouterKey(key), KEY);
  const status = await page.evaluate(() => window.api.helperStatus());
  expect(JSON.stringify(status)).not.toContain(KEY);
  const refused = await page.evaluate(() => (window.api.askHelper as unknown as (r: unknown) => Promise<{ ok: boolean; message?: string }>)({ helperId: 'openRouter', prompt: 'hi' }));
  expect(refused.ok).toBe(false); // switched off, so nothing is sent
  expect(refused.message).toContain('switched off');
  const unknown = await page.evaluate(() => (window.api.askHelper as unknown as (r: unknown) => Promise<{ ok: boolean; message?: string }>)({ helperId: 'evil', prompt: 'hi' }));
  expect(unknown.message).toBe('That helper is not known.');
  const badKey = await page.evaluate(() => (window.api.setOpenRouterKey as unknown as (k: unknown) => Promise<{ ok: boolean }>)('has spaces in it'));
  expect(badKey.ok).toBe(false);
});

test('the settings page with the AI helpers never overlaps or clips text', async ({ app, page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('group', { name: 'OpenRouter' })).toBeVisible();
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
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(15);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
