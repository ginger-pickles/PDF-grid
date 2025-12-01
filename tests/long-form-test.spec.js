/**
 * Long-Form Test (LFT)
 *
 * Detects visual issues: flickering, slow tile build-in.
 * Flow: Load -> Pan -> Zoom-out to grid -> Single page zoom
 *
 * FAIL FAST: Aborts immediately on any failure.
 * SHORT TIMEOUTS: Content must appear within 10s per phase.
 */

const { test, expect } = require('@playwright/test');
const {
  setupOfflineRoutes,
  waitForVisualContent,
  captureCanvas,
  compareCanvases,
} = require('./test-helpers');

const TEST_PDF = 'demo/ginger-pickles.pdf';
const BASE_URL = 'http://localhost:8000';

// Timeouts (fail fast)
const CONTENT_TIMEOUT = 10000;  // 10s max to see content
const FLICKER_DURATION = 1000;  // 1s flicker check
const FLICKER_INTERVAL = 50;    // 50ms sampling (was 100)
const FLICKER_THRESHOLD = 0.1;  // 0.1% pixel change (was 0.5)

// Compare two PNG buffers and return percentage difference
function compareBuffers(buf1, buf2) {
  if (!buf1 || !buf2) return 100;
  if (buf1.length !== buf2.length) return 100;

  let diffBytes = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf2[i]) diffBytes++;
  }
  return (diffBytes / buf1.length) * 100;
}

async function checkForFlickers(page, duration = FLICKER_DURATION, label = '') {
  const flickers = [];
  const frames = Math.floor(duration / FLICKER_INTERVAL);
  let prevCapture = await captureCanvas(page);

  for (let i = 0; i < frames; i++) {
    await page.waitForTimeout(FLICKER_INTERVAL);
    const capture = await captureCanvas(page);
    if (prevCapture && capture) {
      const diff = compareCanvases(prevCapture, capture, 10);
      if (diff.percentDifferent >= FLICKER_THRESHOLD) {
        // LOG IMMEDIATELY so results aren't lost on abort
        console.log(`  ⚠ FLICKER ${label} frame ${i}: ${diff.percentDifferent.toFixed(1)}%`);
        flickers.push({ frame: i, pct: diff.percentDifferent.toFixed(1) });
      }
    }
    prevCapture = capture;
  }
  return flickers;
}

test.describe('LFT: Long-Form Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupOfflineRoutes(page);
  });

  test('Visual stability', async ({ page }) => {
    test.setTimeout(120000);  // 2 min total

    const errors = [];
    const report = { flickers: { p1: 0, p2: 0, p3: 0, p4: 0 } };

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!t.includes('timeout')) errors.push(t);
      }
    });

    console.log('\n========== LFT ==========\n');

    // === PHASE 1: LOAD ===
    console.log('Phase 1: Load');
    await page.goto(`${BASE_URL}/?pdf=${TEST_PDF}`);
    await page.waitForFunction(() => window.viewer && window.tileStreamerRef, { timeout: 30000 });

    // Monitor for flickers DURING content loading using page screenshots
    console.log('  Watching for flickers during load...');
    const loadFlickers = [];
    let contentAppeared = false;
    let prevScreenshot = null;
    const loadStart = Date.now();
    let frameCount = 0;

    while (!contentAppeared && (Date.now() - loadStart) < CONTENT_TIMEOUT) {
      // Use page screenshot instead of canvas capture
      const screenshot = await page.screenshot({ type: 'png' });
      frameCount++;

      // Compare screenshots
      if (prevScreenshot && screenshot) {
        // Simple byte comparison - if bytes differ significantly, it's a change
        const diff = compareBuffers(prevScreenshot, screenshot);
        if (diff > FLICKER_THRESHOLD) {
          console.log(`  ⚠ FLICKER P1-load frame ${frameCount}: ${diff.toFixed(1)}% changed`);
          loadFlickers.push({ frame: frameCount, pct: diff.toFixed(1) });
        }
      }
      prevScreenshot = screenshot;

      // Check if content has appeared
      const hasContent = await page.evaluate(() => {
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

      if (hasContent) {
        contentAppeared = true;
        console.log('  ✓ Content appeared');
      } else {
        await page.waitForTimeout(FLICKER_INTERVAL);
      }
    }

    if (!contentAppeared) {
      throw new Error(`Content did not appear within ${CONTENT_TIMEOUT}ms`);
    }

    // Continue monitoring for post-load flickers
    const f1 = await checkForFlickers(page, FLICKER_DURATION, 'P1-settled');
    report.flickers.p1 = loadFlickers.length + f1.length;

    if (report.flickers.p1 === 0) {
      console.log('  ✓ No flickers');
    } else {
      console.log(`  ✗ ${report.flickers.p1} flickers detected (${loadFlickers.length} during load, ${f1.length} after)`);
    }

    // === PHASE 2: PAN ===
    console.log('Phase 2: Pan');
    const pans = [
      { x: 0.55, y: 0.40 },
      { x: 0.60, y: 0.50 },
      { x: 0.65, y: 0.60 },
    ];

    for (const p of pans) {
      await page.evaluate((pos) => {
        window.viewer.viewport.panTo(new OpenSeadragon.Point(pos.x, pos.y), false);
      }, p);

      // GATE: Content must appear (fail fast)
      await waitForVisualContent(page, { timeout: CONTENT_TIMEOUT });

      const f = await checkForFlickers(page, FLICKER_DURATION, 'P2');
      report.flickers.p2 += f.length;
    }
    if (report.flickers.p2 === 0) console.log('  ✓ No flickers');

    // === PHASE 3: GRID ===
    console.log('Phase 3: Grid');
    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      if (ts?.gridDims) {
        const ar = ts.gridDims.totalHeight / ts.gridDims.totalWidth;
        window.viewer.viewport.fitBounds(new OpenSeadragon.Rect(0, 0, 1, ar), false);
      } else {
        window.viewer.viewport.goHome(false);
      }
    });

    // GATE: Content must appear (fail fast)
    await waitForVisualContent(page, { timeout: CONTENT_TIMEOUT });
    console.log('  ✓ Grid visible');

    await page.waitForTimeout(1000);  // Let settle
    const f3 = await checkForFlickers(page, 2000, 'P3');
    report.flickers.p3 = f3.length;
    if (f3.length === 0) console.log('  ✓ No flickers');

    // Observe
    await page.waitForTimeout(3000);

    // === PHASE 4: DETAIL ===
    console.log('Phase 4: Detail');
    await page.evaluate(() => {
      window.viewer.viewport.zoomTo(8, new OpenSeadragon.Point(0.5, 0.5), false);
    });

    // GATE: Content must appear (fail fast)
    await waitForVisualContent(page, { timeout: CONTENT_TIMEOUT });
    console.log('  ✓ Detail visible');

    await page.waitForTimeout(1000);
    const f4 = await checkForFlickers(page, 2000, 'P4');
    report.flickers.p4 = f4.length;
    if (f4.length === 0) console.log('  ✓ No flickers');

    // Observe
    await page.waitForTimeout(3000);

    // === REPORT ===
    const total = report.flickers.p1 + report.flickers.p2 + report.flickers.p3 + report.flickers.p4;
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total flickers: ${total} (P1:${report.flickers.p1} P2:${report.flickers.p2} P3:${report.flickers.p3} P4:${report.flickers.p4})`);
    console.log(`Console errors: ${errors.length}`);

    // FAIL on flickers or errors
    expect(total, 'Flickers detected').toBe(0);
    expect(errors.length, 'Console errors').toBe(0);

    console.log('\n========== LFT: PASSED ==========\n');
  });
});
