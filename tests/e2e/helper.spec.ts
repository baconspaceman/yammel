import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// The built-in guide needs no engine and no account.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

async function openHelper(page: Page, game = /^APQuest/) {
  await page.getByRole('button', { name: game }).click();
  await page.getByRole('button', { name: 'Helper', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Helper' })).toBeVisible();
}

const say = async (page: Page, text: string) => {
  await page.getByLabel('Message to the helper').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
};

test('the helper opens beside the YAML, with starter buttons and a plain note about privacy', async ({ page }) => {
  await openHelper(page);
  const panel = page.getByRole('region', { name: 'Helper' });
  await expect(panel).toContainText('sends nothing anywhere');
  await expect(panel.getByRole('button', { name: 'Surprise me' })).toBeVisible();
  // The YAML tab is still one click away.
  await page.getByRole('tab', { name: 'YAML' }).click();
  await expect(page.locator('.yaml')).toBeVisible();
});

test('asking in plain words makes a suggestion that changes nothing until Apply, and Apply is one undo step', async ({ page }) => {
  await openHelper(page);
  await say(page, 'turn on hard mode');
  const proposal = page.getByRole('list', { name: 'Suggested changes' }).getByRole('listitem').first();
  await expect(proposal).toContainText('Turn on Hard Mode');
  await page.getByRole('tab', { name: 'YAML' }).click();
  await expect(page.locator('.yaml')).not.toContainText('hard_mode');
  await page.getByRole('tab', { name: 'Helper' }).click();
  await proposal.getByRole('button', { name: 'Apply' }).click();
  await expect(proposal).toContainText('Applied');
  await expect(page.locator('article[data-key="hard_mode"]').getByRole('switch')).toBeChecked();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('article[data-key="hard_mode"]').getByRole('switch')).not.toBeChecked();
});

test('Skip leaves the YAML alone', async ({ page }) => {
  await openHelper(page);
  await say(page, 'turn on hard mode');
  const proposal = page.getByRole('list', { name: 'Suggested changes' }).getByRole('listitem').first();
  await proposal.getByRole('button', { name: 'Skip' }).click();
  await expect(proposal).toContainText('Skipped');
  await expect(page.locator('article[data-key="hard_mode"]').getByRole('switch')).not.toBeChecked();
});

test('"Show" jumps to the option, and follow-up chips keep the conversation going', async ({ page }) => {
  await openHelper(page);
  await say(page, 'what does trap chance do?');
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('Trap');
  await page.getByRole('button', { name: 'Show Trap Chance' }).click();
  await expect(page.locator('article[data-key="trap_chance"]')).toBeInViewport();
  await expect(page.getByRole('group', { name: 'Things you could say next' }).or(page.getByLabel('Things you could say next'))).toBeVisible();
});

test('"Fix my problems" repairs a broken YAML in one step', async ({ page }) => {
  await openHelper(page);
  await page.locator('article[data-key="hard_mode"]').scrollIntoViewIfNeeded();
  await say(page, 'surprise me');
  const proposal = page.getByRole('list', { name: 'Suggested changes' }).getByRole('listitem').first();
  await proposal.getByRole('button', { name: 'Apply' }).click();
  await say(page, 'fix my problems');
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('Nothing to fix');
});

test('an unclear request gets an honest answer, not a guess', async ({ page }) => {
  await openHelper(page);
  await say(page, 'xylophone quasar zeppelin');
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText('built-in guide');
  await expect(page.getByRole('list', { name: 'Suggested changes' })).toHaveCount(0);
});

test('the helper never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(180_000);
  await openHelper(page);
  await say(page, 'turn on hard mode');
  await say(page, 'make it harder');
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
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(20);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});
