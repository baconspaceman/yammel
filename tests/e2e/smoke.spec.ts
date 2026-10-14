import { expect, test } from './fixtures';

test('the app window opens, renders, and is locked down', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  expect(await page.title()).toBe('Yammel');

  // The only door to the main process is the small api object; Node itself is not reachable.
  const exposed = await page.evaluate(() => ({
    api: Object.keys((window as unknown as { api: object }).api).sort(),
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
  }));
  expect(exposed.api).toEqual(['askHelper', 'cancelGenerate', 'cancelScan', 'clearRecent', 'closeHelperWindow', 'countChecks', 'customWorldsStatus', 'generate', 'generatorStatus', 'getHelperSnapshot', 'getSettings', 'helperStatus', 'hostFiles', 'isHelperWindowOpen', 'loadPresets', 'loadRecommender', 'loadSchema', 'onHelperAction', 'onHelperSnapshot', 'onHelperWindow', 'openHelperWindow', 'openRecent', 'openYaml', 'pickArchipelagoFolder', 'pickCustomWorlds', 'pickHostPath', 'pickPlayerYamls', 'pickPythonFile', 'publishHelper', 'readHost', 'recentFiles', 'revealSeed', 'savePresets', 'saveRecommender', 'saveSettings', 'saveYaml', 'saveYamlFolder', 'scanCustomWorlds', 'sendHelperAction', 'setOpenRouterKey', 'writeHost']);
  expect(exposed.require).toBe('undefined');
  expect(exposed.process).toBe('undefined');
});
