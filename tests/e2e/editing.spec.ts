import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MINI_SCHEMA } from './helpers';

// Uses tests/fixtures/mini-schema.json (Demo Game: difficulty choice, lives 1-10 default 5, hard_mode toggle).

async function startDemoGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Demo Game/ }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
}

const preview = (page: Page) => page.locator('.yaml');
const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);

test.describe('editing a new YAML', () => {
  test.use({ schema: MINI_SCHEMA });

  test('starting a game gives a minimal YAML and a card per option', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
    await startDemoGame(page);
    await expect(preview(page)).toContainText('name: Player');
    await expect(preview(page)).toContainText('game: Demo Game');
    await expect(page.locator('article.option')).toHaveCount(3);
  });

  test('a switch writes the option, marks it changed, and can be reset', async ({ page }) => {
    await startDemoGame(page);
    const hard = card(page, 'hard_mode');
    await expect(hard.getByText('Changed')).toHaveCount(0);

    await hard.getByRole('switch').click();
    await expect(preview(page)).toContainText('hard_mode: true');
    await expect(hard.getByText('Changed')).toBeVisible();

    await hard.getByRole('button', { name: 'Reset to default' }).click();
    await expect(preview(page)).not.toContainText('hard_mode');
    await expect(hard.getByText('Changed')).toHaveCount(0);
  });

  test('a dropdown writes the chosen value', async ({ page }) => {
    await startDemoGame(page);
    await card(page, 'difficulty').getByRole('combobox', { name: 'Difficulty', exact: true }).selectOption('hard');
    await expect(preview(page)).toContainText('difficulty: hard');
  });

  test('a number box writes valid numbers and refuses invalid ones', async ({ page }) => {
    await startDemoGame(page);
    const box = card(page, 'lives').getByRole('textbox', { name: 'Lives (number)' });

    await box.fill('7');
    await box.press('Enter');
    await expect(preview(page)).toContainText('lives: 7');

    await box.fill('99');
    await box.press('Enter');
    await expect(card(page, 'lives').getByRole('alert')).toHaveText('Must be between 1 and 10.');
    await expect(preview(page)).toContainText('lives: 7');
  });

  test('undo and redo work from the buttons and from the keyboard', async ({ page }) => {
    await startDemoGame(page);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await card(page, 'hard_mode').getByRole('switch').click();
    await expect(preview(page)).toContainText('hard_mode: true');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(preview(page)).not.toContainText('hard_mode');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(preview(page)).toContainText('hard_mode: true');

    await page.locator('.toolbar').click(); // focus outside any text box
    await page.keyboard.press('Control+z');
    await expect(preview(page)).not.toContainText('hard_mode');
    await page.keyboard.press('Control+y');
    await expect(preview(page)).toContainText('hard_mode: true');
  });

  test('the player name and description are editable, and an empty name is refused', async ({ page }) => {
    await startDemoGame(page);
    const name = page.getByRole('textbox', { name: 'Player name' });

    await name.fill('Bacon');
    await name.press('Enter');
    await expect(preview(page)).toContainText('name: Bacon');

    await page.getByRole('textbox', { name: 'Description' }).fill('My test');
    await page.getByRole('textbox', { name: 'Description' }).press('Enter');
    await expect(preview(page)).toContainText('description: My test');

    await name.fill('');
    await name.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'cannot be empty' })).toBeVisible();
    await expect(name).toHaveValue('Bacon');
    await expect(preview(page)).toContainText('name: Bacon');
  });

  test('searching narrows the options and says when nothing matches', async ({ page }) => {
    await startDemoGame(page);
    const search = page.getByRole('searchbox', { name: 'Search options' });

    await search.fill('lives');
    await expect(page.locator('article.option')).toHaveCount(1);
    await expect(page.getByText('1 option', { exact: true })).toBeVisible();

    await search.fill('zzzz');
    await expect(page.getByText('No options match')).toBeVisible();

    await search.fill('');
    await expect(page.locator('article.option')).toHaveCount(3);
  });

  test('the preview can be hidden and shown again', async ({ page }) => {
    await startDemoGame(page);
    await page.getByRole('button', { name: 'Hide preview' }).click();
    await expect(preview(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show preview' }).click();
    await expect(preview(page)).toBeVisible();
  });

});

test.describe('start screen with the real game list', () => {
  test.use({ schema: undefined });

  test('game search on the start screen filters the list', async ({ page }) => {
    const items = page.getByRole('list', { name: 'Games' }).getByRole('listitem');
    await expect.poll(() => items.count()).toBeGreaterThan(50); // the list appears when the game data has loaded
    await page.getByRole('searchbox', { name: 'Search games' }).fill('hat in');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('A Hat in Time');
  });
});
