import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { auditAccessibility, auditKeyboard } from './a11yCheck';
import { answerOpenDialog } from './helpers';
import { checkEverything } from './layoutCheck';

const LTTP = 'name: Anthony\ngame: A Link to the Past\nA Link to the Past:\n  mode: open\n  item_pool: normal\n';
const demo = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'yamled-popout-')), 'demo.yaml');
  writeFileSync(path, LTTP, 'utf8');
  return path;
};

async function openAndAsk(app: ElectronApplication, page: Page, message: string): Promise<void> {
  await answerOpenDialog(app, demo());
  await page.getByRole('button', { name: 'Open a YAML file' }).click();
  await expect(page.locator('article[data-key="goal"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Helper' }).click();
  await page.getByLabel('Message to the helper').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/That moves the difficulty/)).toBeVisible();
}

async function popOut(app: ElectronApplication, page: Page): Promise<Page> {
  const opened = app.waitForEvent('window');
  await page.getByRole('button', { name: 'Pop out' }).click();
  const pop = await opened;
  await pop.waitForLoadState('domcontentloaded');
  return pop;
}

const resizeHelper = (app: ElectronApplication, width: number, height: number) =>
  app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=helper'));
    win?.setContentSize(size.width, size.height);
  }, { width, height });

test('the helper moves to its own window with its conversation, and changes made there land in the editor and can be undone', async ({ app, page }) => {
  await openAndAsk(app, page, 'make it a bit harder');
  const pop = await popOut(app, page);

  // the conversation came along, and the editor says where the helper went
  await expect(pop.getByText('make it a bit harder')).toBeVisible();
  await expect(pop.locator('.chat__proposal-title').first()).toBeVisible();
  await expect(page.getByText(/The helper is open in its own window/)).toBeVisible();

  // applying from the pop-out changes the YAML in the editor window
  await page.getByRole('tab', { name: 'YAML' }).click();
  const yaml = page.getByLabel('YAML text', { exact: true });
  const before = await yaml.textContent();
  await pop.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(pop.getByText('Applied (you can undo it)')).toBeVisible();
  await expect.poll(() => yaml.textContent()).not.toBe(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => yaml.textContent()).toBe(before);

  // a new message typed in the pop-out is answered there
  await pop.getByLabel('Message to the helper').fill('turn off death link');
  await pop.getByRole('button', { name: 'Send' }).click();
  await expect(pop.locator('.chat__msg--user', { hasText: 'turn off death link' })).toBeVisible();
  await expect(pop.getByRole('log', { name: 'Conversation' })).toContainText(/death link/i);

  // bringing it back closes the window and the same conversation is in the editor again
  const closed = pop.waitForEvent('close');
  await pop.getByRole('button', { name: 'Back to the editor' }).click();
  await closed;
  await page.getByRole('tab', { name: 'Helper' }).click();
  await expect(page.getByRole('button', { name: 'Pop out' })).toBeVisible();
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('make it a bit harder');
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('turn off death link');
});

test('only the right window may do each thing: the pop-out cannot reach the rest of the app, and the editor cannot pretend to be the pop-out', async ({ app, page }) => {
  await openAndAsk(app, page, 'make it a bit harder');
  const pop = await popOut(app, page);

  const fromPop = await pop.evaluate(async () => {
    const api = window.api as unknown as Record<string, (arg?: unknown) => Promise<{ ok: boolean }>>;
    return {
      generator: (await api['generatorStatus']!()).ok,
      files: (await api['recentFiles']!()).ok,
      open: (await api['openYaml']!()).ok,
      publish: (await api['publishHelper']!({ entries: [], starters: [], busy: false, helpers: [], helperId: 'guide', note: 'forged', settled: [] })).ok,
      openWindow: (await api['openHelperWindow']!()).ok,
      badAction: (await api['sendHelperAction']!({ type: 'delete' })).ok,
      longAction: (await api['sendHelperAction']!({ type: 'send', text: 'x'.repeat(501) })).ok,
      goodAction: (await api['sendHelperAction']!({ type: 'point', game: 'A Link to the Past', option: 'goal' })).ok,
    };
  });
  expect(fromPop).toEqual({ generator: false, files: false, open: false, publish: false, openWindow: false, badAction: false, longAction: false, goodAction: true });

  const fromEditor = await page.evaluate(async () => {
    const api = window.api as unknown as Record<string, (arg?: unknown) => Promise<{ ok: boolean }>>;
    return {
      snapshot: (await api['getHelperSnapshot']!()).ok,
      action: (await api['sendHelperAction']!({ type: 'clear' })).ok,
      junkSnapshot: (await api['publishHelper']!({ entries: 'no' })).ok,
      goodSnapshot: (await api['publishHelper']!({ entries: [], starters: [], busy: false, helpers: [], helperId: 'guide', note: '', settled: [] })).ok,
    };
  });
  expect(fromEditor).toEqual({ snapshot: false, action: false, junkSnapshot: false, goodSnapshot: true });
});

test('opening the pop-out again brings the same window forward, and closing the editor takes it with it', async ({ app, page }) => {
  await openAndAsk(app, page, 'make it a bit harder');
  const pop = await popOut(app, page);
  expect(app.windows()).toHaveLength(2);
  await page.getByRole('button', { name: 'Show that window' }).click();
  await page.getByRole('button', { name: 'Helper', exact: true }).click(); // the toolbar button too
  await expect.poll(() => app.windows().length).toBe(2);
  const closed = pop.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=helper'))?.destroy();
  });
  await closed;
});

test('the pop-out never overlaps or clips text, is readable, has named controls and visible keyboard focus, in both looks and at its smallest', async ({ app, page }) => {
  test.setTimeout(120_000);
  await openAndAsk(app, page, 'make it a bit harder');
  const pop = await popOut(app, page);
  await expect(pop.locator('.chat__proposal-title').first()).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await pop.emulateMedia({ colorScheme: scheme });
    for (const [width, height] of [
      [340, 420],
      [480, 720],
    ] as const) {
      await resizeHelper(app, width, height);
      await pop.waitForTimeout(200);
      const report = await checkEverything(pop);
      expect(report.problems, `pop-out ${scheme} ${width}x${height}`).toEqual([]);
    }
    expect(await auditAccessibility(pop), `pop-out ${scheme} accessibility`).toEqual([]);
  }
  expect(await auditKeyboard(pop, 10)).toEqual([]);
});
