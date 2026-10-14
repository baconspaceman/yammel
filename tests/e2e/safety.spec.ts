import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { answerSaveDialog, MINI_SCHEMA } from './helpers';

test.use({ schema: MINI_SCHEMA });

test.describe('closing the window', () => {
  test('asks before throwing away unsaved changes, and lets the user keep editing', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await page.locator('article[data-key="hard_mode"]').getByRole('switch').click();

    await app.evaluate(({ BrowserWindow, dialog }) => {
      (globalThis as Record<string, unknown>)['asked'] = 0;
      dialog.showMessageBoxSync = (() => {
        (globalThis as Record<string, unknown>)['asked'] = Number((globalThis as Record<string, unknown>)['asked']) + 1;
        return 0; // "Keep editing"
      }) as typeof dialog.showMessageBoxSync;
      BrowserWindow.getAllWindows()[0]!.close();
    });
    await expect.poll(() => app.evaluate(() => Number((globalThis as Record<string, unknown>)['asked']))).toBe(1);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(page.locator('.yaml')).toContainText('hard_mode: true');
  });

  test('closes without asking when there is nothing unsaved', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = (() => {
        throw new Error('should not ask');
      }) as typeof dialog.showMessageBoxSync;
    });
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close()).catch(() => undefined);
    await closed;
  });
});

test.describe('what the page is allowed to do', () => {
  test('saving to a path the user never picked asks for a location instead of writing there', async ({ app, page }) => {
    await answerSaveDialog(app, null); // the user cancels the dialog the app shows
    const victim = join(mkdtempSync(join(tmpdir(), 'yamled-evil-')), 'victim.yaml');
    const result = await page.evaluate(
      (path) => window.api.saveYaml({ path, text: 'overwritten: true\n', suggestedName: 'x' }),
      victim,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(existsSync(victim)).toBe(false);
  });

  test('a malformed save request is rejected', async ({ page }) => {
    const result = await page.evaluate(() =>
      (window.api.saveYaml as unknown as (r: unknown) => Promise<unknown>)({ path: 42, text: 'x', suggestedName: 'x' }),
    );
    expect(result).toEqual({ ok: false, message: 'That save request was not valid.' });
  });

  test('the window cannot navigate away or open new windows', async ({ app, page }) => {
    const before = page.url();
    await page.evaluate(() => {
      window.location.href = 'https://example.com/';
    });
    await page.waitForTimeout(500);
    expect(page.url()).toBe(before);

    const opened = await page.evaluate(() => window.open('https://example.com/') === null);
    expect(opened).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });

  test('scripts from other places cannot run (content security policy)', async ({ page }) => {
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    const ran = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true';
      document.head.appendChild(script);
      return (window as unknown as { __injected?: boolean }).__injected === true;
    });
    expect(ran).toBe(false);
  });
});

test.describe('closing with the guard answered "Discard changes"', () => {
  test('really closes the app', async ({ app, page }) => {
    await page.getByRole('button', { name: /^Demo Game/ }).click();
    await page.locator('article[data-key="hard_mode"]').getByRole('switch').click();
    await expect(page.locator('.yaml')).toContainText('hard_mode: true');

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync; // "Discard changes"
    });
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close()).catch(() => undefined);
    await closed;
  });
});
