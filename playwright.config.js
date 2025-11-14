/**
 * Playwright Configuration for PDF-grid Memory Tests
 *
 * See https://playwright.dev/docs/test-configuration
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  // Maximum time one test can run
  timeout: 30 * 1000,

  expect: {
    // Maximum time for expect() assertions
    timeout: 5000
  },

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: 'html',

  // Shared settings for all the projects below
  use: {
    // Base URL for tests (assumes dev server running on port 8000)
    baseURL: 'http://localhost:8000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshots on failure
    screenshot: 'only-on-failure',

    // Video for all tests (so you can review test behavior)
    video: 'on',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Disabled for faster test runs (uncomment if needed)
    // {
    //   name: 'chromium',
    //   use: { ...devices['Desktop Chrome'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 13'] },
    // },
  ],

  // Don't start dev server automatically - user should start manually
  // This allows testing against the existing HTTP server
  // webServer: {
  //   command: 'python3 -m http.server 8000',
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
