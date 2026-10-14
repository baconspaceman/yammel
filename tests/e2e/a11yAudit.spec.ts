import { expect, test } from './fixtures';
import { auditAccessibility, auditKeyboard } from './a11yCheck';

// The audit is only worth anything if it really finds problems. These tests plant some and check each one is reported,
// and that a clean screen reports none.

test('a clean screen has no accessibility problems', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  expect(await auditAccessibility(page)).toEqual([]);
  expect(await auditKeyboard(page)).toEqual([]);
});

test('planted problems are all found', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'planted';
    host.innerHTML = `
      <button id="unnamed-button"></button>
      <input id="unnamed-input" type="text">
      <img id="no-alt" width="10" height="10" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <p id="dup">one</p><p id="dup">two</p>
      <p id="faint" style="color:#8a8a8a;background:#9a9a9a;padding:4px">hard to read text</p>`;
    document.body.prepend(host);
  });
  const problems = (await auditAccessibility(page)).join('\n');
  expect(problems).toContain('no accessible name: button#unnamed-button');
  expect(problems).toContain('no accessible name: input#unnamed-input');
  expect(problems).toContain('picture without alt text: img#no-alt');
  expect(problems).toContain('id "dup" is used 2 times');
  expect(problems).toMatch(/low contrast [\d.]+:1 \(needs 4\.5\): p#faint/);
});

test('a resting shadow is not mistaken for a focus ring, and faded text is judged as it really looks', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  await page.addStyleTag({ content: 'button { box-shadow: 0 1px 2px rgba(0,0,0,.4) !important; } *:focus, *:focus-visible { outline: none !important; }' });
  const keyboard = await auditKeyboard(page, 4);
  expect(keyboard.some((problem) => problem.startsWith('no visible keyboard focus'))).toBe(true);
  await page.evaluate(() => {
    const fade = document.createElement('div');
    fade.style.cssText = 'opacity:.4';
    fade.innerHTML = '<p id="faded" style="margin:0;padding:4px;color:#e8ebf1">text that has been faded out</p>';
    document.body.prepend(fade);
  });
  expect((await auditAccessibility(page)).join('\n')).toMatch(/low contrast [\d.]+:1 \(needs 4\.5\): p#faded/);
});

test('a missing keyboard focus ring is found', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Make a YAML for Archipelago' })).toBeVisible();
  await page.addStyleTag({ content: '*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }' });
  const problems = await auditKeyboard(page, 4);
  expect(problems.some((problem) => problem.startsWith('no visible keyboard focus'))).toBe(true);
});
