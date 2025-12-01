/**
 * Grid Layout Diagnostic Test
 * Examines the grid pattern and page positions to verify correct rendering
 */

const { test, expect } = require('@playwright/test');

test('Diagnose grid layout and page positions', async ({ page }) => {
  // Load demo-1.pdf (12 pages)
  await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug');

  // Wait for viewer to be ready
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Get comprehensive grid info
  const gridInfo = await page.evaluate(() => {
    const viewer = window.viewer;
    const tileStreamer = window.tileStreamerRef;

    if (!tileStreamer) {
      return { error: 'No tileStreamer available' };
    }

    // Get grid dimensions
    const gridDims = tileStreamer.gridDims;

    // Get OSD config
    const osdConfig = tileStreamer.getOSDConfig();

    // Get viewport info
    const viewport = viewer.viewport;
    const bounds = viewport.getBounds();
    const homeBounds = viewport.getHomeBounds();

    // Get page positions from grid pattern
    const pattern = gridDims.pattern;
    const pagePositions = [];

    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        const pageNum = pattern[row][col];
        if (pageNum > 0) {
          const x = col * (gridDims.pageWidth + gridDims.spacing);
          const y = row * (gridDims.pageHeight + gridDims.spacing);
          pagePositions.push({
            page: pageNum,
            row,
            col,
            x,
            y,
            right: x + gridDims.pageWidth,
            bottom: y + gridDims.pageHeight
          });
        }
      }
    }

    // Find page 1 position
    const page1 = pagePositions.find(p => p.page === 1);

    return {
      gridDims: {
        gridSize: gridDims.gridSize,
        pageWidth: gridDims.pageWidth,
        pageHeight: gridDims.pageHeight,
        spacing: gridDims.spacing,
        totalWidth: gridDims.totalWidth,
        totalHeight: gridDims.totalHeight,
        numPages: gridDims.numPages
      },
      osdConfig: {
        width: osdConfig.width,
        height: osdConfig.height,
        tileSize: osdConfig.tileSize,
        minLevel: osdConfig.minLevel,
        maxLevel: osdConfig.maxLevel
      },
      viewport: {
        zoom: viewport.getZoom(),
        center: { x: viewport.getCenter().x, y: viewport.getCenter().y },
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        homeBounds: { x: homeBounds.x, y: homeBounds.y, width: homeBounds.width, height: homeBounds.height }
      },
      page1Position: page1,
      patternSample: pattern.slice(0, 5).map(row => row.slice(0, 8))
    };
  });

  console.log('\n=== GRID DIMENSIONS ===');
  console.log(JSON.stringify(gridInfo.gridDims, null, 2));

  console.log('\n=== OSD CONFIG ===');
  console.log(JSON.stringify(gridInfo.osdConfig, null, 2));

  console.log('\n=== VIEWPORT STATE ===');
  console.log(JSON.stringify(gridInfo.viewport, null, 2));

  console.log('\n=== PAGE 1 POSITION ===');
  console.log(JSON.stringify(gridInfo.page1Position, null, 2));

  console.log('\n=== GRID PATTERN (first 5 rows, 8 cols) ===');
  if (gridInfo.patternSample) {
    gridInfo.patternSample.forEach((row, i) => {
      console.log(`Row ${i}: [${row.join(', ')}]`);
    });
  }

  // Calculate where page 1 should be in viewport coordinates
  if (gridInfo.page1Position && gridInfo.osdConfig) {
    const page1 = gridInfo.page1Position;
    const totalWidth = gridInfo.osdConfig.width;

    // Convert pixel coordinates to viewport coordinates (normalized 0-1 for width)
    const aspectRatio = gridInfo.osdConfig.height / gridInfo.osdConfig.width;
    const page1ViewportX = page1.x / totalWidth;
    const page1ViewportY = page1.y / totalWidth; // OSD uses width as reference

    console.log('\n=== EXPECTED PAGE 1 IN VIEWPORT ===');
    console.log(`Page 1 pixel position: (${page1.x}, ${page1.y})`);
    console.log(`Page 1 viewport position: (${page1ViewportX.toFixed(4)}, ${page1ViewportY.toFixed(4)})`);
    console.log(`Current viewport center: (${gridInfo.viewport.center.x.toFixed(4)}, ${gridInfo.viewport.center.y.toFixed(4)})`);
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/grid-layout-diagnostic.png' });

  // Basic assertions
  expect(gridInfo.gridDims).toBeDefined();
  expect(gridInfo.gridDims.numPages).toBeGreaterThan(0);
});
