/**
 * Long-Form Test (LFT)
 *
 * Detects visual flicker by capturing screenshots at key moments.
 * Outputs JSON results to test-results/lft-results.json
 *
 * Phases: Load -> Settle -> Pan -> Grid -> Detail
 *
 * Content verification: Each phase checks for actual pixel content, not just stability.
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');
const fs = require('fs');
const path = require('path');

const TEST_PDF = process.env.TEST_PDF || 'demo/test-pattern.pdf';
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

// Verify content exists anywhere in image - returns { hasContent, uniqueColors, nonBgPercent }
async function verifyContent(page, b64) {
  return await page.evaluate((b64Data) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Check entire image (excluding top 50px for header)
        const x = 0;
        const y = 50;
        const w = img.width;
        const h = img.height - 50;

        const data = ctx.getImageData(x, y, w, h).data;
        const colors = new Set();
        let nonBgPixels = 0;
        const totalPixels = w * h;

        // Background color (dark slate from app ~rgb(30,41,59))
        const bgR = 30, bgG = 41, bgB = 59;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          // Quantize to reduce noise
          const colorKey = `${Math.floor(r/16)},${Math.floor(g/16)},${Math.floor(b/16)}`;
          colors.add(colorKey);

          // Check if pixel is significantly different from background
          const dr = Math.abs(r - bgR);
          const dg = Math.abs(g - bgG);
          const db = Math.abs(b - bgB);
          if (dr > 30 || dg > 30 || db > 30) nonBgPixels++;
        }

        const nonBgPercent = (nonBgPixels / totalPixels) * 100;
        resolve({
          hasContent: colors.size > 10 && nonBgPercent > 5,
          uniqueColors: colors.size,
          nonBgPercent: parseFloat(nonBgPercent.toFixed(1))
        });
      };
      img.src = 'data:image/png;base64,' + b64Data;
    });
  }, b64);
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
      totalContentFailures: 0,
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
    await page.goto(`${BASE_URL}/?pdf=${TEST_PDF}&nav`);
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

    // === PHASE 1A: SETTLE (flicker detection) ===
    const p1aStart = Date.now();
    const settleShots = [];
    const flickerDiffs = [];
    const SAMPLE_INTERVAL = 250; // ms between samples
    const SAMPLE_COUNT = 10;     // number of samples
    let prevBuffer = null;

    // Take 10 screenshots over 2.5 seconds to detect flicker
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      await page.waitForTimeout(SAMPLE_INTERVAL);
      const shot = await page.screenshot({ type: 'png' });
      const b64 = shot.toString('base64');
      const filename = `p1a-settle-${String(i+1).padStart(2, '0')}.png`;
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

    const p1aFlickers = flickerDiffs.filter(d => d >= FLICKER_THRESHOLD).length;
    results.phases.push({
      name: 'Phase 1A: Settle',
      duration: Date.now() - p1aStart,
      flickers: p1aFlickers,
      threshold: FLICKER_THRESHOLD,
      diffs: flickerDiffs.map(d => parseFloat(d.toFixed(1))),
      screenshots: settleShots
    });

    // === PHASE 2: PAN ===
    const p2Start = Date.now();
    const panShots = [];
    const panDiffs = [];
    const panContentChecks = [];
    let panPrevBuffer = null;
    let panContentFailures = 0;

    // Pan from page 1 (top row) straight down to middle of grid in 4 steps
    // Get current center (should be showing content) and pan down from there
    const panPositions = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const viewer = window.viewer;
      if (!ts?.gridDims || !viewer) return null;

      const ar = ts.gridDims.totalHeight / ts.gridDims.totalWidth;
      // Use current X position (should be centered on content)
      const currentCenter = viewer.viewport.getCenter();
      const x = currentCenter.x;

      // Y positions: start near top, pan straight down to middle
      const yStart = ar * 0.12;  // Near top, page 1 visible
      const yEnd = ar * 0.5;     // Middle of grid
      const yStep = (yEnd - yStart) / 3;

      return [
        { x, y: yStart },
        { x, y: yStart + yStep },
        { x, y: yStart + yStep * 2 },
        { x, y: yEnd },
      ];
    }) || [
      // Fallback positions
      { x: 0.25, y: 0.15 },
      { x: 0.25, y: 0.35 },
      { x: 0.25, y: 0.55 },
      { x: 0.25, y: 0.75 },
    ];

    for (let i = 0; i < panPositions.length; i++) {
      const pos = panPositions[i];
      await page.evaluate((p) => {
        window.viewer.viewport.panTo(new OpenSeadragon.Point(p.x, p.y), false);
      }, pos);

      await page.waitForTimeout(800); // Wait for pan + tile loading
      const shot = await page.screenshot({ type: 'png' });
      const b64 = shot.toString('base64');
      const filename = `p2-pan-${String(i+1).padStart(2, '0')}.png`;
      const filepath = saveScreenshot(shot, filename);

      // Content verification: check that we see actual content after pan
      const contentCheck = await verifyContent(page, b64);
      panContentChecks.push(contentCheck);
      if (!contentCheck.hasContent) {
        panContentFailures++;
        results.totalContentFailures++;
      }

      // Compare to previous (expect diff due to pan - this is expected, not flicker)
      if (panPrevBuffer) {
        const prevB64 = panPrevBuffer.toString('base64');
        const diff = await compareScreenshots(page, prevB64, b64);
        panDiffs.push(diff);
        panShots.push({
          label: `Pan ${i+1}/4: y=${pos.y.toFixed(2)} (${diff.toFixed(1)}%, ${contentCheck.nonBgPercent}% content)`,
          file: filepath
        });
      } else {
        panShots.push({
          label: `Pan ${i+1}/4: y=${pos.y.toFixed(2)} (baseline, ${contentCheck.nonBgPercent}% content)`,
          file: filepath
        });
      }
      panPrevBuffer = shot;
    }

    // After all pans complete, check for flicker (stability check)
    // Take two consecutive screenshots - they should be identical if stable
    await page.waitForTimeout(1000);
    const panSettleShot1 = await page.screenshot({ type: 'png' });
    await page.waitForTimeout(500);
    const panSettleShot2 = await page.screenshot({ type: 'png' });
    const panSettleDiff = await compareScreenshots(
      page,
      panSettleShot1.toString('base64'),
      panSettleShot2.toString('base64')
    );
    const panFlickers = panSettleDiff >= FLICKER_THRESHOLD ? 1 : 0;
    if (panFlickers) results.totalFlickers++;

    results.phases.push({
      name: 'Phase 2: Pan',
      duration: Date.now() - p2Start,
      flickers: panFlickers,
      contentFailures: panContentFailures,
      note: 'Pan top to middle in 4 steps, verify content visible, check stability',
      diffs: panDiffs.map(d => parseFloat(d.toFixed(1))),
      settleDiff: parseFloat(panSettleDiff.toFixed(1)),
      contentChecks: panContentChecks,
      screenshots: panShots
    });

    // === PHASE 3: GRID OVERVIEW ===
    const p3Start = Date.now();
    const beforeGrid = await page.screenshot({ type: 'png' });
    const beforeGridPath = saveScreenshot(beforeGrid, 'p3-grid-before.png');

    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      if (ts?.gridDims) {
        const ar = ts.gridDims.totalHeight / ts.gridDims.totalWidth;
        window.viewer.viewport.fitBounds(new OpenSeadragon.Rect(0, 0, 1, ar), false);
      } else {
        window.viewer.viewport.goHome(false);
      }
    });

    await page.waitForTimeout(1500);
    const afterGrid = await page.screenshot({ type: 'png' });
    const afterGridB64 = afterGrid.toString('base64');
    const afterGridPath = saveScreenshot(afterGrid, 'p3-grid-after.png');

    // Content verification: in grid view, we should see page content
    const gridContentCheck = await verifyContent(page, afterGridB64);
    const gridContentFailure = !gridContentCheck.hasContent ? 1 : 0;
    if (gridContentFailure) results.totalContentFailures++;

    // Check for flicker after grid settles
    await page.waitForTimeout(500);
    const gridSettled = await page.screenshot({ type: 'png' });
    const gridSettledB64 = gridSettled.toString('base64');
    const gridSettledPath = saveScreenshot(gridSettled, 'p3-grid-settled.png');

    const gridSettleDiff = await compareScreenshots(page, afterGridB64, gridSettledB64);
    const gridFlickers = gridSettleDiff >= FLICKER_THRESHOLD ? 1 : 0;
    if (gridFlickers) results.totalFlickers++;

    results.phases.push({
      name: 'Phase 3: Grid Overview',
      duration: Date.now() - p3Start,
      flickers: gridFlickers,
      contentFailures: gridContentFailure,
      note: 'Zoom to show all pages, verify content visible',
      diffs: [parseFloat(gridSettleDiff.toFixed(1))],
      contentCheck: gridContentCheck,
      screenshots: [
        { label: 'Before', file: beforeGridPath },
        { label: `After (1.5s) (${gridContentCheck.nonBgPercent}% content)`, file: afterGridPath },
        { label: `Settled (+0.5s) (${gridSettleDiff.toFixed(1)}%${gridFlickers ? ' FLICKER' : ''})`, file: gridSettledPath }
      ]
    });

    // === PHASE 4: DETAIL ZOOM ===
    const p4Start = Date.now();
    const beforeDetail = await page.screenshot({ type: 'png' });
    const beforeDetailPath = saveScreenshot(beforeDetail, 'p4-detail-before.png');

    // Zoom to show a quarter of a page, centered on page 1's center
    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const viewer = window.viewer;

      // Go home first
      viewer.viewport.goHome(false);
    });
    await page.waitForTimeout(500);

    // Pan to center of page 1, then zoom to quarter-page
    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const viewer = window.viewer;

      if (!ts?.gridDims) {
        viewer.viewport.zoomTo(12, undefined, false);
        return;
      }

      const gd = ts.gridDims;
      const pageW = gd.pageWidth / gd.totalWidth;
      const pageH = gd.pageHeight / gd.totalHeight;

      // After goHome, viewport is centered on grid
      // Page 1's center is offset by half a page from where corners meet
      const currentCenter = viewer.viewport.getCenter();

      // Move up and left by half a page to center on page 1
      // (goHome shows corners, so we offset to get a page center)
      const page1Center = new OpenSeadragon.Point(
        currentCenter.x - pageW / 2,
        currentCenter.y - pageH / 2
      );

      // Zoom to show ~quarter page
      const quarterPageZoom = 4 / pageW;

      viewer.viewport.panTo(page1Center, false);
      viewer.viewport.zoomTo(quarterPageZoom, undefined, false);
    });

    await page.waitForTimeout(1500);
    const afterDetail = await page.screenshot({ type: 'png' });
    const afterDetailB64 = afterDetail.toString('base64');
    const afterDetailPath = saveScreenshot(afterDetail, 'p4-detail-after.png');

    // Content verification: at 4x zoom, we should see detailed page content
    const detailContentCheck = await verifyContent(page, afterDetailB64);
    const detailContentFailure = !detailContentCheck.hasContent ? 1 : 0;
    if (detailContentFailure) results.totalContentFailures++;

    // Check for flicker after detail settles
    await page.waitForTimeout(500);
    const detailSettled = await page.screenshot({ type: 'png' });
    const detailSettledB64 = detailSettled.toString('base64');
    const detailSettledPath = saveScreenshot(detailSettled, 'p4-detail-settled.png');

    const detailSettleDiff = await compareScreenshots(page, afterDetailB64, detailSettledB64);
    const detailFlickers = detailSettleDiff >= FLICKER_THRESHOLD ? 1 : 0;
    if (detailFlickers) results.totalFlickers++;

    results.phases.push({
      name: 'Phase 4: Detail Zoom',
      duration: Date.now() - p4Start,
      flickers: detailFlickers,
      contentFailures: detailContentFailure,
      note: 'Zoom to quarter-page detail on page 1, verify content visible',
      diffs: [parseFloat(detailSettleDiff.toFixed(1))],
      contentCheck: detailContentCheck,
      screenshots: [
        { label: 'Before', file: beforeDetailPath },
        { label: `After (1.5s) (${detailContentCheck.nonBgPercent}% content)`, file: afterDetailPath },
        { label: `Settled (+0.5s) (${detailSettleDiff.toFixed(1)}%${detailFlickers ? ' FLICKER' : ''})`, file: detailSettledPath }
      ]
    });

    // === FINALIZE ===
    results.totalDuration = Date.now() - startTime;
    results.passed = results.errors.length === 0 &&
                     results.totalFlickers === 0 &&
                     results.totalContentFailures === 0;

    // === WRITE JSON RESULTS ===
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    const jsonPath = path.join(RESULTS_DIR, 'lft-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults: ${jsonPath}`);
    console.log(`Flickers: ${results.totalFlickers}, Content failures: ${results.totalContentFailures}\n`);

    // === ASSERTIONS ===
    expect(results.totalFlickers, 'Flickers detected').toBe(0);
    expect(results.totalContentFailures, 'Content verification failures').toBe(0);
    expect(results.errors.length, 'Console errors detected').toBe(0);
  });
});
