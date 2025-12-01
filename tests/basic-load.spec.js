/**
 * Basic Load Test
 *
 * Verifies PDF Grid Viewer can load and initialize.
 * This test works in restricted sandbox environments (no GPU).
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');

const TEST_PDF = 'demo/test-pattern.pdf';
const BASE_URL = 'http://localhost:8000';

test.describe('Basic Load Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupOfflineRoutes(page);
  });

  test('PDF loads and viewer initializes', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      errors.push(`[PAGE ERROR] ${err.message}`);
    });

    console.log('\n========== BASIC LOAD TEST ==========\n');

    // Load the page with PDF
    console.log('Loading PDF...');
    await page.goto(`${BASE_URL}/?pdf=${TEST_PDF}`);

    // Wait for viewer using polling (more reliable in sandbox)
    let viewerReady = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      viewerReady = await page.evaluate(() => !!(window.viewer && window.tileStreamerRef));
      if (viewerReady) break;
    }

    expect(viewerReady, 'Viewer should initialize within 5 seconds').toBe(true);
    console.log('  Viewer initialized - OK');

    // Check page count
    const numPages = await page.evaluate(() => window.tileStreamerRef?.numPages || 0);
    expect(numPages).toBeGreaterThan(0);
    console.log(`  PDF loaded: ${numPages} pages - OK`);

    // Check for console errors
    if (errors.length > 0) {
      console.log(`  Console errors: ${errors.length}`);
      errors.forEach(e => console.log(`    - ${e}`));
    }
    expect(errors.length, 'Should have no console errors').toBe(0);

    console.log('\n========== BASIC LOAD TEST: PASSED ==========\n');
  });

});
