import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, ROOT } from './helpers';

// Grub Game has a named range whose special value (all = -1) is outside its 1..46 range.
test.use({ schema: join(ROOT, 'tests', 'fixtures', 'mini-schema-named.json') });

test.describe('named range with a special value outside its range', () => {
  test('a file holding the special number shows the name, no warning, and Custom number writes the default', async ({
    app,
    page,
  }) => {
    const path = join(mkdtempSync(join(tmpdir(), 'yamled-named-')), 'grubs.yaml');
    writeFileSync(path, 'name: P\ngame: Grub Game\nGrub Game:\n  grubs: -1\n', 'utf8');
    await answerOpenDialog(app, path);
    await page.getByRole('button', { name: 'Open', exact: true }).click();

    const grubs = page.locator('article[data-key="grubs"]');
    await expect(grubs.getByRole('combobox', { name: 'Grubs', exact: true })).toHaveValue('all');
    await expect(grubs.getByText('outside the allowed range')).toHaveCount(0);
    await expect(grubs.locator('.note--warn')).toHaveCount(0);

    await grubs.getByRole('combobox', { name: 'Grubs', exact: true }).selectOption({ label: 'Custom number' });
    await expect(page.locator('.yaml')).toContainText('grubs: 46');
    await expect(grubs.getByRole('textbox', { name: 'Grubs (number)' })).toHaveValue('46');
  });

  test('starting the game shows the default number', async ({ page }) => {
    await page.getByRole('button', { name: /^Grub Game/ }).click();
    const grubs = page.locator('article[data-key="grubs"]');
    await expect(grubs.getByRole('textbox', { name: 'Grubs (number)' })).toHaveValue('46');
    await expect(grubs.getByText('Default: 46')).toBeVisible();
  });
});
