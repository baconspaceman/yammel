import type { Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { answerOpenDialog, closeApp, launch, MINI_SCHEMA } from './helpers';

// A weighted option ("difficulty" in the mini schema) and a plain one ("lives").
const WEIGHTED = `name: Bacon
game: Demo Game
Demo Game:
  difficulty:
    easy: 50
    hard: 50
  lives: 3
`;

function tempFile(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yammel-simple-')), name);
  writeFileSync(path, text, 'utf8');
  return path;
}

const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);
const previewText = (page: Page) => page.locator('.yaml code').textContent();
const viewButton = (page: Page) => page.getByRole('button', { name: /^Advanced view:/ });

async function openSimple(path: string) {
  const launched = await launch({ schema: MINI_SCHEMA, view: 'simple' });
  await answerOpenDialog(launched.app, path);
  await launched.page.getByRole('button', { name: 'Open', exact: true }).click();
  return launched;
}

test.describe('the Simple view (the default)', () => {
  test('shows each option with a plain status, and the chances in the file in words', async () => {
    const { app, page } = await openSimple(tempFile('weighted.yaml', WEIGHTED));
    try {
      await expect(card(page, 'difficulty').getByText('Chances set', { exact: true })).toBeVisible();
      await expect(card(page, 'difficulty').getByText(/The file has chances set for this option/)).toBeVisible();
      await expect(card(page, 'lives').getByText('Changed', { exact: true })).toBeVisible();
      await expect(card(page, 'hard_mode').getByText('Default', { exact: true })).toBeVisible();
      // none of the Advanced controls are shown
      await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Roll now/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Lock / })).toHaveCount(0);
      // and the file is untouched
      expect(await previewText(page)).toBe(WEIGHTED);
    } finally {
      await closeApp(app);
    }
  });

  test('picks a value in one choice, and the file changes only where that option is', async () => {
    const { app, page } = await openSimple(tempFile('plain.yaml', 'name: Bacon\ngame: Demo Game\nDemo Game:\n  difficulty: easy\n  lives: 3\n'));
    try {
      await card(page, 'difficulty').getByRole('combobox', { name: 'Difficulty', exact: true }).selectOption('hard');
      await expect(card(page, 'difficulty').getByText('Changed', { exact: true })).toBeVisible();
      const text = (await previewText(page)) ?? '';
      expect(text).toContain('difficulty: hard');
      expect(text).toContain('lives: 3');
    } finally {
      await closeApp(app);
    }
  });

  test('the toolbar button opens the Advanced view, with the chances editor and Roll now', async () => {
    const { app, page } = await openSimple(tempFile('weighted.yaml', WEIGHTED));
    try {
      await expect(page.getByRole('group', { name: 'Weighted values for Difficulty' })).toHaveCount(0);
      await viewButton(page).click();
      await expect(page.getByRole('button', { name: 'Advanced view: on' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Weighted values for Difficulty' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Roll now: Lives/ })).toBeVisible();
      await viewButton(page).click();
      await expect(page.getByRole('button', { name: 'Advanced view: off' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Weighted values for Difficulty' })).toHaveCount(0);
    } finally {
      await closeApp(app);
    }
  });
});
