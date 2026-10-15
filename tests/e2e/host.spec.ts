import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { setWindowSize, setZoom } from './helpers';
import { checkEverything } from './layoutCheck';

// A pretend installed Archipelago in a throwaway folder, and no source folder, so the real host.yaml files are never in reach.
const PROGRAM_DATA = mkdtempSync(join(tmpdir(), 'yamled-programdata-'));
const INSTALL = join(PROGRAM_DATA, 'Archipelago');
const HOST = join(INSTALL, 'host.yaml');
const SAMPLE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'host-sample.yaml'), 'utf8').replace(/\r?\n/g, '\r\n');

mkdirSync(INSTALL, { recursive: true });
writeFileSync(join(INSTALL, 'ArchipelagoLauncher.exe'), 'not a real program');
test.use({ extraEnv: { ProgramData: PROGRAM_DATA, ARCHIPELAGO_AP_ROOT: join(tmpdir(), 'no-such-archipelago-folder') } });
test.beforeEach(() => writeFileSync(HOST, SAMPLE, 'utf8'));

const openHost = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Open host.yaml settings' }).click();
  await expect(page.getByRole('heading', { name: /own settings/ })).toBeVisible();
  await expect(page.getByTestId('host-path')).toContainText(HOST);
};

test('shows every setting with the file\'s own explanation, and nothing is written until you save', async ({ page }) => {
  await openHost(page);
  await expect(page.getByLabel('Port', { exact: true })).toHaveValue('38281');
  await expect(page.getByText('Where to place output files')).toBeVisible();
  await expect(page.getByLabel('Release mode')).toHaveValue('auto');
  await expect(page.getByLabel('Spoiler', { exact: true })).toHaveValue('3');
  expect(readFileSync(HOST, 'utf8')).toBe(SAMPLE);
});

test('a change is reviewed line by line, saved with CRLF kept, and the old file is backed up', async ({ page, userData }) => {
  await openHost(page);
  await page.getByLabel('Port', { exact: true }).fill('4000');
  await page.getByLabel('Port', { exact: true }).press('Enter');
  await page.getByLabel('Disable save').click();
  await expect(page.getByText('2 changes waiting.')).toBeVisible();
  await page.getByRole('button', { name: /Review and save/ }).click();
  const diff = page.getByLabel('Changed lines');
  await expect(diff).toContainText('-   port: 38281');
  await expect(diff).toContainText('+   port: 4000');
  await expect(diff).toContainText('+   disable_save: true');
  expect(readFileSync(HOST, 'utf8')).toBe(SAMPLE); // still untouched at review
  await page.getByRole('button', { name: 'Save to host.yaml' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved\./ })).toBeVisible();

  const after = readFileSync(HOST, 'utf8');
  expect(after).toBe(SAMPLE.replace('  port: 38281', '  port: 4000').replace('  disable_save: false', '  disable_save: true'));
  expect(after.replace(/\r\n/g, '').includes('\n')).toBe(false);
  const backups = readdirSync(join(userData, 'backups')).filter((file) => file.startsWith('host.yaml.'));
  expect(backups).toHaveLength(1);
  expect(readFileSync(join(userData, 'backups', backups[0]!), 'utf8')).toBe(SAMPLE);
  expect(readdirSync(INSTALL).sort()).toEqual(['ArchipelagoLauncher.exe', 'host.yaml']);
});

