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
const { setupOfflineRoutes, waitForFullyLoaded, waitForVisualStability } = require('./test-helpers');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const GridOracle = require('../lib/grid-oracle.js');

const TEST_PDF = process.env.TEST_PDF || 'demo/test-pattern.pdf';
const BASE_URL = 'http://localhost:8000';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const VIEWPORT = { width: 375, height: 667 };

// Standard PDF page dimensions (US Letter at 72 DPI)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// Save screenshot to file, return relative path
function saveScreenshot(buffer, filename) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `screenshots/${filename}`;
}

/**
 * Visual verification using actual page positions from the app
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot buffer
 * @param {Object} osdBounds - OSD viewport bounds {x, y, width, height}
 * @param {Object} gridDims - Grid dimensions from app
 * @param {Array} pagePositions - Array of {page, gridX, gridY, width, height}
 * @returns {Object} verification results
 */
function verifyWithPagePositions(screenshotBuffer, osdBounds, gridDims, pagePositions) {
  const png = PNG.sync.read(screenshotBuffer);
  const { width: screenWidth, height: screenHeight, data } = png;

  if (!gridDims || !pagePositions || pagePositions.length === 0) {
    console.log('  Warning: No grid/page data from app, returning empty verification');
    return {
      expectedPages: [],
      pageResults: [],
      allPagesVisible: true,
      allPagesCorrectRes: true,
      gridBounds: { left: 0, top: 0, right: 0, bottom: 0 },
      osdBounds
    };
  }

  // Convert OSD bounds to grid coordinates
  const scale = gridDims.totalWidth; // OSD normalizes to width=1
  const gridBounds = {
    left: osdBounds.x * scale,
    top: osdBounds.y * scale,
    right: (osdBounds.x + osdBounds.width) * scale,
    bottom: (osdBounds.y + osdBounds.height) * scale
  };

  // Find pages that intersect the viewport (deduplicate since overlapping pattern has multiple positions)
  const expectedPagesSet = new Set();
  const visiblePositions = new Map(); // page -> position that's in viewport
  for (const p of pagePositions) {
    const pageLeft = p.gridX;
    const pageTop = p.gridY;
    const pageRight = p.gridX + (p.width || gridDims.pageWidth);
    const pageBottom = p.gridY + (p.height || gridDims.pageHeight);

    // Check intersection
    if (pageRight > gridBounds.left && pageLeft < gridBounds.right &&
        pageBottom > gridBounds.top && pageTop < gridBounds.bottom) {
      expectedPagesSet.add(p.page);
      // Store the visible position (prefer larger overlap if multiple)
      if (!visiblePositions.has(p.page)) {
        visiblePositions.set(p.page, p);
      }
    }
  }
  const expectedPages = [...expectedPagesSet].sort((a, b) => a - b);

  // Calculate scale: grid coords to screen pixels
  const scaleX = screenWidth / (gridBounds.right - gridBounds.left);
  const scaleY = screenHeight / (gridBounds.bottom - gridBounds.top);

  const pageResults = [];

  for (const pageNum of expectedPages) {
    const p = visiblePositions.get(pageNum);
    if (!p) continue;

    const pageLeft = p.gridX;
    const pageTop = p.gridY;
    const pageWidth = p.width || gridDims.pageWidth;
    const pageHeight = p.height || gridDims.pageHeight;

    // Convert to screen coordinates
    const screenLeft = Math.max(0, Math.floor((pageLeft - gridBounds.left) * scaleX));
    const screenTop = Math.max(0, Math.floor((pageTop - gridBounds.top) * scaleY));
    const screenRight = Math.min(screenWidth, Math.ceil((pageLeft + pageWidth - gridBounds.left) * scaleX));
    const screenBottom = Math.min(screenHeight, Math.ceil((pageTop + pageHeight - gridBounds.top) * scaleY));

    // Skip if page is outside visible area
    if (screenRight <= screenLeft || screenBottom <= screenTop) {
      pageResults.push({
        page: pageNum,
        visible: false,
        reason: 'outside viewport',
        screenRegion: { left: screenLeft, top: screenTop, right: screenRight, bottom: screenBottom }
      });
      continue;
    }

    // Sample pixels in the page region
    const samples = sampleRegion(data, screenWidth, screenHeight,
      screenLeft, screenTop, screenRight, screenBottom);

    // Determine visibility: content if we have varied colors (not just background)
    const hasContent = samples.uniqueColors > 5;
    const hasCorrectRes = samples.edgeSharpness > 0.3;

    pageResults.push({
      page: pageNum,
      visible: hasContent,
      correctResolution: hasCorrectRes,
      screenRegion: { left: screenLeft, top: screenTop, right: screenRight, bottom: screenBottom },
      samples
    });
  }

  return {
    expectedPages,
    pageResults,
    allPagesVisible: pageResults.every(p => p.visible),
    allPagesCorrectRes: pageResults.filter(p => p.visible).every(p => p.correctResolution),
    gridBounds,
    osdBounds
  };
}

