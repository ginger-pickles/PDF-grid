/**
 * Test Pattern Visual Verification
 * Uses numbered pages to verify grid layout is correct
 */

const { test, expect } = require('@playwright/test');

test.describe('Test Pattern Visual Verification', () => {

  test('Verify grid pattern with numbered pages', async ({ page }) => {
    // Load test pattern PDF
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Get grid info
    const gridInfo = await page.evaluate(() => {
      const tileStreamer = window.tileStreamerRef;
      if (!tileStreamer) return null;

      const gridDims = tileStreamer.gridDims;
      return {
        gridSize: gridDims.gridSize,
        numPages: gridDims.numPages,
        pageWidth: gridDims.pageWidth,
        pageHeight: gridDims.pageHeight,
        totalWidth: gridDims.totalWidth,
        totalHeight: gridDims.totalHeight
      };
    });

    console.log('\n=== GRID INFO ===');
    console.log('Grid size:', gridInfo?.gridSize);
    console.log('Num pages:', gridInfo?.numPages);
    console.log('Page dimensions:', gridInfo?.pageWidth, 'x', gridInfo?.pageHeight);
    console.log('Total grid:', gridInfo?.totalWidth, 'x', gridInfo?.totalHeight);
    console.log('\nExpected staggered pattern for 12 pages (5x5 grid):');
    console.log('Colors: 1=Red, 2=Blue, 3=Green, 4=Orange, 5=Purple, 6=Pink, 7+=Black');
    console.log('Row 0: [_, _, 1, 2, 3]');
    console.log('Row 1: [_, 1, 2, 3, 4]');
    console.log('Row 2: [1, 2, 3, 4, 5]');
    console.log('Row 3: [2, 3, 4, 5, 6]');
    console.log('Row 4: [3, 4, 5, 6, _]');

    // Screenshot 1: Home view (should show overview)
    await page.evaluate(() => {
      window.viewer.viewport.goHome(true);
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/test-pattern-home.png' });
    console.log('\nSaved: test-pattern-home.png (should show grid overview)');

    // Screenshot 2: Zoom to show full grid
    await page.evaluate(() => {
      // Zoom out to minimum to see full grid
      const minZoom = window.viewer.viewport.getMinZoom();
      window.viewer.viewport.zoomTo(minZoom, null, true);
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/test-pattern-full-grid.png' });

    const minZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log('Saved: test-pattern-full-grid.png (min zoom:', minZoom.toFixed(3), ')');

    // Screenshot 3: Zoom to page 1 area
    await page.evaluate(() => {
      const tileStreamer = window.tileStreamerRef;
      const gridDims = tileStreamer.gridDims;
      const halfN = Math.floor(gridDims.gridSize / 2);

      // Page 1 is at row 0, col halfN in staggered pattern
      const page1X = halfN * (gridDims.pageWidth + gridDims.spacing) + gridDims.pageWidth / 2;
      const page1Y = 0 + gridDims.pageHeight / 2;

      // Convert to viewport coordinates
      const totalWidth = gridDims.totalWidth;
      const vpX = page1X / totalWidth;
      const vpY = page1Y / totalWidth;

      const point = new OpenSeadragon.Point(vpX, vpY);
      window.viewer.viewport.panTo(point, true);
      window.viewer.viewport.zoomTo(3, null, true);
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/test-pattern-page1.png' });
    console.log('Saved: test-pattern-page1.png (should show page 1 with number "1")');

    // Screenshot 4: Center of grid (should show pages 2,3,4,5)
    await page.evaluate(() => {
      window.viewer.viewport.goHome(true);
      window.viewer.viewport.zoomTo(1.5, null, true);
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/test-pattern-center.png' });
    console.log('Saved: test-pattern-center.png (should show center pages)');

    expect(gridInfo).not.toBeNull();
  });
});
