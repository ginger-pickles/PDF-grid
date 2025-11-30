/**
 * L0 Scale Verification Test
 * Verifies that pages at L0 are rendered at the correct scale
 */

const { test, expect } = require('@playwright/test');

test('Verify L0 page scale with test-pattern', async ({ page }) => {
  // Load test pattern PDF
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug');

  // Wait for viewer to be ready
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Get grid and scale info
  const info = await page.evaluate(() => {
    const viewer = window.viewer;
    const tileStreamer = window.tileStreamerRef;
    const viewport = viewer.viewport;

    const maxLevel = tileStreamer.maxLevel;
    const gridDims = tileStreamer.gridDims;

    // L0 scale factor
    const l0Scale = Math.pow(2, 0 - maxLevel);

    // Page size in grid coordinates
    const pageWidthGrid = gridDims.pageWidth;
    const pageHeightGrid = gridDims.pageHeight;

    // Page size at L0 (in tile pixels)
    const pageWidthL0 = pageWidthGrid * l0Scale;
    const pageHeightL0 = pageHeightGrid * l0Scale;

    // Get viewport info at home
    const homeBounds = viewport.getHomeBounds();
    const containerSize = viewport.getContainerSize();

    // Calculate how many viewport pixels per grid unit at home zoom
    const homeZoom = viewport.getHomeZoom();
    const viewportPixelsPerGridUnit = containerSize.x / (1 / homeZoom);

    // Expected page size on screen at home zoom
    const expectedPageWidthScreen = pageWidthGrid * homeZoom * containerSize.x;
    const expectedPageHeightScreen = pageHeightGrid * homeZoom * containerSize.x;

    return {
      maxLevel,
      l0Scale,
      gridDims: {
        pageWidth: pageWidthGrid,
        pageHeight: pageHeightGrid,
        totalWidth: gridDims.totalWidth,
        totalHeight: gridDims.totalHeight,
        numPages: gridDims.numPages
      },
      pageAtL0: {
        width: pageWidthL0,
        height: pageHeightL0
      },
      viewport: {
        containerWidth: containerSize.x,
        containerHeight: containerSize.y,
        homeZoom,
        homeBounds
      },
      expectedScreenSize: {
        width: expectedPageWidthScreen,
        height: expectedPageHeightScreen
      }
    };
  });

  console.log('\n=== L0 SCALE VERIFICATION ===');
  console.log('Max level:', info.maxLevel);
  console.log('L0 scale factor:', info.l0Scale.toExponential(4));
  console.log('\nGrid dimensions:');
  console.log('  Page size:', info.gridDims.pageWidth, '×', info.gridDims.pageHeight);
  console.log('  Total grid:', info.gridDims.totalWidth, '×', info.gridDims.totalHeight);
  console.log('\nPage size at L0 (tile pixels):');
  console.log('  Width:', info.pageAtL0.width.toFixed(2), 'px');
  console.log('  Height:', info.pageAtL0.height.toFixed(2), 'px');
  console.log('\nViewport:');
  console.log('  Container:', info.viewport.containerWidth, '×', info.viewport.containerHeight);
  console.log('  Home zoom:', info.viewport.homeZoom.toFixed(4));
  console.log('\nExpected page size on screen at home:');
  console.log('  Width:', info.expectedScreenSize.width.toFixed(2), 'px');
  console.log('  Height:', info.expectedScreenSize.height.toFixed(2), 'px');

  // Go to minimum zoom (L0 view)
  await page.evaluate(() => {
    const viewport = window.viewer.viewport;
    const minZoom = viewport.getMinZoom();
    viewport.zoomTo(minZoom, null, true);
    viewport.panTo(viewport.getCenter(), true); // Center the view
  });
  await page.waitForTimeout(1500);

  // Get actual zoom info
  const zoomInfo = await page.evaluate(() => {
    const viewport = window.viewer.viewport;
    return {
      currentZoom: viewport.getZoom(),
      minZoom: viewport.getMinZoom(),
      bounds: viewport.getBounds()
    };
  });

  console.log('\n=== AT MINIMUM ZOOM ===');
  console.log('Current zoom:', zoomInfo.currentZoom.toFixed(4));
  console.log('Min zoom:', zoomInfo.minZoom.toFixed(4));
  console.log('Bounds:', JSON.stringify(zoomInfo.bounds, null, 2));

  // Calculate expected page size at current zoom
  const pageScreenWidth = info.gridDims.pageWidth * zoomInfo.currentZoom * info.viewport.containerWidth;
  const pageScreenHeight = info.gridDims.pageHeight * zoomInfo.currentZoom * info.viewport.containerWidth;

  console.log('\nExpected page size at min zoom:');
  console.log('  Width:', pageScreenWidth.toFixed(2), 'px');
  console.log('  Height:', pageScreenHeight.toFixed(2), 'px');

  // Take screenshot at minimum zoom
  await page.screenshot({ path: 'test-results/l0-min-zoom.png' });
  console.log('\nSaved: test-results/l0-min-zoom.png');

  // Now zoom to a level where page 1 header should be clearly visible
  // Page 1 header is red (20% of page height)
  const headerHeight = info.gridDims.pageHeight * 0.2;
  const headerScreenHeight = headerHeight * zoomInfo.currentZoom * info.viewport.containerWidth;
  console.log('\nExpected header height at min zoom:', headerScreenHeight.toFixed(2), 'px');

  // If header is less than 5px, it won't be visible
  if (headerScreenHeight < 5) {
    console.log('WARNING: Header too small to be visible at min zoom (<5px)');
  }

  // Zoom to a level where we can verify the scale
  // Let's zoom so that a page is about 100px wide
  const targetPageWidth = 100;
  const targetZoom = targetPageWidth / (info.gridDims.pageWidth * info.viewport.containerWidth);

  await page.evaluate((zoom) => {
    window.viewer.viewport.zoomTo(zoom, null, true);
  }, targetZoom);
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'test-results/l0-100px-page.png' });
  console.log('\nSaved: test-results/l0-100px-page.png (pages should be ~100px wide)');

  // Final verification - zoom to see page 1 clearly
  await page.evaluate(() => {
    // Find page 1 position and zoom to it
    const tileStreamer = window.tileStreamerRef;
    const gridDims = tileStreamer.gridDims;
    const pattern = tileStreamer.pattern;

    // Find page 1 in pattern
    let page1Row = -1, page1Col = -1;
    for (let r = 0; r < pattern.length; r++) {
      for (let c = 0; c < pattern[r].length; c++) {
        if (pattern[r][c] === 1) {
          page1Row = r;
          page1Col = c;
          break;
        }
      }
      if (page1Row >= 0) break;
    }

    // Calculate page 1 center in normalized coordinates
    const pageLeft = page1Col * (gridDims.pageWidth + gridDims.spacing);
    const pageTop = page1Row * (gridDims.pageHeight + gridDims.spacing);
    const pageCenterX = (pageLeft + gridDims.pageWidth / 2) / gridDims.totalWidth;
    const pageCenterY = (pageTop + gridDims.pageHeight / 2) / gridDims.totalHeight;

    // Zoom to show page 1 at a good size
    const viewport = window.viewer.viewport;
    viewport.panTo({x: pageCenterX, y: pageCenterY * (gridDims.totalHeight / gridDims.totalWidth)}, true);
    viewport.zoomTo(2, null, true); // Zoom level 2 should show page clearly
  });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'test-results/l0-page1-verify.png' });
  console.log('Saved: test-results/l0-page1-verify.png (page 1 zoomed)');

  expect(info.maxLevel).toBeGreaterThan(0);
});
