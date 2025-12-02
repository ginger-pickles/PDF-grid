/**
 * Short-Form Test (SFT)
 *
 * Quick validation that basic functionality works.
 * Tests two states: initial page load and grid overview.
 * Outputs JSON to test-results/sft-results.json
 *
 * Duration: <30 seconds
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');
const fs = require('fs');
const path = require('path');

const TEST_PDF = process.env.TEST_PDF || 'demo/test-pattern.pdf';
const BASE_URL = 'http://localhost:8000';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const VIEWPORT = { width: 375, height: 667 };

// Save screenshot to file, return relative path
function saveScreenshot(buffer, filename) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `screenshots/${filename}`;
}

test.describe('SFT: Short-Form Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupOfflineRoutes(page);
  });

  test('Two-state validation with JSON report', async ({ page }) => {
    const results = {
      testType: 'sft',
      pdf: TEST_PDF,
      timestamp: new Date().toISOString(),
      viewport: VIEWPORT,
      phases: [],
      errors: [],
      totalDuration: 0,
      passed: false
    };

    const startTime = Date.now();

    // Set viewport
    await page.setViewportSize(VIEWPORT);

    page.on('console', msg => {
      if (msg.type() === 'error') {
        results.errors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      results.errors.push(`[PAGE ERROR] ${err.message}`);
    });

    // === LOAD ===
    await page.goto(`${BASE_URL}/?pdf=${TEST_PDF}`);
    await page.waitForFunction(() => window.viewer && window.tileStreamerRef, { timeout: 30000 });
    await page.waitForTimeout(3000); // Allow tiles to render

    // === PHASE 1: INITIAL VIEW ===
    const p1Start = Date.now();
    const state1Data = await page.evaluate(() => ({
      hasViewer: !!window.viewer,
      numPages: window.tileStreamerRef?.numPages || 0,
    }));

    const state1Screenshot = await page.screenshot({ type: 'png' });
    const state1File = saveScreenshot(state1Screenshot, 'sft-state1-initial.png');

    const state1HasContent = await page.evaluate(() => {
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
      return colors.size >= 10;
    });

    results.phases.push({
      name: 'State 1: Initial View',
      duration: Date.now() - p1Start,
      metrics: {
        numPages: state1Data.numPages,
        hasContent: state1HasContent
      },
      screenshots: [
        { label: 'Initial load', file: state1File }
      ]
    });

    // === PHASE 2: GRID OVERVIEW ===
    const p2Start = Date.now();
    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      if (ts && ts.gridDims) {
        const aspectRatio = ts.gridDims.totalHeight / ts.gridDims.totalWidth;
        const rect = new OpenSeadragon.Rect(0, 0, 1, aspectRatio);
        window.viewer.viewport.fitBounds(rect, false);
      } else {
        window.viewer.viewport.goHome(false);
      }
    });

    await page.waitForTimeout(3000);

    const state2Data = await page.evaluate(() => ({
      zoom: window.viewer.viewport.getZoom(),
      boundsWidth: window.viewer.viewport.getBounds().width,
    }));

    const state2Screenshot = await page.screenshot({ type: 'png' });
    const state2File = saveScreenshot(state2Screenshot, 'sft-state2-grid.png');

    const state2HasContent = await page.evaluate(() => {
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      const colors = new Set();
      for (let i = 0; i < 100; i++) {
        const x = Math.floor(Math.random() * canvas.width);
        const y = Math.floor(Math.random() * canvas.height);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
      }
      return colors.size >= 10;
    });

    results.phases.push({
      name: 'State 2: Grid Overview',
      duration: Date.now() - p2Start,
      metrics: {
        zoom: parseFloat(state2Data.zoom.toFixed(3)),
        boundsWidth: parseFloat(state2Data.boundsWidth.toFixed(3)),
        hasContent: state2HasContent
      },
      screenshots: [
        { label: 'Grid view', file: state2File }
      ]
    });

    // === FINALIZE ===
    results.totalDuration = Date.now() - startTime;
    results.passed = state1Data.numPages > 0 &&
                     state1HasContent &&
                     state2HasContent &&
                     results.errors.length === 0;

    // === WRITE JSON RESULTS ===
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    const jsonPath = path.join(RESULTS_DIR, 'sft-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults: ${jsonPath}`);
    console.log(`Passed: ${results.passed}\n`);

    // === ASSERTIONS ===
    expect(state1Data.numPages, 'No pages loaded').toBeGreaterThan(0);
    expect(state1HasContent, 'State 1: No visual content').toBe(true);
    expect(state2HasContent, 'State 2: No visual content').toBe(true);
    expect(results.errors.length, 'Console errors detected').toBe(0);
  });
});
