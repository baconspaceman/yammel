import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, generatorProcessCount, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// These tests run the REAL Archipelago generator (the source folder next to this project). Seeds go to a throwaway folder.
const SEEDS = mkdtempSync(join(tmpdir(), 'yamled-seeds-'));
test.use({ extraEnv: { ARCHIPELAGO_YAML_SEEDS: SEEDS } });

const GEN_MS = 120_000;
const openSeed = async (page: import('@playwright/test').Page) => {
  await page.getByRole('tab', { name: 'Seed' }).click();
  await expect(page.getByRole('region', { name: 'Make a seed' })).toBeVisible();
  await expect(page.getByText(/^Ready\. It will use/)).toBeVisible({ timeout: 20_000 });
};

test('Check it runs the real generator, says it works, and writes nothing', async ({ page }) => {
  test.setTimeout(240_000);
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await openSeed(page);
  const before = readdirSync(SEEDS).length;
  await page.getByRole('button', { name: 'Check it' }).click();
  await expect(page.getByText(/Checking… \d+s/)).toBeVisible();
  await expect(page.getByText('It generates.')).toBeVisible({ timeout: GEN_MS });
  expect(readdirSync(SEEDS).length).toBe(before);
});

test('Make the seed writes a real seed archive into a new folder and can show it', async ({ page }) => {
  test.setTimeout(240_000);
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await openSeed(page);
  await page.getByRole('button', { name: 'Make the seed' }).click();
  await expect(page.getByText(/^Seed made/)).toBeVisible({ timeout: GEN_MS });
  const folders = readdirSync(SEEDS);
  expect(folders.length).toBeGreaterThan(0);
  const made = readdirSync(join(SEEDS, folders[folders.length - 1]!));
  expect(made.some((file) => /^AP_.*\.zip$/.test(file))).toBe(true);
  await expect(page.getByRole('button', { name: 'Show in folder' })).toBeVisible();
});

test('a YAML Archipelago refuses is explained in plain lines, with the full log one click away', async ({ app, page }) => {
  test.setTimeout(240_000);
  const file = join(mkdtempSync(join(tmpdir(), 'yamled-badseed-')), 'bad.yaml');
  writeFileSync(file, 'name: Tester\ngame: APQuest\nAPQuest:\n  hard_mode: ture\n', 'utf8');
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await openSeed(page);
  await expect(page.getByText(/problem checker found 1 error/)).toBeVisible();
  await page.getByRole('button', { name: 'Check it' }).click();
  const bad = page.getByRole('alert').filter({ hasText: 'would not make a seed' });
  await expect(bad).toBeVisible({ timeout: GEN_MS });
  await expect(bad).toContainText('does not support a value of ture');
  await bad.getByRole('button', { name: 'Show the full log' }).click();
  await expect(page.getByLabel('Generator log')).toContainText('Traceback');
  // the same screen, laid out properly in both themes at small sizes and zoom
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

test('Stop ends the generator for real, not just on screen', async ({ page }) => {
  test.setTimeout(240_000);
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await openSeed(page);
  const before = generatorProcessCount();
  await page.getByRole('button', { name: 'Make the seed' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect.poll(() => generatorProcessCount(), { timeout: 20_000 }).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('It was stopped.')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => generatorProcessCount(), { timeout: 20_000, intervals: [500] }).toBe(before);
});

test('other players\' files can be added and left out again', async ({ app, page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await openSeed(page);
  const friend = join(mkdtempSync(join(tmpdir(), 'yamled-friend-')), 'friend.yaml');
  writeFileSync(friend, 'name: Friend\ngame: APQuest\nAPQuest: {}\n', 'utf8');
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, friend);
  await page.getByRole('button', { name: /Add other players/ }).click();
  const list = page.getByRole('list', { name: 'YAML files in this seed' });
  await expect(list).toContainText('friend.yaml');
  await list.getByRole('button', { name: 'Leave out friend.yaml' }).click();
  await expect(list).not.toContainText('friend.yaml');
  expect(existsSync(friend)).toBe(true); // the person's own file is never touched
});
