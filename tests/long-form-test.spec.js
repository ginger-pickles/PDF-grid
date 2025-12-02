/**
 * Long-Form Test (LFT)
 *
 * Detects visual flicker by capturing screenshots at key moments.
 * Outputs HTML report to test-results/lft-report.html
 *
 * Phases: Load -> Settle (Grid/Detail temporarily disabled)
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');
const fs = require('fs');
const path = require('path');

const TEST_PDF = process.env.TEST_PDF || 'demo/ginger-pickles.pdf';
const BASE_URL = 'http://localhost:8000';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const FLICKER_THRESHOLD = 5; // % of pixels changed to count as flicker
const VIEWPORT = { width: 375, height: 667 }; // Mobile viewport for test economy

// Save screenshot to file, return relative path
function saveScreenshot(buffer, filename) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `screenshots/${filename}`;
}

// Compare two screenshots, return % difference
async function compareScreenshots(page, shot1, shot2) {
  return await page.evaluate(([b64_1, b64_2]) => {
    return new Promise((resolve) => {
      const img1 = new Image();
      const img2 = new Image();
      let loaded = 0;

      const onLoad = () => {
        loaded++;
        if (loaded < 2) return;

        const canvas = document.createElement('canvas');
        canvas.width = img1.width;
        canvas.height = img1.height;
        const ctx = canvas.getContext('2d');

        // Draw and get pixels from first image
        ctx.drawImage(img1, 0, 0);
        const data1 = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Draw and get pixels from second image
        ctx.drawImage(img2, 0, 0);
        const data2 = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Compare
        let diffPixels = 0;
        const totalPixels = canvas.width * canvas.height;
        for (let i = 0; i < data1.length; i += 4) {
          const dr = Math.abs(data1[i] - data2[i]);
          const dg = Math.abs(data1[i+1] - data2[i+1]);
          const db = Math.abs(data1[i+2] - data2[i+2]);
          if (dr > 10 || dg > 10 || db > 10) diffPixels++;
        }

        resolve((diffPixels / totalPixels) * 100);
      };

      img1.onload = onLoad;
      img2.onload = onLoad;
      img1.src = 'data:image/png;base64,' + b64_1;
      img2.src = 'data:image/png;base64,' + b64_2;
    });
  }, [shot1, shot2]);
}

test.describe('LFT: Long-Form Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupOfflineRoutes(page);
  });

  test('Flicker detection with HTML report', async ({ page }) => {
    test.setTimeout(120000);

    const results = {
      testType: 'lft',
      pdf: TEST_PDF,
      timestamp: new Date().toISOString(),
      viewport: VIEWPORT,
      phases: [],
      errors: [],
      totalFlickers: 0,
      totalDuration: 0,
      passed: false
    };

    // Set viewport to match test parameters
    await page.setViewportSize(VIEWPORT);

    const startTime = Date.now();

    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('timeout')) {
        results.errors.push(msg.text());
      }
    });

    // === PHASE 1: LOAD ===
    const p1Start = Date.now();
    await page.goto(`${BASE_URL}/?pdf=${TEST_PDF}`);
    await page.waitForFunction(() => window.viewer && window.tileStreamerRef, { timeout: 30000 });

    const loadShots = [];
    const loadDiffs = [];
    const P1_SAMPLE_INTERVAL = 250; // ms between samples
    const P1_SAMPLE_COUNT = 12;     // 3 seconds total
    let p1PrevBuffer = null;

    // Sample during load period
    for (let i = 0; i < P1_SAMPLE_COUNT; i++) {
      await page.waitForTimeout(P1_SAMPLE_INTERVAL);
      const shot = await page.screenshot({ type: 'png' });
      const b64 = shot.toString('base64');
      const filename = `p1-load-${String(i+1).padStart(2, '0')}.png`;
      const filepath = saveScreenshot(shot, filename);

      // Compare to previous frame
      if (p1PrevBuffer) {
        const prevB64 = p1PrevBuffer.toString('base64');
        const diff = await compareScreenshots(page, prevB64, b64);
        loadDiffs.push(diff);
        loadShots.push({
          label: `+${(i+1)*P1_SAMPLE_INTERVAL}ms (${diff.toFixed(1)}%)`,
          file: filepath
        });
      } else {
        loadShots.push({
          label: `+${(i+1)*P1_SAMPLE_INTERVAL}ms (baseline)`,
          file: filepath
        });
      }
      p1PrevBuffer = shot;
    }

    results.phases.push({
      name: 'Phase 1: Load',
      duration: Date.now() - p1Start,
      flickers: 0,
      note: 'Content building during load',
      diffs: loadDiffs.map(d => parseFloat(d.toFixed(1))),
      screenshots: loadShots
    });

    // === PHASE 2: SETTLE (flicker detection) ===
    const p2Start = Date.now();
    const settleShots = [];
    const flickerDiffs = [];
    const SAMPLE_INTERVAL = 250; // ms between samples (doubled from 500)
    const SAMPLE_COUNT = 10;     // number of samples (doubled from 5)
    let prevBuffer = null;

    // Take 10 screenshots over 2.5 seconds to detect flicker
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      await page.waitForTimeout(SAMPLE_INTERVAL);
      const shot = await page.screenshot({ type: 'png' });
      const b64 = shot.toString('base64');
      const filename = `p2-settle-${String(i+1).padStart(2, '0')}.png`;
      const filepath = saveScreenshot(shot, filename);

      // Compare to previous frame
      if (prevBuffer) {
        const prevB64 = prevBuffer.toString('base64');
        const diff = await compareScreenshots(page, prevB64, b64);
        flickerDiffs.push(diff);
        const isFlicker = diff >= FLICKER_THRESHOLD;
        if (isFlicker) results.totalFlickers++;
        settleShots.push({
          label: `+${(i+1)*SAMPLE_INTERVAL}ms (${diff.toFixed(1)}%${isFlicker ? ' FLICKER' : ''})`,
          file: filepath
        });
      } else {
        settleShots.push({ label: `+${(i+1)*SAMPLE_INTERVAL}ms (baseline)`, file: filepath });
      }
      prevBuffer = shot;
    }

    const p2Flickers = flickerDiffs.filter(d => d >= FLICKER_THRESHOLD).length;
    results.phases.push({
      name: 'Phase 2: Settle (Flicker Check)',
      duration: Date.now() - p2Start,
      flickers: p2Flickers,
      threshold: FLICKER_THRESHOLD,
      diffs: flickerDiffs.map(d => parseFloat(d.toFixed(1))),
      screenshots: settleShots
    });

    // === PHASE 2B: PAN (TEMPORARILY DISABLED) ===
    // const panPositions = [
    //   { x: 0.55, y: 0.40 },
    //   { x: 0.60, y: 0.50 },
    //   { x: 0.65, y: 0.60 },
    // ];
    // const panShots = [];
    //
    // for (let i = 0; i < panPositions.length; i++) {
    //   const pos = panPositions[i];
    //   await page.evaluate((p) => {
    //     window.viewer.viewport.panTo(new OpenSeadragon.Point(p.x, p.y), false);
    //   }, pos);
    //
    //   await page.waitForTimeout(1000);
    //   const shot = await page.screenshot({ type: 'png' });
    //   panShots.push({
    //     label: `Pan ${i+1}: (${pos.x}, ${pos.y})`,
    //     data: shot.toString('base64')
    //   });
    // }
    //
    // results.phases.push({
    //   name: 'Phase 2B: Pan',
    //   duration: panPositions.length * 1000,
    //   flickers: 0,
    //   note: 'Pan to 3 positions',
    //   screenshots: panShots
    // });

    // === PHASE 3: GRID (TEMPORARILY DISABLED) ===
    // const p3Start = Date.now();
    // const beforeGrid = await page.screenshot({ type: 'png' });
    //
    // await page.evaluate(() => {
    //   const ts = window.tileStreamerRef;
    //   if (ts?.gridDims) {
    //     const ar = ts.gridDims.totalHeight / ts.gridDims.totalWidth;
    //     window.viewer.viewport.fitBounds(new OpenSeadragon.Rect(0, 0, 1, ar), false);
    //   } else {
    //     window.viewer.viewport.goHome(false);
    //   }
    // });
    //
    // await page.waitForTimeout(2000);
    // const afterGrid = await page.screenshot({ type: 'png' });
    //
    // await page.waitForTimeout(1000);
    // const gridSettled = await page.screenshot({ type: 'png' });
    //
    // results.phases.push({
    //   name: 'Phase 3: Grid Overview',
    //   duration: Date.now() - p3Start,
    //   flickers: 0,
    //   note: 'Zoom to show all pages',
    //   screenshots: [
    //     { label: 'Before', data: beforeGrid.toString('base64') },
    //     { label: 'After (2s)', data: afterGrid.toString('base64') },
    //     { label: 'Settled (+1s)', data: gridSettled.toString('base64') }
    //   ]
    // });

    // === PHASE 4: DETAIL (TEMPORARILY DISABLED) ===
    // const p4Start = Date.now();
    // const beforeDetail = await page.screenshot({ type: 'png' });
    //
    // await page.evaluate(() => {
    //   window.viewer.viewport.zoomTo(4, new OpenSeadragon.Point(0.5, 0.5), false);
    // });
    //
    // await page.waitForTimeout(2000);
    // const afterDetail = await page.screenshot({ type: 'png' });
    //
    // results.phases.push({
    //   name: 'Phase 4: Detail Zoom',
    //   duration: Date.now() - p4Start,
    //   flickers: 0,
    //   note: 'Zoom into center',
    //   screenshots: [
    //     { label: 'Before', data: beforeDetail.toString('base64') },
    //     { label: 'After (2s)', data: afterDetail.toString('base64') }
    //   ]
    // });

    // === FINALIZE ===
    results.totalDuration = Date.now() - startTime;
    results.passed = results.errors.length === 0 && results.totalFlickers === 0;

    // === WRITE JSON RESULTS ===
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    const jsonPath = path.join(RESULTS_DIR, 'lft-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults: ${jsonPath}`);
    console.log(`Flickers detected: ${results.totalFlickers}\n`);

    // === ASSERTIONS ===
    expect(results.totalFlickers, 'Flickers detected during settle phase').toBe(0);
    expect(results.errors.length, 'Console errors detected').toBe(0);
  });
});
