import { expect, test } from './fixtures';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkEverything } from './layoutCheck';
import { ROOT, setWindowSize, setZoom } from './helpers';

const SIZES = [
  { name: 'minimum', width: 900, height: 600 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'wide', width: 1920, height: 1080 },
];

// Games chosen from the real data: the most options, the longest description, the longest names.
const STRESS_GAMES = ['Ocarina of Time', 'Lufia II Ancient Cave', 'Sonic Adventure 2 Battle'];

const SHOTS = join(ROOT, 'test-results', 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

for (const scheme of ['light', 'dark'] as const) {
  test(`no overlapping or clipped text in ${scheme} mode`, async ({ app, page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();

    for (const size of SIZES) {
      await setWindowSize(app, size.width, size.height);
      await page.getByRole('button', { name: 'New' }).click().catch(() => undefined);

      await page.screenshot({ path: join(SHOTS, `${scheme}-${size.name}-start.png`) });
      const startReport = await checkEverything(page);
      expect(startReport.textBoxes, 'start screen text measured').toBeGreaterThan(20);
      expect(startReport.problems, `start screen at ${size.name}`).toEqual([]);

      for (const game of STRESS_GAMES) {
        await page.getByRole('button', { name: new RegExp(`^${game}`) }).click();
        await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
        // Open every group so all of the game's cards are on the page.
        for (const toggle of await page.locator('.group__title button[aria-expanded="false"]').all()) await toggle.click();

        await page.screenshot({ path: join(SHOTS, `${scheme}-${size.name}-${slug(game)}.png`) });
        const report = await checkEverything(page);
        expect(report.textBoxes, `${game} text measured`).toBeGreaterThan(50);
        expect(report.problems, `${game} at ${size.name} (${scheme})`).toEqual([]);

        await page.getByRole('button', { name: 'New' }).click();
        await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
      }
    }
  });
}

// A window that is 900 wide at 150% zoom is laid out like a 600 px wide window.
for (const zoom of [1.25, 1.5, 2]) {
  test(`no overlapping or clipped text at ${zoom * 100}% zoom`, async ({ app, page }) => {
    test.setTimeout(240_000);
    await setZoom(app, zoom);
    for (const size of SIZES.slice(0, 2)) {
      await setWindowSize(app, size.width, size.height);
      await page.getByRole('button', { name: 'New' }).click().catch(() => undefined);
      const startReport = await checkEverything(page);
      expect(startReport.problems, `start screen at ${size.name}, ${zoom * 100}%`).toEqual([]);

      await page.getByRole('button', { name: /^Ocarina of Time/ }).click();
      await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
      for (const toggle of await page.locator('.group__title button[aria-expanded="false"]').all()) await toggle.click();
      await page.screenshot({ path: join(SHOTS, `zoom-${zoom * 100}-${size.name}-ocarina.png`) });
      const report = await checkEverything(page);
      expect(report.textBoxes).toBeGreaterThan(20);
      expect(report.problems, `Ocarina of Time at ${size.name}, ${zoom * 100}%`).toEqual([]);
      await page.getByRole('button', { name: 'New' }).click();
    }
  });
}
