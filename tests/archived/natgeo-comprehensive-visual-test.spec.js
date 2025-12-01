/**
 * Comprehensive Visual Test - Multiple Views
 *
 * Tests for missing pages across three different views:
 * 1. Initial view (first load, centered on page 1)
 * 2. Broad zoom (entire grid visible)
 * 3. Minimap/Navigator (overview of all pages)
 *
 * Each view gets a screenshot and visual analysis
 */

const { test, expect } = require('@playwright/test');

test('Comprehensive visual test across multiple views', async ({ page }) => {
  console.log('\n=== Comprehensive Visual Testing (Initial, Broad Zoom, Minimap) ===\n');

  // Load natgeo
  await page.goto('http://localhost:8000?pdf=demo/natgeo-1969-05.pdf');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 120000 });

  // Wait for initial rendering and post-init cleanup
  await page.waitForTimeout(15000);

  const results = {
    initialView: null,
    broadZoom: null,
    minimap: null,
    pageCache: null
  };

  // ============================================================
  // TEST 1: INITIAL VIEW (centered on page 1)
  // ============================================================
  console.log('=== TEST 1: Initial View ===\n');

  // Get initial viewport info
  const initialViewport = await page.evaluate(() => {
    const viewport = window.viewer.viewport;
    return {
      zoom: viewport.getZoom(),
      center: viewport.getCenter()
    };
  });

  console.log(`Initial Viewport:`);
  console.log(`  Zoom: ${initialViewport.zoom.toFixed(4)}`);
  console.log(`  Center: (${initialViewport.center.x.toFixed(2)}, ${initialViewport.center.y.toFixed(2)})`);

  // Take screenshot
  await page.screenshot({
    path: 'test-results/natgeo-visual-initial.png',
    fullPage: false
  });

  // Analyze canvas
  const initialAnalysis = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let nonBlackPixels = 0;
    let totalSampled = 0;

    // Sample every 100th pixel
    for (let i = 0; i < pixels.length; i += 400) {
      totalSampled++;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      if (r > 30 || g > 30 || b > 30) {
        nonBlackPixels++;
      }
    }

    const contentPercent = (nonBlackPixels / totalSampled) * 100;
    return {
      canvasSize: `${canvas.width}×${canvas.height}`,
      contentPercent: contentPercent.toFixed(1),
      hasContent: contentPercent > 10
    };
  });

  console.log(`  Canvas: ${initialAnalysis.canvasSize}`);
  console.log(`  Content: ${initialAnalysis.contentPercent}% visible`);
  console.log(`  Status: ${initialAnalysis.hasContent ? '✓ Pages visible' : '✗ Mostly black'}\n`);

  results.initialView = initialAnalysis;

  // ============================================================
  // TEST 2: BROAD ZOOM (entire grid)
  // ============================================================
  console.log('=== TEST 2: Broad Zoom (Entire Grid) ===\n');

  // Zoom out to show entire grid
  await page.evaluate(() => {
    window.viewer.viewport.goHome(false);
  });

  await page.waitForTimeout(3000);

  const broadViewport = await page.evaluate(() => {
    const viewport = window.viewer.viewport;
    return {
      zoom: viewport.getZoom(),
      center: viewport.getCenter()
    };
  });

  console.log(`Broad Zoom Viewport:`);
  console.log(`  Zoom: ${broadViewport.zoom.toFixed(4)}`);
  console.log(`  Center: (${broadViewport.center.x.toFixed(2)}, ${broadViewport.center.y.toFixed(2)})`);

  // Take screenshot
  await page.screenshot({
    path: 'test-results/natgeo-visual-broad.png',
    fullPage: false
  });

  // Analyze canvas - SMART ANALYSIS using grid pattern
  const broadAnalysis = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };

    const viewer = window.viewer;
    const tileStreamer = window.tileStreamerRef;
    if (!tileStreamer) return { error: 'No tileStreamer' };

    // Get grid pattern to know which canvas regions SHOULD have pages
    const pattern = tileStreamer.pattern;
    const gridDims = tileStreamer.gridDims;
    const viewport = viewer.viewport;

    // Convert grid coordinates to viewport coordinates
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let expectedPageRegions = 0;
    let visiblePageRegions = 0;
    let emptyPageRegions = 0;

    // Sample the grid pattern to check if pages are visible where expected
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        const pageNum = pattern[row][col];
        if (pageNum === 0) continue; // Empty grid cell

        expectedPageRegions++;

        // Calculate page position in grid coordinates
        const pageLeft = col * (gridDims.pageWidth + gridDims.spacing);
        const pageTop = row * (gridDims.pageHeight + gridDims.spacing);
        const pageRight = pageLeft + gridDims.pageWidth;
        const pageBottom = pageTop + gridDims.pageHeight;

        // Convert to viewport coordinates - center of page
        const centerX = pageLeft + gridDims.pageWidth / 2;
        const centerY = pageTop + gridDims.pageHeight / 2;

        const viewportPoint = viewport.imageToViewportCoordinates(centerX, centerY);

        // Convert viewport to canvas pixels
        const canvasPoint = viewport.viewportToViewerElementCoordinates(viewportPoint);

        // Check if this point is within canvas bounds
        if (canvasPoint.x < 0 || canvasPoint.x >= canvas.width ||
            canvasPoint.y < 0 || canvasPoint.y >= canvas.height) {
          continue; // Page is off-screen
        }

        // Sample pixels in this region
        const sampleRadius = 5;
        let blackCount = 0;
        let sampleCount = 0;

        for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
          for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
            const x = Math.floor(canvasPoint.x + dx);
            const y = Math.floor(canvasPoint.y + dy);

            if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
              const i = (y * canvas.width + x) * 4;
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];

              sampleCount++;
              if (r < 30 && g < 30 && b < 30) {
                blackCount++;
              }
            }
          }
        }

        const isBlack = sampleCount > 0 && (blackCount / sampleCount) > 0.8;
        if (isBlack) {
          emptyPageRegions++;
        } else {
          visiblePageRegions++;
        }
      }
    }

    const visibilityPercent = expectedPageRegions > 0
      ? ((visiblePageRegions / expectedPageRegions) * 100).toFixed(1)
      : '0.0';

    return {
      canvasSize: `${canvas.width}×${canvas.height}`,
      expectedPages: expectedPageRegions,
      visiblePages: visiblePageRegions,
      emptyPages: emptyPageRegions,
      visibilityPercent,
      hasContent: visiblePageRegions > 0
    };
  });

  console.log(`  Canvas: ${broadAnalysis.canvasSize}`);
  console.log(`  Expected pages (on-screen): ${broadAnalysis.expectedPages}`);
  console.log(`  Visible pages: ${broadAnalysis.visiblePages}`);
  console.log(`  Missing pages: ${broadAnalysis.emptyPages}`);
  console.log(`  Page visibility: ${broadAnalysis.visibilityPercent}%`);
  console.log(`  Status: ${broadAnalysis.hasContent ? '✓ Grid visible' : '✗ Mostly black'}\n`);

  results.broadZoom = broadAnalysis;

  // ============================================================
  // TEST 3: MINIMAP/NAVIGATOR
  // ============================================================
  console.log('=== TEST 3: Minimap/Navigator ===\n');

  // Take screenshot of navigator
  const navigatorAnalysis = await page.evaluate(() => {
    const navigator = document.querySelector('.navigator');
    if (!navigator) return { error: 'No navigator found' };

    const canvas = navigator.querySelector('canvas');
    if (!canvas) return { error: 'No navigator canvas' };

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let nonBlackPixels = 0;
    let totalSampled = 0;

    for (let i = 0; i < pixels.length; i += 400) {
      totalSampled++;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      if (r > 30 || g > 30 || b > 30) {
        nonBlackPixels++;
      }
    }

    const contentPercent = (nonBlackPixels / totalSampled) * 100;
    return {
      canvasSize: `${canvas.width}×${canvas.height}`,
      contentPercent: contentPercent.toFixed(1),
      hasContent: contentPercent > 10
    };
  });

  console.log(`  Navigator Canvas: ${navigatorAnalysis.canvasSize}`);
  console.log(`  Content: ${navigatorAnalysis.contentPercent}% visible`);
  console.log(`  Status: ${navigatorAnalysis.hasContent ? '✓ Minimap showing pages' : '✗ Mostly black'}\n`);

  results.minimap = navigatorAnalysis;

  // ============================================================
  // PAGE CACHE STATUS
  // ============================================================
  const pageCache = await page.evaluate(() => {
    const pageStreamer = window.pageStreamerRef;
    return {
      totalPages: pageStreamer.pdfDoc.numPages,
      lowResCount: pageStreamer.lowResPageCache.size,
      lowResCapacity: pageStreamer.lowResPageCache.maxSize,
      highResCount: pageStreamer.highResPageCache.size,
      highResCapacity: pageStreamer.highResPageCache.maxSize
    };
  });

  results.pageCache = pageCache;

  console.log('=== Page Cache Status ===\n');
  console.log(`  Total pages in PDF: ${pageCache.totalPages}`);
  console.log(`  Low-res cached: ${pageCache.lowResCount}/${pageCache.lowResCapacity} (${((pageCache.lowResCount/pageCache.totalPages)*100).toFixed(0)}%)`);
  console.log(`  High-res cached: ${pageCache.highResCount}/${pageCache.highResCapacity}`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n=== SUMMARY ===\n');
  console.log(`Initial View:  ${results.initialView.hasContent ? '✓' : '✗'} ${results.initialView.contentPercent}% content`);
  console.log(`Broad Zoom:    ${results.broadZoom.hasContent ? '✓' : '✗'} ${results.broadZoom.visiblePages}/${results.broadZoom.expectedPages} pages (${results.broadZoom.visibilityPercent}%)`);
  console.log(`Minimap:       ${results.minimap.hasContent ? '✓' : '✗'} ${results.minimap.contentPercent}% content`);
  console.log(`Page Cache:    ${pageCache.lowResCount}/${pageCache.totalPages} pages (${pageCache.lowResCount === pageCache.totalPages ? '✓ Complete' : '✗ Incomplete'})`);

  console.log('\n=== Test Complete ===\n');

  // ============================================================
  // ASSERTIONS
  // ============================================================

  // All views should show content
  expect(results.initialView.hasContent).toBe(true);
  expect(results.broadZoom.hasContent).toBe(true);
  expect(results.minimap.hasContent).toBe(true);

  // All pages should be cached
  expect(pageCache.lowResCount).toBe(pageCache.totalPages);

  // Initial view should have substantial content (focused on pages)
  expect(parseFloat(results.initialView.contentPercent)).toBeGreaterThan(40);

  // Broad zoom: Most expected pages should be visible (allow some missing for clamping issues)
  expect(parseFloat(results.broadZoom.visibilityPercent)).toBeGreaterThan(80);

  // Minimap should show full grid
  expect(parseFloat(results.minimap.contentPercent)).toBeGreaterThan(20);
});
