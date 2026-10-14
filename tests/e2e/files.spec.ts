import type { Page } from '@playwright/test';
import { mkdtempSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, answerSaveDialog, MINI_SCHEMA } from './helpers';

test.use({ schema: MINI_SCHEMA });

const WEIGHTED = `# my notes
name: Bacon # slot name
game: Demo Game
description: Weighted test

Demo Game:
  difficulty:
    easy: 50
    hard: 50
  lives: 3 # keep this
`;

function tempFile(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yamled-files-')), name);
  writeFileSync(path, text, 'utf8');
  return path;
}

const previewText = (page: Page) => page.locator('.yaml code').textContent();
const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);
const dirtyMarker = (page: Page) => page.getByRole('img', { name: 'Unsaved changes' });

async function openFile(app: Parameters<typeof answerOpenDialog>[0], page: Page, path: string): Promise<void> {
  await answerOpenDialog(app, path);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
}

test.describe('opening files', () => {
  test('a weighted file opens unchanged, shows its weights in the weights editor, and keeps comments through an edit', async ({ app, page }) => {
    const path = tempFile('weighted.yaml', WEIGHTED);
    await openFile(app, page, path);

    await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
    expect(await previewText(page)).toBe(WEIGHTED); // byte for byte, nothing reformatted

    const difficulty = card(page, 'difficulty');
    await expect(difficulty.getByRole('group', { name: 'Weighted values for Difficulty' })).toBeVisible();
    await expect(difficulty.getByRole('combobox', { name: 'Difficulty', exact: true })).toHaveCount(0);
    await expect(card(page, 'lives').getByText('Changed')).toBeVisible();
    await expect(page.getByText('weighted.yaml')).toBeVisible();

    const box = card(page, 'lives').getByRole('textbox', { name: 'Lives (number)' });
    await box.fill('4');
    await box.press('Enter');
    const edited = (await previewText(page)) ?? '';
    expect(edited).toContain('lives: 4 # keep this');
    expect(edited).toContain('# my notes');
    expect(edited).toContain('name: Bacon # slot name');
    expect(edited).toContain('easy: 50');
    expect(readFileSync(path, 'utf8')).toBe(WEIGHTED); // the file itself is untouched until saved
  });

  test('a YAML for a game that is not in the list is shown, not edited', async ({ app, page }) => {
    const text = 'name: P\ngame: Nope Game\nNope Game:\n  x: 1\n';
    await openFile(app, page, tempFile('nope.yaml', text));
    await expect(page.getByRole('alert').filter({ hasText: 'is not in the game list' })).toBeVisible();
    expect(await previewText(page)).toBe(text);
    await expect(page.locator('article.option')).toHaveCount(0);
  });

  test('a YAML with a syntax error points at the line and is not edited', async ({ app, page }) => {
    const text = 'name: P\ngame: Demo Game\nDemo Game: [1, 2\n';
    await openFile(app, page, tempFile('broken.yaml', text));
    await expect(page.getByRole('alert').filter({ hasText: "can't be edited yet" })).toBeVisible();
    await expect(page.getByText(/Line \d+:/).first()).toBeVisible();
    expect(await previewText(page)).toBe(text);
  });

  test('a file with several YAML documents is explained, not silently cut', async ({ app, page }) => {
    await openFile(app, page, tempFile('multi.yaml', 'name: A\ngame: Demo Game\n---\nname: B\ngame: Demo Game\n'));
    // Several players in one file are no longer an error: the app asks which one to edit and never cuts anything.
    await expect(page.getByRole('heading', { name: 'This file has 2 players' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Players in this file' })).toContainText('Demo Game');
  });

  test('a YAML with no game line is explained', async ({ app, page }) => {
    await openFile(app, page, tempFile('nogame.yaml', 'name: P\n'));
    await expect(page.getByRole('alert').filter({ hasText: 'does not say which game' })).toBeVisible();
  });

  test('a file that is not .yaml or .yml is refused with a message', async ({ app, page }) => {
    await openFile(app, page, tempFile('notes.txt', 'name: P\n'));
    await expect(page.getByRole('alert').filter({ hasText: 'Only .yaml and .yml files' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  });
});

test.describe('saving', () => {
  test('a new YAML is saved where the user picks, then re-saved to the same file with a backup', async ({ app, page, userData }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await card(page, 'hard_mode').getByRole('switch').click();
    await expect(dirtyMarker(page)).toBeVisible();

    const target = join(mkdtempSync(join(tmpdir(), 'yamled-save-')), 'bacon.yaml');
    await answerSaveDialog(app, target);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dirtyMarker(page)).toHaveCount(0);
    await expect(page.getByText('bacon.yaml')).toBeVisible();
    const first = readFileSync(target, 'utf8');
    expect(first).toBe(await previewText(page));
    expect(first).toContain('hard_mode: true');

    // Saving again goes to the same file without asking, and keeps the old version as a backup.
    await answerSaveDialog(app, null); // would cancel if the app asked again
    await card(page, 'lives').getByRole('textbox', { name: 'Lives (number)' }).fill('8');
    await card(page, 'lives').getByRole('textbox', { name: 'Lives (number)' }).press('Enter');
    await expect(dirtyMarker(page)).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dirtyMarker(page)).toHaveCount(0);

    expect(readFileSync(target, 'utf8')).toContain('lives: 8');
    const backups = readdirSync(join(userData, 'backups'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(userData, 'backups', backups[0]!), 'utf8')).toBe(first);
  });

  test('cancelling the Save dialog changes nothing', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await card(page, 'hard_mode').getByRole('switch').click();
    await answerSaveDialog(app, null);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dirtyMarker(page)).toBeVisible();
    await expect(page.getByText('Untitled')).toBeVisible();
  });

  test('Ctrl+S saves, and Save as always asks for a location', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await card(page, 'hard_mode').getByRole('switch').click();
    const first = join(mkdtempSync(join(tmpdir(), 'yamled-save-')), 'one.yaml');
    await answerSaveDialog(app, first);
    await page.keyboard.press('Control+s');
    await expect(dirtyMarker(page)).toHaveCount(0);
    expect(existsSync(first)).toBe(true);

    const second = join(mkdtempSync(join(tmpdir(), 'yamled-save-')), 'two.yaml');
    await answerSaveDialog(app, second);
    await page.getByRole('button', { name: 'Save as' }).click();
    await expect(page.getByText('two.yaml')).toBeVisible();
    expect(existsSync(second)).toBe(true);
  });

  test('the new-document and discard prompts protect unsaved work', async ({ page }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await card(page, 'hard_mode').getByRole('switch').click();

    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'New' }).click();
    await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'New' }).click();
    await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  });
});

