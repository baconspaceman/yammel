import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import { closeApp, launch } from './helpers';

interface Fixtures {
  /** Path to a schema.json to use instead of the real one (set with test.use({ schema })). */
  schema: string | undefined;
  /** Extra environment variables for the app (set with test.use({ extraEnv })), e.g. to point at no engine. */
  extraEnv: Record<string, string>;
  app: ElectronApplication;
  page: Page;
  /** The throwaway user-data folder of this run (backups are written under it). */
  userData: string;
}

/** Every test gets its own freshly started app that is always closed afterwards. */
export const test = base.extend<Fixtures & { launched: { app: ElectronApplication; page: Page; userData: string } }>({
  schema: [undefined, { option: true }],
  extraEnv: [{}, { option: true }],
  launched: async ({ schema, extraEnv }, use) => {
    const launched = await launch(schema === undefined ? { env: extraEnv } : { schema, env: extraEnv });
    try {
      await use(launched);
    } finally {
      await closeApp(launched.app);
    }
  },
  app: async ({ launched }, use) => use(launched.app),
  page: async ({ launched }, use) => use(launched.page),
  userData: async ({ launched }, use) => use(launched.userData),
});

export { expect } from '@playwright/test';
