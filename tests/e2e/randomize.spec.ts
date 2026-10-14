import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from './fixtures';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// None of this needs the seed engine, so it is pointed at a folder that does not exist.
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

type Page = import('@playwright/test').Page;

const card = (page: Page, key: string) => page.locator(`article[data-key="${key}"]`);
const yaml = (page: Page) => page.locator('.yaml');

async function openApQuest(page: Page) {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: /^Randomize…/ }).click();
  await expect(page.getByRole('region', { name: 'Randomize' })).toBeVisible();
}

test('Roll now writes a real value into the YAML', async ({ page }) => {
  await openApQuest(page);
  await card(page, 'hard_mode').getByRole('button', { name: 'Roll now: Hard Mode' }).click();
  await expect(yaml(page)).toContainText(/hard_mode: (true|false)/);
  await card(page, 'trap_chance').getByRole('button', { name: 'Roll now: Trap Chance' }).click();
  await expect(yaml(page)).toContainText(/trap_chance: \d+/);
});

test('an option can be made random, shown in plain words, and made fixed again', async ({ page }) => {
  await openApQuest(page);
  const hard = card(page, 'hard_mode');
  await hard.getByRole('combobox', { name: 'How Hard Mode is decided' }).selectOption('random');
  await expect(yaml(page)).toContainText('hard_mode: random');
  await expect(hard).toContainText('Random: on or off, decided when the seed is generated.');
  await expect(hard.getByRole('switch')).toHaveCount(0);
  await expect(hard).not.toContainText('edited in Advanced mode');

  await hard.getByRole('combobox', { name: 'How Hard Mode is decided' }).selectOption('fixed');
  await expect(yaml(page)).not.toContainText('hard_mode');
  await expect(hard.getByRole('switch')).toBeVisible();
});

test('a number can be random, leaning, or random between two numbers', async ({ page }) => {
  await openApQuest(page);
  const trap = card(page, 'trap_chance');
  const mode = trap.getByRole('combobox', { name: 'How Trap Chance is decided' });
  await mode.selectOption('random-high');
  await expect(yaml(page)).toContainText('trap_chance: random-high');
  await expect(trap).toContainText('leaning towards high values');

  await mode.selectOption('range');
  await expect(yaml(page)).toContainText('trap_chance: random-range-0-100');
  const to = trap.getByRole('textbox', { name: 'Trap Chance: random to' });
  await to.fill('40');
  await to.press('Enter');
  await expect(yaml(page)).toContainText('trap_chance: random-range-0-40');
  await to.fill('400');
  await to.press('Enter');
  await expect(trap.getByRole('alert')).toContainText('Must be between');
  await expect(yaml(page)).toContainText('trap_chance: random-range-0-40'); // nothing changed
});

test('a random value in an existing file is understood, and the difficulty meter counts it as an average', async ({ page }) => {
  await openApQuest(page);
  await card(page, 'hard_mode').getByRole('combobox', { name: 'How Hard Mode is decided' }).selectOption('random');
  await expect(page.getByTestId('difficulty-value')).toHaveText('2.3'); // 1.5 + half of 1.5 (written as 2.25)
  await page.getByRole('button', { name: 'Why this number?' }).click();
  await expect(page.getByRole('region', { name: 'Why this difficulty' })).toContainText('counted as their average');
});

test('Randomize everything re-rolls the options in one step, and one Undo puts everything back', async ({ page }) => {
  await openApQuest(page);
  const before = await yaml(page).innerText();
  await openPanel(page);
  await page.getByRole('button', { name: 'Randomize everything' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Randomized \d+ options/ })).toBeVisible();
  await expect(yaml(page)).toContainText('trap_chance:');
  await expect(yaml(page)).toContainText('player_sprite:');
  expect(await yaml(page).innerText()).not.toBe(before);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await yaml(page).innerText()).toBe(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled(); // it really was a single step
});

