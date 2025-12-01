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

// Exteroceptive: Check if screenshot shows actual content (not blank)
async function hasVisualContent(page, minUniqueColors = 10) {
  const screenshot = await page.screenshot({ type: 'png' });
  // PNG has header + data; a blank image compresses very small
  // Real content with variety will be larger
  // Also check via canvas sampling
  return await page.evaluate((minColors) => {
    const canvas = document.querySelector('.openseadragon-canvas canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (canvas.width === 0 || canvas.height === 0) return false;
    const colors = new Set();
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * canvas.width);
      const y = Math.floor(Math.random() * canvas.height);
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
    }
    return colors.size >= minColors;
  }, minUniqueColors);
}

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

    // Interoceptive checks
    const state1 = await page.evaluate(() => ({
      hasViewer: !!window.viewer,
      numPages: window.tileStreamerRef?.numPages || 0,
    }));
    expect(state1.hasViewer).toBe(true);
    expect(state1.numPages).toBeGreaterThan(0);
    console.log(`  Interoceptive: ${state1.numPages} pages - OK`);

    // Exteroceptive check: wait for visible content
    await page.waitForTimeout(1000);
    const visual1 = await hasVisualContent(page);
    expect(visual1, 'State 1: No visual content on screen').toBe(true);
    console.log('  Exteroceptive: Visual content present - OK');

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

    // Wait for zoom to settle
    await page.waitForTimeout(2000);

    // Interoceptive checks
    const state2 = await page.evaluate(() => ({
      zoom: window.viewer.viewport.getZoom(),
      boundsWidth: window.viewer.viewport.getBounds().width,
    }));
    expect(state2.boundsWidth).toBeGreaterThan(0.5);
    console.log(`  Interoceptive: Zoom=${state2.zoom.toFixed(3)}, Width=${state2.boundsWidth.toFixed(3)} - OK`);

    // Exteroceptive check: visual content still present after zoom
    const visual2 = await hasVisualContent(page);
    expect(visual2, 'State 2: No visual content on screen after zoom').toBe(true);
    console.log('  Exteroceptive: Visual content present - OK');

    // === ERROR CHECK ===
    if (errors.length > 0) {
      console.log(`Errors: ${errors.length}`);
      errors.forEach(e => console.log(`  - ${e}`));
    }
    expect(errors.length).toBe(0);

    console.log('\n========== SFT: PASSED ==========\n');
  });

});
