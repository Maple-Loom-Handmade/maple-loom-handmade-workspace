import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:3000';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './e2e' }),
  // The Next dev compiler is shared by both viewport projects. Serializing
  // this small accessibility suite prevents first-request route compilation
  // from racing and returning a transient 404.
  fullyParallel: false,
  workers: 1,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Playwright owns the test server lifecycle and waits for readiness before
     opening a page. A direct command avoids racing Nx's continuous target. */
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3000',
    // The application CSP intentionally permits HTTPS API connections only.
    // Use a non-routable HTTPS origin in browser tests; individual tests mock
    // the endpoints they exercise, while unmocked requests fail harmlessly.
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: 'https://api.ezihubb.test',
      NEXTAUTH_URL: 'http://127.0.0.1:3000',
      NEXTAUTH_SECRET: 'playwright-local-only-not-a-production-secret',
    },
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    // A cold Next/Nx cache can spend more than Playwright's 60s default on
    // the first App Router compilation, especially on shared CI runners.
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
