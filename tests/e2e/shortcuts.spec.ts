import type { Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, answerSaveDialog, MINI_SCHEMA } from './helpers';

test.use({ schema: MINI_SCHEMA });

async function startDemoGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Demo Game/ }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
}

const preview = (page: Page) => page.locator('.yaml');
const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);
const dirtyMarker = (page: Page) => page.getByRole('img', { name: 'Unsaved changes' });

test.describe('shortcuts while typing in a text box', () => {
  test('Ctrl+S saves text that was typed but not yet committed', async ({ app, page }) => {
    await startDemoGame(page);
    const target = join(mkdtempSync(join(tmpdir(), 'yamled-short-')), 'typed.yaml');
    await answerSaveDialog(app, target);

    const name = page.getByRole('textbox', { name: 'Player name' });
    await name.fill('Bacon'); // no Enter, no blur
    await expect(name).toBeFocused();
    await page.keyboard.press('Control+s');

    await expect(dirtyMarker(page)).toHaveCount(0);
    await expect(page.getByText('typed.yaml')).toBeVisible();
    expect(readFileSync(target, 'utf8')).toContain('name: Bacon');
  });

  test('Ctrl+O keeps typed text when the user declines to discard', async ({ app, page }) => {
    await startDemoGame(page);
    await card(page, 'hard_mode').getByRole('switch').click(); // make the document dirty
    const other = join(mkdtempSync(join(tmpdir(), 'yamled-short-')), 'other.yaml');
    writeFileSync(other, 'name: Other\ngame: Demo Game\n', 'utf8');
    await answerOpenDialog(app, other);

    const description = page.getByRole('textbox', { name: 'Description' });
    await description.fill('Typed words');
    await expect(description).toBeFocused();
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.keyboard.press('Control+o');

    await expect(preview(page)).toContainText('description: Typed words');
    await expect(preview(page)).toContainText('hard_mode: true');
    await expect(preview(page)).not.toContainText('name: Other');
  });
});

test.describe('undo from a focused control', () => {
  test('Ctrl+Z works while a switch has focus', async ({ page }) => {
    await startDemoGame(page);
    const hard = card(page, 'hard_mode').getByRole('switch');
    await hard.click();
    await expect(preview(page)).toContainText('hard_mode: true');
    await expect(hard).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect(preview(page)).not.toContainText('hard_mode');
  });

  test('Ctrl+Z works while a slider has focus', async ({ page }) => {
    await startDemoGame(page);
    const slider = card(page, 'lives').getByRole('slider', { name: 'Lives' });
    await slider.focus();
    await page.keyboard.press('ArrowRight'); // 5 -> 6, written when the key is released
    await expect(preview(page)).toContainText('lives: 6');
    await expect(slider).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect(preview(page)).not.toContainText('lives:');
  });
});

test.describe('accessibility basics', () => {
  test('the YAML text is focusable and has a name', async ({ page }) => {
    await startDemoGame(page);
    await expect(page.getByLabel('YAML text', { exact: true })).toBeVisible();
    await page.getByLabel('YAML text', { exact: true }).focus();
    await expect(page.getByLabel('YAML text', { exact: true })).toBeFocused();
  });
});
