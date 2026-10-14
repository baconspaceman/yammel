import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the packaged app (npm run dist:dir first). Skipped when there is no build, so the normal test run is unaffected.
const EXE = join(process.cwd(), 'dist', 'win-unpacked', 'Yammel.exe');
const CLONE = join(process.cwd(), '..', 'archipelago-dev', 'Archipelago');

test.skip(!existsSync(EXE), 'no packaged build: run npm run dist:dir first');

test('the packaged app starts, has all its games, and its Python engine runs from inside the package', async () => {
  test.setTimeout(120_000);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  if (existsSync(CLONE)) env['ARCHIPELAGO_AP_ROOT'] = CLONE;
  const app = await electron.launch({ executablePath: EXE, args: [`--user-data-dir=${mkdtempSync(join(tmpdir(), 'yamled-packaged-'))}`], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible({ timeout: 30_000 });
    // the data file travelled with the app: a game list, and a game's option cards
    await expect(page.getByRole('list', { name: 'Games' }).getByRole('button')).not.toHaveCount(0);
    await page.getByRole('button', { name: /^APQuest/ }).click();
    await expect(page.locator('article[data-key="hard_mode"]')).toBeVisible();
    // the difficulty profiles travelled too
    await expect(page.getByTestId('difficulty-value')).toBeVisible();
    // the engine script ran from the package (needs an Archipelago source folder, as always)
    if (existsSync(CLONE)) await expect(page.getByTestId('checks-value')).toHaveText(/^\d+$/, { timeout: 90_000 });
    // the icon file is in the package
    expect(existsSync(join(process.cwd(), 'dist', 'win-unpacked', 'resources', 'app', 'assets', 'icon', 'icon-256.png'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'dist', 'win-unpacked', 'resources', 'app', 'engine', 'seed_engine.py'))).toBe(true);
  } finally {
    await app.close().catch(() => undefined);
  }
});
