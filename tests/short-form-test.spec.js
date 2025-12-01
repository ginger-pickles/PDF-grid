/**
 * Short-Form Test (SFT)
 *
 * Quick validation that basic functionality works.
 * Tests two states: initial page load and grid overview.
 *
 * Duration: <30 seconds
 * Files: Fast-loading PDFs (test-pattern.pdf, demo-1.pdf)
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');

// Test configuration
const TEST_PDF = 'demo/test-pattern.pdf';
const BASE_URL = 'http://localhost:8000';

test.describe('SFT: Short-Form Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupOfflineRoutes(page);
  });

  test('Two-state validation: initial view and overview', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      errors.push(`[PAGE ERROR] ${err.message}`);
    });

    console.log('\n========== SFT: SHORT-FORM TEST ==========\n');

    // === LOAD ===
    console.log('Loading PDF...');
    await page.goto(`${BASE_URL}/?pdf=${TEST_PDF}`);

    // Wait for viewer to exist
    await page.waitForFunction(() => window.viewer && window.tileStreamerRef, { timeout: 30000 });
    await page.waitForTimeout(500);

    // === STATE 1: INITIAL VIEW ===
    console.log('State 1: Initial view');

    const state1 = await page.evaluate(() => ({
      hasViewer: !!window.viewer,
      numPages: window.tileStreamerRef?.numPages || 0,
    }));

    expect(state1.hasViewer).toBe(true);
    expect(state1.numPages).toBeGreaterThan(0);
    console.log(`  Pages: ${state1.numPages} - OK`);

    // Brief observation at initial view
    await page.waitForTimeout(2000);

    // === STATE 2: OVERVIEW ===
    console.log('State 2: Zooming to overview...');

    // Zoom out to show entire grid
    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      if (ts && ts.gridDims) {
        // Calculate full grid bounds
        const aspectRatio = ts.gridDims.totalHeight / ts.gridDims.totalWidth;
        const rect = new OpenSeadragon.Rect(0, 0, 1, aspectRatio);
        window.viewer.viewport.fitBounds(rect, false);  // false = animate
      } else {
        window.viewer.viewport.goHome(false);
      }
    });

    // Wait for zoom animation
    await page.waitForTimeout(1500);

    // Observation at overview
    console.log('  Observing overview...');
    await page.waitForTimeout(5000);

    const state2 = await page.evaluate(() => ({
      zoom: window.viewer.viewport.getZoom(),
      boundsWidth: window.viewer.viewport.getBounds().width,
    }));

    console.log(`  Zoom: ${state2.zoom.toFixed(3)}, Width: ${state2.boundsWidth.toFixed(3)}`);
    expect(state2.boundsWidth).toBeGreaterThan(0.5);
    console.log('  State 2: OK');

    // === ERROR CHECK ===
    if (errors.length > 0) {
      console.log(`Errors: ${errors.length}`);
      errors.forEach(e => console.log(`  - ${e}`));
    }
    expect(errors.length).toBe(0);

    console.log('\n========== SFT: PASSED ==========\n');

    // Final pause for visual inspection
    await page.waitForTimeout(3000);
  });

});