/**
 * Visual verification using GridOracle with optional app-provided data
 * (Legacy function - use verifyWithPagePositions when app data is available)
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot buffer
 * @param {Object} osdBounds - OSD viewport bounds {x, y, width, height}
 * @param {number} numPages - Total pages in document
 * @param {Object} appGridDims - Grid dimensions from app (optional)
 * @param {number[][]} appPattern - Page pattern from app (optional)
 * @returns {Object} verification results
 */
function verifyPageVisibilityWithAppData(screenshotBuffer, osdBounds, numPages, appGridDims, appPattern) {
  const png = PNG.sync.read(screenshotBuffer);
  const { width: screenWidth, height: screenHeight, data } = png;

  // Always use oracle's pattern for consistency
  const pattern = GridOracle.generatePattern(numPages);

  // Use app's gridDims if available, otherwise calculate from oracle
  // Note: app's gridDims may use different scale than oracle (e.g., 4x)
  let gridDims;
  if (appGridDims) {
    // Use app's grid dimensions directly
    gridDims = {
      gridRows: pattern.length,
      gridCols: pattern[0].length,
      spacing: appGridDims.spacing,
      totalWidth: appGridDims.totalWidth,
      totalHeight: appGridDims.totalHeight,
      pageWidth: appGridDims.pageWidth,
      pageHeight: appGridDims.pageHeight,
      cellWidth: appGridDims.pageWidth + appGridDims.spacing,
      cellHeight: appGridDims.pageHeight + appGridDims.spacing
    };
  } else {
    gridDims = GridOracle.calculateDimensions(numPages, PAGE_WIDTH, PAGE_HEIGHT, pattern);
  }

  const gridBounds = GridOracle.osdBoundsToGrid(osdBounds, gridDims);
  const expectedPages = GridOracle.getPagesInBounds(gridBounds, gridDims, pattern);

  console.log(`  Pattern: ${pattern.length} rows x ${pattern[0].length} cols`);
  console.log(`  Using ${appGridDims ? 'app' : 'oracle'} gridDims (totalW=${gridDims.totalWidth} pageW=${gridDims.pageWidth})`);

  // Find page 1 position to locate other pages
  let page1Row = 0, page1Col = 0;
  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      if (pattern[row][col] === 1) {
        page1Row = row;
        page1Col = col;
        break;
      }
    }
  }

  // Calculate scale: grid coords to screen pixels
  const scaleX = screenWidth / (gridBounds.right - gridBounds.left);
  const scaleY = screenHeight / (gridBounds.bottom - gridBounds.top);

  const pageResults = [];

  for (const pageNum of expectedPages) {
    // Find page position in pattern
    let pageRow = -1, pageCol = -1;
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        if (pattern[row][col] === pageNum) {
          pageRow = row;
          pageCol = col;
          break;
        }
      }
    }

    if (pageRow < 0) continue;

    // Get page bounds in grid coordinates
    const pageBounds = GridOracle.getPageBounds(pageRow, pageCol, gridDims);

    // Convert to screen coordinates
    const screenLeft = Math.max(0, Math.floor((pageBounds.left - gridBounds.left) * scaleX));
    const screenTop = Math.max(0, Math.floor((pageBounds.top - gridBounds.top) * scaleY));
    const screenRight = Math.min(screenWidth, Math.ceil((pageBounds.right - gridBounds.left) * scaleX));
    const screenBottom = Math.min(screenHeight, Math.ceil((pageBounds.bottom - gridBounds.top) * scaleY));

    // Skip if page is outside visible area
    if (screenRight <= screenLeft || screenBottom <= screenTop) {
      pageResults.push({
        page: pageNum,
        visible: false,
        reason: 'outside viewport',
        screenRegion: { left: screenLeft, top: screenTop, right: screenRight, bottom: screenBottom }
      });
      continue;
    }

    // Sample pixels in the page region
    const samples = sampleRegion(data, screenWidth, screenHeight,
      screenLeft, screenTop, screenRight, screenBottom);

    // Determine visibility: content if we have varied colors (not just background)
    const hasContent = samples.uniqueColors > 5;
    const hasCorrectRes = samples.edgeSharpness > 0.3; // Edge detection for resolution

    pageResults.push({
      page: pageNum,
      visible: hasContent,
      correctResolution: hasCorrectRes,
      screenRegion: { left: screenLeft, top: screenTop, right: screenRight, bottom: screenBottom },
      samples
    });
  }

  return {
    expectedPages,
    pageResults,
    allPagesVisible: pageResults.every(p => p.visible),
    allPagesCorrectRes: pageResults.filter(p => p.visible).every(p => p.correctResolution),
    gridBounds,
    osdBounds
  };
}

