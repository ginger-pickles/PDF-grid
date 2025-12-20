/**
 * Playwright Configuration for PDF-grid Memory Tests
 *
 * See https://playwright.dev/docs/test-configuration
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  // Output directory for Playwright artifacts (videos, traces)
  // Use subdirectory to avoid deleting our custom HTML reports in test-results/
  outputDir: 'test-results/.playwright-artifacts',

  // Maximum time one test can run
  timeout: 60 * 1000, // Increased for slower, more realistic panning tests

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
    // Base URL for tests (nginx server or override with TEST_BASE_URL env var)
    baseURL: process.env.TEST_BASE_URL || 'http://pdf.cats.local',

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
    {
      name: 'chromium',
      use: {
        // Mobile-size viewport for economy
        viewport: { width: 375, height: 667 },
      },
    },
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