test('a half-typed or wrong number never reaches the file', async ({ page }) => {
  await openHost(page);
  const port = page.getByLabel('Port', { exact: true });
  await port.fill('12ab');
  await port.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Type a number.' })).toBeVisible();
  await expect(page.getByText('No changes yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Review and save/ })).toBeDisabled();
});

test('Discard puts everything back, and Back asks before throwing changes away', async ({ page }) => {
  await openHost(page);
  const port = page.getByLabel('Port', { exact: true });
  await port.fill('5000');
  await port.press('Enter');
  await expect(page.getByText('1 change waiting.')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'You have 1 unsaved change.' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(port).toHaveValue('38281');
  await expect(page.getByText('No changes yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

test('refuses to overwrite a file that something else changed meanwhile', async ({ page }) => {
  await openHost(page);
  const port = page.getByLabel('Port', { exact: true });
  await port.fill('6000');
  await port.press('Enter');
  const other = SAMPLE.replace('  port: 38281', '  port: 1234');
  writeFileSync(HOST, other, 'utf8');
  await page.getByRole('button', { name: /Review and save/ }).click();
  await page.getByRole('button', { name: 'Save to host.yaml' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'changed by something else' })).toBeVisible();
  expect(readFileSync(HOST, 'utf8')).toBe(other);
  await page.getByRole('button', { name: 'Reload the file' }).click();
  await expect(port).toHaveValue('1234');
});

test('search narrows the list, and path settings get file and folder pickers', async ({ app, page }) => {
  await openHost(page);
  await page.getByLabel('Find a setting').fill('rom');
  await expect(page.getByLabel('Rom file')).toBeVisible();
  await expect(page.getByLabel('Port', { exact: true })).toHaveCount(0);
  const chosen = join(tmpdir(), 'my-rom.nes');
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, chosen);
  await page.locator('.host__entry').filter({ has: page.getByLabel('Rom file', { exact: true }) }).getByRole('button', { name: /Pick a file/ }).click();
  await expect(page.getByLabel('Rom file', { exact: true })).toHaveValue(chosen.replace(/\\/g, '/'));
});

test('says plainly when there is no host.yaml yet, and changes nothing', async ({ page }) => {
  const moved = HOST + '.away';
  const { renameSync } = await import('node:fs');
  renameSync(HOST, moved);
  try {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Open host.yaml settings' }).click();
    await expect(page.getByText(/has not made a host\.yaml yet/)).toBeVisible();
    expect(existsSync(HOST)).toBe(false);
  } finally {
    renameSync(moved, HOST);
  }
});

test('the page cannot read or write any file it was not told about', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const api = window.api as unknown as Record<string, (arg: unknown) => Promise<{ ok: boolean }>>;
    return [
      await api['readHost']!('C:\\Windows\\win.ini'),
      await api['writeHost']!({ id: '../../x', text: 'a: 1\n', expected: '' }),
      await api['writeHost']!({ id: 'installed', text: 5, expected: '' }),
    ];
  });
  expect(result.every((reply) => !reply.ok)).toBe(true);
  expect(readFileSync(HOST, 'utf8')).toBe(SAMPLE);
});

test('the host.yaml page never overlaps or clips text, in both themes, small windows and zoom', async ({ app, page }) => {
  await openHost(page);
  await page.getByLabel('Port', { exact: true }).fill('7000');
  await page.getByLabel('Port', { exact: true }).press('Enter');
  await page.getByRole('button', { name: /Review and save/ }).click();
  await expect(page.getByLabel('Changed lines')).toBeVisible();
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
      expect(report.textBoxes, `${scheme} ${width}x${height} at ${zoom * 100}%`).toBeGreaterThan(15);
      expect(report.problems, `${scheme} ${width}x${height} at ${zoom * 100}%`).toEqual([]);
    }
  }
});

test('a path that points at nothing gets a quiet note, a found one does not, and saving is never blocked', async ({ page }) => {
  mkdirSync(join(INSTALL, 'Players'), { recursive: true });
  await openHost(page);
  // "Players" exists next to the host.yaml; "weights.yaml" and "output" do not.
  await expect(page.getByTestId('missing-weights_file_path')).toContainText('Not found on this computer');
  await expect(page.getByTestId('missing-output_path')).toBeVisible();
  await expect(page.getByTestId('missing-player_files_path')).toHaveCount(0);
  await expect(page.getByTestId('host-paths-summary')).toContainText('point at something that is not on this computer');

  // Pointing it at something that exists clears the note.
  await page.getByLabel('Output path').fill('Players');
  await page.getByLabel('Output path').press('Enter');
  await expect(page.getByTestId('missing-output_path')).toHaveCount(0);

  // Changing it to something missing shows the note again, and the file can still be saved.
  await page.getByLabel('Output path').fill('nowhere-at-all');
  await page.getByLabel('Output path').press('Enter');
  await expect(page.getByTestId('missing-output_path')).toBeVisible();
  await expect(page.getByRole('button', { name: /Review and save/ })).toBeEnabled();

  // Creating the folder and pressing "Check again" clears it.
  mkdirSync(join(INSTALL, 'nowhere-at-all'), { recursive: true });
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByTestId('missing-output_path')).toHaveCount(0);
});