/**
 * Sample pixels in a region, compute metrics
 */
function sampleRegion(data, imgWidth, imgHeight, left, top, right, bottom) {
  const colors = new Set();
  const brightness = [];
  let totalEdgeStrength = 0;
  let edgeSamples = 0;

  const regionWidth = right - left;
  const regionHeight = bottom - top;

  // Sample grid within region
  const sampleStep = Math.max(1, Math.floor(Math.min(regionWidth, regionHeight) / 20));

  for (let y = top; y < bottom; y += sampleStep) {
    for (let x = left; x < right; x += sampleStep) {
      const idx = (y * imgWidth + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      colors.add(`${r},${g},${b}`);
      brightness.push((r + g + b) / 3);

      // Edge detection: compare to neighbors for sharpness
      if (x + sampleStep < right && y + sampleStep < bottom) {
        const idxRight = (y * imgWidth + (x + sampleStep)) * 4;
        const idxDown = ((y + sampleStep) * imgWidth + x) * 4;

        const diffH = Math.abs(data[idx] - data[idxRight]) +
                      Math.abs(data[idx + 1] - data[idxRight + 1]) +
                      Math.abs(data[idx + 2] - data[idxRight + 2]);
        const diffV = Math.abs(data[idx] - data[idxDown]) +
                      Math.abs(data[idx + 1] - data[idxDown + 1]) +
                      Math.abs(data[idx + 2] - data[idxDown + 2]);

        // Strong edges indicate high resolution
        if (diffH > 50 || diffV > 50) {
          totalEdgeStrength += Math.max(diffH, diffV);
          edgeSamples++;
        }
      }
    }
  }

  const avgBrightness = brightness.length > 0
    ? brightness.reduce((a, b) => a + b, 0) / brightness.length
    : 0;

  // Edge sharpness: ratio of strong edges to samples
  const edgeSharpness = edgeSamples > 0
    ? edgeSamples / Math.floor((regionWidth / sampleStep) * (regionHeight / sampleStep))
    : 0;

  return {
    uniqueColors: colors.size,
    avgBrightness,
    edgeSharpness,
    edgeSamples
  };
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

    // === PHASE 1: INITIAL VIEW ===
    const p1Start = Date.now();

    // Capture 1: Initial - what user sees during load
    const initialScreenshot = await page.screenshot({ type: 'png' });
    const initialFile = saveScreenshot(initialScreenshot, 'sft-state1-initial.png');

    // Wait for async tile loading to complete
    await page.waitForFunction(() => {
      const ts = window.tileStreamerRef;
      if (!ts) return false;
      const pendingCount = ts.pendingJobs?.size || 0;
      const hasLowResPages = ts.pageStreamer?._getPageCache('low')?.size > 0;
      return pendingCount === 0 && hasLowResPages;
    }, { timeout: 15000 });

    // Wait for OSD to report all visible tiles loaded
    await waitForFullyLoaded(page, 10000);

    // Capture 2: Stable - after async jobs complete
    const state1Data = await page.evaluate(() => {
      const bounds = window.viewer.viewport.getBounds();
      const ts = window.tileStreamerRef;

      // Dump available properties on tileStreamerRef
      const tsKeys = ts ? Object.keys(ts).filter(k => !k.startsWith('_')).slice(0, 20) : [];

      // Get the actual pattern from the app
      let pattern = null;
      if (ts && ts.pattern) {
        // Convert pattern to simple 2D array if it's not already
        pattern = ts.pattern;
        console.log('Found app pattern:', JSON.stringify(pattern).slice(0, 200));
      }

      // Compute ALL page positions using app's actual pattern
      // Overlapping pattern has each page in multiple cells - keep all for intersection testing
      const pagePositions = [];
      if (ts && ts.gridDims && pattern) {
        const { pageWidth, pageHeight, spacing } = ts.gridDims;
        const cellWidth = pageWidth + spacing;
        const cellHeight = pageHeight + spacing;
        const halfSpacing = spacing / 2;

        // Scan the pattern to find ALL page positions
        for (let row = 0; row < pattern.length; row++) {
          for (let col = 0; col < pattern[row].length; col++) {
            const pageNum = pattern[row][col];
            if (pageNum > 0) {
              pagePositions.push({
                page: pageNum,
                gridX: col * cellWidth + halfSpacing,
                gridY: row * cellHeight + halfSpacing,
                width: pageWidth,
                height: pageHeight
              });
            }
          }
        }
      }

      return {
        hasViewer: !!window.viewer,
        numPages: ts?.numPages || 0,
        osdBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        gridDims: ts?.gridDims || null,
        tsKeys,
        pattern,
        pagePositions
      };
    });

    const stableScreenshot = await page.screenshot({ type: 'png' });
    const stableFile = saveScreenshot(stableScreenshot, 'sft-state1-stable.png');


    // Visual verification using actual page positions from the app
    const state1Verification = verifyWithPagePositions(
      stableScreenshot,
      state1Data.osdBounds,
      state1Data.gridDims,
      state1Data.pagePositions
    );

    // Compact verification summary
    const missing = state1Verification.pageResults.filter(p => !p.visible).map(p => p.page);
    const lowres = state1Verification.pageResults.filter(p => p.visible && !p.correctResolution).map(p => p.page);
    console.log(`State 1: pages=[${state1Verification.expectedPages}] missing=[${missing}] lowres=[${lowres}]`);

    // Check hasContent from screenshot (fallback method - sample whole image)
    const png = PNG.sync.read(stableScreenshot);
    const colors = new Set();
    const step = Math.floor(Math.min(png.width, png.height) / 20);
    for (let y = 0; y < png.height; y += step) {
      for (let x = 0; x < png.width; x += step) {
        const idx = (y * png.width + x) * 4;
        colors.add(`${png.data[idx]},${png.data[idx+1]},${png.data[idx+2]}`);
      }
    }
    const state1HasContent = colors.size >= 10;

    results.phases.push({
      name: 'State 1: Initial View',
      duration: Date.now() - p1Start,
      metrics: {
        numPages: state1Data.numPages,
        hasContent: state1HasContent,
        expectedPages: state1Verification.expectedPages,
        allPagesVisible: state1Verification.allPagesVisible,
        allPagesCorrectRes: state1Verification.allPagesCorrectRes
      },
      verification: state1Verification,
      // DIAGNOSTIC: Capture tile request/abort/complete log
      tileLog: await page.evaluate(() => window.__tileLog || { requests: [], aborts: [], completes: [] }),
      screenshots: [
        { label: 'Initial', file: initialFile },
        { label: 'Stable', file: stableFile }
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

    // Wait for grid animation to complete and tiles to render
    await waitForFullyLoaded(page, 10000, 500);
    await waitForVisualStability(page, { timeout: 10000, interval: 500, threshold: 2 });

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

    // Pass requires: pages loaded, content visible, all expected pages visible, no errors
    results.passed = state1Data.numPages > 0 &&
                     state1HasContent &&
                     state1Verification.allPagesVisible &&
                     state2HasContent &&
                     results.errors.length === 0;

    // === WRITE JSON RESULTS ===
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    const jsonPath = path.join(RESULTS_DIR, 'sft-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults: ${jsonPath}`);
    console.log(`Passed: ${results.passed}`);
    if (!state1Verification.allPagesVisible) {
      const missing = state1Verification.pageResults.filter(p => !p.visible).map(p => p.page);
      console.log(`Missing pages: [${missing.join(', ')}]`);
    }
    if (!state1Verification.allPagesCorrectRes) {
      const lowRes = state1Verification.pageResults.filter(p => p.visible && !p.correctResolution).map(p => p.page);
      console.log(`Low-res pages: [${lowRes.join(', ')}]`);
    }
    console.log('');

    // === ASSERTIONS ===
    expect(state1Data.numPages, 'No pages loaded').toBeGreaterThan(0);
    expect(state1HasContent, 'State 1: No visual content').toBe(true);
    expect(state1Verification.allPagesVisible, `Missing pages in State 1: expected [${state1Verification.expectedPages.join(', ')}]`).toBe(true);
    expect(state2HasContent, 'State 2: No visual content').toBe(true);
    expect(results.errors.length, 'Console errors detected').toBe(0);
  });
});
