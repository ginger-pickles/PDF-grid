/**
 * Short-Form Test (SFT)
 *
 * Quick validation that basic functionality works.
 * Tests two states: initial page load and grid overview.
 * Outputs HTML report to test-results/sft-report.html
 *
 * Duration: <30 seconds
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');
const fs = require('fs');
const path = require('path');

const TEST_PDF = 'demo/test-pattern.pdf';
const BASE_URL = 'http://localhost:8000';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');

function generateHTML(results) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>SFT Report - ${new Date().toISOString()}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #1a1a1a; color: #eee; }
    h1 { border-bottom: 2px solid #444; padding-bottom: 10px; }
    .state { margin: 20px 0; padding: 20px; background: #2a2a2a; border-radius: 8px; }
    .state h2 { margin-top: 0; }
    .screenshot { max-width: 100%; border: 1px solid #444; border-radius: 4px; }
    .pass { color: #4f4; }
    .fail { color: #f44; }
    .metrics { font-family: monospace; background: #333; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .summary { font-size: 1.5em; padding: 20px; text-align: center; border-radius: 8px; margin-top: 20px; }
    .summary.pass { background: #143; }
    .summary.fail { background: #411; }
  </style>
</head>
<body>
  <h1>SFT: Short-Form Test</h1>
  <p>PDF: ${results.pdf} | Run: ${results.timestamp}</p>

  <div class="state">
    <h2>State 1: Initial View</h2>
    <div class="metrics">
      Pages: ${results.state1.numPages} |
      Visual Content: <span class="${results.state1.hasContent ? 'pass' : 'fail'}">${results.state1.hasContent ? 'YES' : 'NO'}</span>
    </div>
    <img class="screenshot" src="data:image/png;base64,${results.state1.screenshot}" alt="State 1">
  </div>

  <div class="state">
    <h2>State 2: Grid Overview</h2>
    <div class="metrics">
      Zoom: ${results.state2.zoom} |
      Bounds Width: ${results.state2.boundsWidth} |
      Visual Content: <span class="${results.state2.hasContent ? 'pass' : 'fail'}">${results.state2.hasContent ? 'YES' : 'NO'}</span>
    </div>
    <img class="screenshot" src="data:image/png;base64,${results.state2.screenshot}" alt="State 2">
  </div>

  ${results.errors.length > 0 ? `
  <div class="state">
    <h2 class="fail">Errors (${results.errors.length})</h2>
    <pre>${results.errors.join('\n')}</pre>
  </div>
  ` : ''}

  <div class="summary ${results.passed ? 'pass' : 'fail'}">
    ${results.passed ? 'PASSED' : 'FAILED'}
  </div>
</body>
</html>`;
}

test.describe('SFT: Short-Form Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupOfflineRoutes(page);
  });

  test('Two-state validation with HTML report', async ({ page }) => {
    const results = {
      pdf: TEST_PDF,
      timestamp: new Date().toISOString(),
      state1: {},
      state2: {},
      errors: [],
      passed: false
    };

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
    await page.waitForTimeout(1500);

    // === STATE 1: INITIAL VIEW ===
    const state1Data = await page.evaluate(() => ({
      hasViewer: !!window.viewer,
      numPages: window.tileStreamerRef?.numPages || 0,
    }));

    const state1Screenshot = await page.screenshot({ type: 'png' });
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

    results.state1 = {
      numPages: state1Data.numPages,
      hasContent: state1HasContent,
      screenshot: state1Screenshot.toString('base64')
    };

    // === STATE 2: OVERVIEW ===
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

    results.state2 = {
      zoom: state2Data.zoom.toFixed(3),
      boundsWidth: state2Data.boundsWidth.toFixed(3),
      hasContent: state2HasContent,
      screenshot: state2Screenshot.toString('base64')
    };

    // === DETERMINE PASS/FAIL ===
    results.passed = state1Data.numPages > 0 &&
                     state1HasContent &&
                     state2HasContent &&
                     results.errors.length === 0;

    // === WRITE HTML REPORT ===
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    const reportPath = path.join(RESULTS_DIR, 'sft-report.html');
    fs.writeFileSync(reportPath, generateHTML(results));
    console.log(`\nHTML report: ${reportPath}\n`);

    // === ASSERTIONS ===
    expect(state1Data.numPages).toBeGreaterThan(0);
    expect(state1HasContent, 'State 1: No visual content').toBe(true);
    expect(state2HasContent, 'State 2: No visual content').toBe(true);
    expect(results.errors.length, 'Console errors detected').toBe(0);
  });
});
