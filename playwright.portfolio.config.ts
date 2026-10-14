import { defineConfig } from '@playwright/test';

// Not part of the normal test run. Makes the screenshots for the portfolio folder: npx playwright test -c playwright.portfolio.config.ts
export default defineConfig({
  testDir: 'tests/portfolio',
  testMatch: '**/*.spec.ts',
  timeout: 600_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
