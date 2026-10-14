import { expect, test } from './fixtures';

// The biggest game in the real data (Ocarina of Time, 150+ options) must stay responsive.
// Limits are generous so slow machines do not flake; they exist to catch accidental O(n^2) re-rendering.

test('opening the biggest game is quick', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
  const ms = await page.evaluate(async () => {
    const button = Array.from(document.querySelectorAll<HTMLElement>('.gamelist__item')).find((b) =>
      (b.textContent ?? '').startsWith('Ocarina of Time'),
    )!;
    const start = performance.now();
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return performance.now() - start;
  });
  console.log(`open game -> painted: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(1500);
});

test('editing and searching stay fast with every option on the page', async ({ page }) => {
  await page.getByRole('button', { name: /^Ocarina of Time/ }).click();
  await expect(page.getByRole('region', { name: 'About this YAML' })).toBeVisible();
  for (const toggle of await page.locator('.group__title button[aria-expanded="false"]').all()) await toggle.click();
  expect(await page.locator('article.option').count()).toBeGreaterThan(140);

  const toggleMs = await page.evaluate(async () => {
    const sw = document.querySelector<HTMLElement>('article.option [role="switch"]')!;
    const start = performance.now();
    sw.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return performance.now() - start;
  });
  console.log(`toggle -> painted: ${toggleMs.toFixed(0)} ms`);
  expect(toggleMs).toBeLessThan(400);
  await expect(page.locator('.yaml')).toContainText(': true');

  const searchMs = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search options"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const start = performance.now();
    setter.call(input, 'shuffle');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return performance.now() - start;
  });
  console.log(`search -> painted: ${searchMs.toFixed(0)} ms`);
  expect(searchMs).toBeLessThan(600);
});
