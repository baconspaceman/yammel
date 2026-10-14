import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { auditAccessibility, auditKeyboard } from './a11yCheck';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// A pretend installed Archipelago (so the host.yaml screen has a file) and a demo YAML. The real host.yaml is never in reach.
const PROGRAM_DATA = mkdtempSync(join(tmpdir(), 'yamled-allscreens-'));
mkdirSync(join(PROGRAM_DATA, 'Archipelago'), { recursive: true });
writeFileSync(join(PROGRAM_DATA, 'Archipelago', 'ArchipelagoLauncher.exe'), 'x');
const SAMPLE_HOST = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'host-sample.yaml'), 'utf8').replace(/\r?\n/g, '\r\n');
writeFileSync(join(PROGRAM_DATA, 'Archipelago', 'host.yaml'), SAMPLE_HOST, 'utf8');
test.use({ extraEnv: { ProgramData: PROGRAM_DATA } });



const LTTP = 'name: Anthony\ngame: A Link to the Past\nA Link to the Past:\n  mode: open\n  item_pool: hard\n  goal: ganoon\n  death_link: ture\n';
const TWO = 'name: A\ngame: A Link to the Past\nA Link to the Past: {}\n---\nname: B\ngame: Super Metroid\nSuper Metroid: {}\n';
const file = (name: string, text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'yamled-screen-')), name);
  writeFileSync(path, text, 'utf8');
  return path;
};

type Go = (page: Page, app: ElectronApplication) => Promise<void>;
const openEditor: Go = async (page, app) => {
  await answerOpenDialog(app, file('demo.yaml', LTTP));
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.locator('article[data-key="goal"]')).toBeVisible();
};
const sideTab = (name: string): Go => async (page, app) => {
  await openEditor(page, app);
  await page.getByRole('tab', { name, exact: true }).click();
};

const SCREENS: { name: string; go: Go }[] = [
  { name: 'start screen', go: async (page) => void (await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible()) },
  { name: 'editor with problems', go: openEditor },
  { name: 'editor, YAML tab', go: sideTab('YAML') },
  { name: 'editor, Helper tab', go: sideTab('Helper') },
  { name: 'editor, Raw tab', go: sideTab('Raw') },
  { name: 'editor, Presets tab', go: sideTab('Presets') },
  { name: 'editor, Seed tab', go: sideTab('Seed') },
  {
    name: 'editor with Randomize open',
    go: async (page, app) => {
      await openEditor(page, app);
      await page.getByRole('button', { name: /^Randomize…/ }).click();
    },
  },
  {
    name: 'editor with the difficulty details and the aim slider open',
    go: async (page, app) => {
      await openEditor(page, app);
      await page.getByRole('button', { name: 'Why this number?' }).click();
      await page.getByRole('button', { name: 'Aim for a difficulty' }).click();
      await page.getByRole('button', { name: 'Show the changes' }).click();
    },
  },
  {
    name: 'settings',
    go: async (page) => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    },
  },
  {
    name: 'host.yaml settings',
    go: async (page) => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('button', { name: 'Open host.yaml settings' }).click();
      await expect(page.getByRole('heading', { name: /own settings/ })).toBeVisible();
    },
  },
  {
    name: 'game roulette',
    go: async (page) => {
      await page.getByRole('button', { name: 'Game roulette' }).click();
      await page.getByRole('button', { name: 'Spin' }).click();
      await expect(page.getByText('Spinning…')).toHaveCount(0, { timeout: 30_000 });
    },
  },
  {
    name: 'games to mix',
    go: async (page) => {
      await page.getByRole('button', { name: 'Games to mix' }).click();
      await expect(page.getByRole('heading', { name: 'Games to mix' })).toBeVisible();
    },
  },
  {
    name: 'a file with several players',
    go: async (page, app) => {
      await answerOpenDialog(app, file('two.yaml', TWO));
      await page.getByRole('button', { name: 'Open a YAML file' }).click();
      await expect(page.getByRole('heading', { name: 'This file has 2 players' })).toBeVisible();
    },
  },
];

for (const screen of SCREENS) {
  test(`${screen.name}: no overlap, readable, named controls, visible keyboard focus, both looks`, async ({ app, page }) => {
    test.setTimeout(180_000);
    await screen.go(page, app);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await setZoom(app, 1);
      for (const [width, height] of [
        [900, 600],
        [1280, 720],
      ] as const) {
        await setWindowSize(app, width, height);
        const report = await checkEverything(page);
        expect(report.problems, `${screen.name} ${scheme} ${width}x${height}`).toEqual([]);
      }
      await setWindowSize(app, 1280, 720);
      expect(await auditAccessibility(page), `${screen.name} ${scheme} accessibility`).toEqual([]);
    }
    expect(await auditKeyboard(page), `${screen.name} keyboard`).toEqual([]);
  });
}
