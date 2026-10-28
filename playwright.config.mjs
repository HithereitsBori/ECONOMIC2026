import { defineConfig, devices } from '@playwright/test';

// WebKit could not be installed on this build host, so the "iphone" project runs the
// iPhone 13 viewport/UA on Chromium. Real iOS Safari must be covered in device QA (T14).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  outputDir: 'test-results/artifacts',
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    serviceWorkers: 'block',
  },
  webServer: {
    // build the 5 e2e sites first (webServer runs before globalSetup), then serve them
    command: 'node tests/e2e/build-e2e.mjs && node scripts/serve.mjs --dir .tmp/e2e --port 4173',
    url: 'http://localhost:4173/attendee/',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
  ],
});
