import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerOpenDialog, setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// The difficulty meter needs no seed engine, so these tests point the engine at a folder that does not exist
// (the checks bar then says "Unavailable", which is not what is being tested here).
test.use({ extraEnv: { ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });

function writeYaml(name: string, body: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'yamled-diff-')), name);
  writeFileSync(file, body, 'utf8');
  return file;
}

test('a game with a draft profile shows a rated score that moves with the options and can be explained', async ({ page }) => {
  await page.getByRole('button', { name: /^APQuest/ }).click();
  const value = page.getByTestId('difficulty-value');
  await expect(value).toHaveText('1.5');
  await expect(page.getByTestId('difficulty-label')).toHaveText('Very easy');
  await expect(page.getByTestId('difficulty-source')).toHaveText('Rated · draft');
  await expect(page.getByRole('meter', { name: 'Difficulty' })).toHaveAttribute('aria-valuetext', '1.5 out of 10, Very easy, Rated · draft');

  await page.locator('article[data-key="hard_mode"]').getByRole('switch').click();
  await expect(value).toHaveText('3.0');
  await expect(page.getByTestId('difficulty-label')).toHaveText('Easy');

  await page.getByRole('button', { name: 'Why this number?' }).click();
  const why = page.getByRole('region', { name: 'Why this difficulty' });
  await expect(why).toContainText('A draft rating written from the option names');
  await expect(why.getByTestId('why-item')).toHaveCount(1);
  await expect(why.getByTestId('why-item').first()).toContainText('+1.5');
  await expect(why.getByTestId('why-item').first()).toContainText('Hard Mode');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(value).toHaveText('1.5');
  await expect(why.getByTestId('why-item')).toHaveCount(0); // back to the defaults: nothing moves the number
  await expect(why).toContainText('Nothing you have changed moves the number');
});

test('a game without a profile but with trap or difficulty options is estimated, and says so', async ({ page }) => {
  await page.getByRole('button', { name: /^Pokemon Red and Blue/ }).click();
  await expect(page.getByTestId('difficulty-value')).toHaveText('~5.0');
  await expect(page.getByTestId('difficulty-source')).toHaveText('Estimated');
  await page.getByRole('button', { name: 'Why this number?' }).click();
  await expect(page.getByRole('region', { name: 'Why this difficulty' })).toContainText('Estimated from option names only');
});

test('a game with nothing difficulty-related says "Not rated" and shows no gauge', async ({ page }) => {
  await page.getByRole('button', { name: /^Undertale/ }).click();
  await expect(page.getByTestId('difficulty-value')).toHaveText('Not rated');
  await expect(page.getByRole('meter')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Why this number?' })).toHaveCount(0);
});

test('weighted settings count as their average and the explanation names them', async ({ app, page }) => {
  const file = writeYaml('weighted.yaml', 'name: P\ngame: APQuest\nAPQuest:\n  hard_mode:\n    true: 25\n    false: 75\n');
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('difficulty-value')).toHaveText('1.9'); // 1.5 + 0.25 * 1.5
  await page.getByRole('button', { name: 'Why this number?' }).click();
  await expect(page.getByRole('region', { name: 'Why this difficulty' })).toContainText('counted as their average or at the default: Hard Mode');
});

test('the score stays on the scale and the marker inside the bar when everything is turned up', async ({ app, page }) => {
  const file = writeYaml(
    'brutal.yaml',
    [
      'name: P',
      'game: A Link to the Past',
      'A Link to the Past:',
      '  glitches_required: overworld_glitches',
      '  item_pool: hard',
      '  swordless: true',
      '  timer: ohko',
      '  enemy_shuffle: true',
      '  entrance_shuffle: insanity',
      '  death_link: true',
      '  enemy_damage: chaos',
      '  bombless_start: true',
      '  pot_shuffle: true',
      '',
    ].join('\n'),
  );
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('difficulty-value')).toHaveText('10.0');
  await expect(page.getByTestId('difficulty-label')).toHaveText('Very hard');
  await page.getByRole('button', { name: 'Why this number?' }).click();
  await expect(page.getByTestId('why-item')).toHaveCount(6);
  await expect(page.getByText('…and 4 smaller changes.')).toBeVisible();
});

test('the meter and the open explanation never overlap or clip text, in both themes, small windows and zoom', async ({ app, page }) => {
  test.setTimeout(180_000);
  const file = writeYaml(
    'brutal-layout.yaml',
    'name: P\ngame: A Link to the Past\nA Link to the Past:\n  glitches_required: hybrid_major_glitches\n  item_pool: expert\n  swordless: true\n  timer: ohko\n  entrance_shuffle: insanity\n  death_link: true\n',
  );
  await answerOpenDialog(app, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Why this number?' }).click();
  await expect(page.getByRole('region', { name: 'Why this difficulty' })).toBeVisible();

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
