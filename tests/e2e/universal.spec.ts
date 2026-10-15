import type { Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, MINI_SCHEMA } from './helpers';

test.use({ schema: MINI_SCHEMA });

// A template the way Archipelago writes one, for a game that is not in the game data (a custom world that was never scanned).
const TEMPLATE = `name: Player{number}
game: Odd Game

Odd Game:
  ################
  # Game Options #
  ################
  accessibility:
    # Set rules for reachability.
    full: 50
    minimal: 0

  death_link:
    # Die when another player dies.
    'false': 50
    'true': 0

  hearts:
    # Minimum value is 1
    # Maximum value is 20
    3: 50
    random: 0
    random-range-1-20: 0

  local_items:
    # Forces these items to be in their native world.
    []
`;

function tempFile(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yammel-universal-')), name);
  writeFileSync(path, text, 'utf8');
  return path;
}

const previewText = (page: Page) => page.locator('.yaml code').textContent();
const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);

async function openFile(app: Parameters<typeof answerOpenDialog>[0], page: Page, path: string): Promise<void> {
  await answerOpenDialog(app, path);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
}

test.describe('a game Yammel has no data for', () => {
  test('opens, shows every option from the file, and says where the options came from', async ({ app, page }) => {
    await openFile(app, page, tempFile('odd.yaml', TEMPLATE));

    await expect(page.getByText('Yammel has no data for Odd Game')).toBeVisible();
    await expect(page.getByText(/is not in the game list/)).toHaveCount(0);
    await expect(card(page, 'accessibility')).toBeVisible();
    await expect(card(page, 'death_link')).toBeVisible();
    await expect(card(page, 'hearts')).toBeVisible();
    await expect(card(page, 'local_items')).toBeVisible();
    expect(await previewText(page)).toBe(TEMPLATE); // opening changes nothing
  });

  test('a change to one option is saved in the file and nothing else moves', async ({ app, page }) => {
    const text = TEMPLATE.replace(
      '  hearts:\n    # Minimum value is 1\n    # Maximum value is 20\n    3: 50\n    random: 0\n    random-range-1-20: 0\n',
      '  hearts: 3 # keep this\n',
    );
    expect(text).toContain('hearts: 3 # keep this');
    await openFile(app, page, tempFile('odd.yaml', text));
    const box = card(page, 'hearts').getByRole('textbox', { name: 'Hearts (number)' });
    await box.fill('5');
    await box.press('Enter');
    const edited = (await previewText(page)) ?? '';
    expect(edited).toContain('hearts: 5 # keep this');
    expect(edited).toContain('# Forces these items to be in their native world.');
    expect(edited).toContain('# Game Options #');
    await expect(card(page, 'accessibility').getByRole('group', { name: 'Weighted values for Accessibility' })).toBeVisible();
  });

  test('a misspelled known game still gets the did-you-mean message instead of being treated as a new game', async ({ app, page }) => {
    const text = 'name: P\ngame: Demo Gam\n\nDemo Gam:\n  lives: 3\n';
    await openFile(app, page, tempFile('typo.yaml', text));
    await expect(page.getByText(/is not in the game list/)).toBeVisible();
  });
});