test('locked options keep their value through Randomize everything', async ({ page }) => {
  await openApQuest(page);
  await card(page, 'hard_mode').getByRole('switch').click();
  await expect(yaml(page)).toContainText('hard_mode: true');
  await card(page, 'hard_mode').getByRole('button', { name: 'Lock Hard Mode' }).click();
  await expect(card(page, 'hard_mode').getByRole('button', { name: 'Lock Hard Mode' })).toHaveAttribute('aria-pressed', 'true');

  await openPanel(page);
  for (let i = 0; i < 6; i += 1) {
    await page.getByRole('button', { name: 'Randomize everything' }).click();
    await expect(yaml(page)).toContainText('hard_mode: true');
  }
  await expect(yaml(page)).toContainText('hammer:');
  await expect(page.getByText(/1 locked option stays as it is/)).toBeVisible();

  await card(page, 'hard_mode').getByRole('button', { name: 'Lock Hard Mode' }).click(); // unlock
  await expect(page.getByText('Nothing is locked.')).toBeVisible();
});

test('"Lock the options I have set" locks exactly those, and "Clear all locks" lets go', async ({ page }) => {
  await openApQuest(page);
  await card(page, 'hard_mode').getByRole('switch').click();
  await openPanel(page);
  await page.getByRole('button', { name: 'Lock the options I have set' }).click();
  await expect(card(page, 'hard_mode').getByRole('button', { name: 'Lock Hard Mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'hammer').getByRole('button', { name: 'Lock Hammer' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Clear all locks' }).click();
  await expect(card(page, 'hard_mode').getByRole('button', { name: 'Lock Hard Mode' })).toHaveAttribute('aria-pressed', 'false');
});

test('a difficulty band keeps the estimate inside it, and a game without a rating cannot use one', async ({ page }) => {
  await openApQuest(page);
  await openPanel(page);
  await page.getByRole('checkbox', { name: /Keep the difficulty between/ }).check();
  await page.getByRole('spinbutton', { name: 'Lowest difficulty' }).fill('0');
  await page.getByRole('spinbutton', { name: 'Highest difficulty' }).fill('2');
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Randomize everything' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'the difficulty is now about' })).toBeVisible();
    const shown = Number(await page.getByTestId('difficulty-value').innerText());
    expect(shown).toBeLessThanOrEqual(2);
  }

  page.once('dialog', (dialog) => void dialog.accept()); // "discard unsaved changes?"
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('button', { name: /^Undertale/ }).click();
  await openPanel(page);
  await expect(page.getByRole('checkbox', { name: /Keep the difficulty between/ })).toBeDisabled();
  await expect(page.getByText('This game has no difficulty rating, so there is no band to keep.')).toBeVisible();
});

test('options the person weighted are left alone, and the panel says so', async ({ app, page }) => {
  const file = join(mkdtempSync(join(tmpdir(), 'yamled-weighted-')), 'weighted.yaml');
  writeFileSync(file, 'name: P\ngame: APQuest\nAPQuest:\n  hard_mode:\n    true: 50\n    false: 50\n', 'utf8');
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
  await expect(card(page, 'hard_mode').getByRole('combobox', { name: 'How Hard Mode is decided' })).toHaveValue('weighted');

  await openPanel(page);
  await expect(page.getByText(/1 weighted option is left alone too\./)).toBeVisible();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Randomize everything' }).click();
  await expect(yaml(page)).toContainText('hard_mode:\n    true: 50\n    false: 50');
  await expect(yaml(page)).toContainText('hammer:');
});

test('an impossible band says so and changes nothing', async ({ page }) => {
  await openApQuest(page);
  const before = await yaml(page).innerText();
  await openPanel(page);
  await page.getByRole('checkbox', { name: /Keep the difficulty between/ }).check();
  await page.getByRole('spinbutton', { name: 'Lowest difficulty' }).fill('9');
  await page.getByRole('spinbutton', { name: 'Highest difficulty' }).fill('10');
  await page.getByRole('button', { name: 'Randomize everything' }).click();
  await expect(page.getByRole('status').filter({ hasText: /No combination in \d+ tries/ })).toBeVisible();
  expect(await yaml(page).innerText()).toBe(before);
});

test('the randomize controls never overlap or clip text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(180_000);
  await openApQuest(page);
  await card(page, 'trap_chance').getByRole('combobox', { name: 'How Trap Chance is decided' }).selectOption('range');
  await card(page, 'hard_mode').getByRole('button', { name: 'Lock Hard Mode' }).click();
  await openPanel(page);
  await page.getByRole('checkbox', { name: /Keep the difficulty between/ }).check();
  await page.getByRole('button', { name: 'Randomize everything' }).click();
  await page.getByRole('button', { name: /^Randomize…/ }).scrollIntoViewIfNeeded();

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
