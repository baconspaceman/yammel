import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, closeApp, launch, MINI_SCHEMA, seedEngineProcessCount } from './helpers';

// These tests use the REAL seed engine (Python, from the Archipelago source folder next to this project,
// or ARCHIPELAGO_AP_ROOT). APQuest is small: 6 checks by default, 7 with "Extra Starting Chest".

const FIRST_COUNT_MS = 120_000; // the engine loads every world on its first request

test.describe('live check count (real engine)', () => {
  test('shows the count, updates it as options change, and shows the default for comparison', async ({ page }) => {
    test.setTimeout(240_000);
    await page.getByRole('button', { name: /^APQuest/ }).click();
    const value = page.getByTestId('checks-value');
    await expect(value).toHaveText('6', { timeout: FIRST_COUNT_MS });
    await expect(value).toHaveAttribute('data-stale', 'false');
    await expect(page.getByText(/^default \d+/)).toHaveCount(0); // equal to the default: nothing to compare

    await page.locator('article[data-key="extra_starting_chest"]').getByRole('switch').click();
    await expect(value).toHaveText('7', { timeout: 30_000 });
    await expect(page.getByText('default 6 (+1)')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(value).toHaveText('6');
    await expect(page.getByText(/^default \d+/)).toHaveCount(0);
  });

  test('a bigger game counts too, and a option that removes checks lowers the number', async ({ page }) => {
    test.setTimeout(240_000);
    await page.getByRole('button', { name: /^A Hat in Time/ }).click();
    const value = page.getByTestId('checks-value');
    await expect(value).toHaveText('223', { timeout: FIRST_COUNT_MS });
    await page.locator('article[data-key="ShuffleStorybookPages"]').getByRole('switch').click();
    await expect(value).toHaveText('195', { timeout: 30_000 });
    await expect(page.getByText('default 223 (−28)')).toBeVisible();
  });

  test('random and weighted settings are counted at their defaults, and the meter says so', async ({ app, page }) => {
    test.setTimeout(240_000);
    const file = join(mkdtempSync(join(tmpdir(), 'yamled-meter-')), 'random.yaml');
    writeFileSync(
      file,
      'name: P\ngame: APQuest\nAPQuest:\n  extra_starting_chest: random\n  hard_mode:\n    true: 50\n    false: 50\n',
      'utf8',
    );
    await answerOpenDialog(app, file);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByTestId('checks-value')).toHaveText('6', { timeout: FIRST_COUNT_MS });
    await expect(page.getByText(/counted at their defaults: extra_starting_chest, hard_mode/)).toBeVisible();
  });
});

test.describe('the engine is started on demand and stopped when idle', () => {
  test.use({ extraEnv: { ARCHIPELAGO_ENGINE_IDLE_MS: '2500' } });

  test('no Python process until a count is needed, one while counting, none again after a quiet spell', async ({ page }) => {
    test.setTimeout(300_000);
    const before = seedEngineProcessCount();
    await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
    expect(seedEngineProcessCount()).toBe(before); // the start screen needs no engine

    await page.getByRole('button', { name: /^APQuest/ }).click();
    await expect(page.getByTestId('checks-value')).toHaveText('6', { timeout: FIRST_COUNT_MS });
    expect(seedEngineProcessCount()).toBeGreaterThan(before);

    await expect.poll(() => seedEngineProcessCount(), { timeout: 30_000, intervals: [1000] }).toBe(before); // idle: stopped

    await page.locator('article[data-key="extra_starting_chest"]').getByRole('switch').click();
    await expect(page.getByTestId('checks-value')).toHaveText('7', { timeout: FIRST_COUNT_MS }); // started again on demand
  });
});

test('closing the app never leaves the engine running', async () => {
  test.setTimeout(240_000);
  const before = seedEngineProcessCount();
  const { app, page } = await launch();
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await expect(page.getByTestId('checks-value')).toHaveText('6', { timeout: FIRST_COUNT_MS });
  expect(seedEngineProcessCount()).toBeGreaterThan(before);
  await closeApp(app);
  await expect.poll(() => seedEngineProcessCount(), { timeout: 20_000, intervals: [500] }).toBe(before);
});

test.describe('when no engine can run here', () => {
  test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

  test('says so plainly, shows no number, and editing keeps working', async ({ page }) => {
    await page.getByRole('button', { name: /^APQuest/ }).click();
    await expect(page.getByTestId('checks-value')).toHaveText('Unavailable', { timeout: 20_000 });
    await expect(page.getByText(/The folder .* was not found/)).toBeVisible();

    await page.locator('article[data-key="extra_starting_chest"]').getByRole('switch').click();
    await expect(page.locator('.yaml')).toContainText('extra_starting_chest: true');
    await expect(page.getByTestId('checks-value')).toHaveText('Unavailable');
  });
});

test.describe('a game the installed Archipelago does not have', () => {
  test.use({ schema: MINI_SCHEMA });

  test('explains that the engine does not know it, without inventing a number', async ({ page }) => {
    test.setTimeout(240_000);
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await expect(page.getByText('The seed engine does not know the game "Demo Game".')).toBeVisible({ timeout: FIRST_COUNT_MS });
    await expect(page.getByTestId('checks-value')).toHaveText('Unavailable');
  });
});