test.describe('opening while there are unsaved changes', () => {
  async function makeDirty(page: Page): Promise<void> {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await card(page, 'hard_mode').getByRole('switch').click();
    await expect(dirtyMarker(page)).toBeVisible();
  }

  test('cancelling the file picker asks nothing and changes nothing', async ({ app, page }) => {
    await makeDirty(page);
    let asked = 0;
    page.on('dialog', (dialog) => {
      asked += 1;
      void dialog.dismiss();
    });
    await answerOpenDialog(app, null);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.waitForTimeout(500);
    expect(asked).toBe(0);
    expect(await previewText(page)).toContain('hard_mode: true');
    await expect(dirtyMarker(page)).toBeVisible();
  });

  test('declining the discard prompt keeps the current document', async ({ app, page }) => {
    await makeDirty(page);
    const path = tempFile('other.yaml', 'name: Other\ngame: Demo Game\n');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await openFile(app, page, path);
    await page.waitForTimeout(500);
    expect(await previewText(page)).toContain('hard_mode: true');
    expect(await previewText(page)).not.toContain('name: Other');
    await expect(dirtyMarker(page)).toBeVisible();
  });

  test('accepting the discard prompt opens the chosen file', async ({ app, page }) => {
    await makeDirty(page);
    const path = tempFile('other.yaml', 'name: Other\ngame: Demo Game\n');
    page.once('dialog', (dialog) => void dialog.accept());
    await openFile(app, page, path);
    await expect(page.getByText('other.yaml', { exact: true })).toBeVisible();
    expect(await previewText(page)).toBe('name: Other\ngame: Demo Game\n');
    await expect(dirtyMarker(page)).toHaveCount(0);
  });
});
