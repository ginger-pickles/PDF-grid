/**
 * L0 Measurement Test
 * Measures actual page sizes on screen at different zoom levels
 */

const { test, expect } = require('@playwright/test');

test('Measure page sizes at different zoom levels', async ({ page }) => {
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Get grid info
  const gridInfo = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const vp = window.viewer.viewport;
    const container = vp.getContainerSize();

    // In OSD, the image width is normalized to 1.0
    // The aspect ratio determines the height
    const aspectRatio = ts.gridDims.totalHeight / ts.gridDims.totalWidth;

    return {
      gridWidth: ts.gridDims.totalWidth,
      gridHeight: ts.gridDims.totalHeight,
      pageWidth: ts.gridDims.pageWidth,
      pageHeight: ts.gridDims.pageHeight,
      aspectRatio,
      containerWidth: container.x,
      containerHeight: container.y,
      // Page dimensions as fraction of grid
      pageWidthNorm: ts.gridDims.pageWidth / ts.gridDims.totalWidth,
      pageHeightNorm: ts.gridDims.pageHeight / ts.gridDims.totalWidth, // Note: relative to width for OSD
    };
  });

  console.log('\n=== GRID INFO ===');
  console.log('Grid:', gridInfo.gridWidth, '×', gridInfo.gridHeight);
  console.log('Page:', gridInfo.pageWidth, '×', gridInfo.pageHeight);
  console.log('Page as fraction of grid width:', gridInfo.pageWidthNorm.toFixed(4));
  console.log('Container:', gridInfo.containerWidth, '×', gridInfo.containerHeight);

  // Test at different zoom levels
  const zoomLevels = [
    { name: 'min', getZoom: 'viewport.getMinZoom()' },
    { name: 'home', getZoom: 'viewport.getHomeZoom()' },
    { name: '1.0', getZoom: '1.0' },
    { name: '2.0', getZoom: '2.0' },
  ];

  console.log('\n=== PAGE SIZE AT DIFFERENT ZOOMS ===');
  console.log('(Page width on screen = pageWidthNorm × zoom × containerWidth)');
  console.log('');

  for (const level of zoomLevels) {
    const result = await page.evaluate((zoomExpr) => {
      const vp = window.viewer.viewport;
      const container = vp.getContainerSize();
      const ts = window.tileStreamerRef;

      // Get the target zoom
      const zoom = eval(zoomExpr.replace('viewport', 'vp'));

      // Page width in normalized OSD coordinates
      const pageWidthNorm = ts.gridDims.pageWidth / ts.gridDims.totalWidth;

      // Page width on screen = (normalized width) × zoom × container width
      // In OSD: at zoom=1, the entire image (width=1 in norm coords) fills the container
      const pageWidthScreen = pageWidthNorm * zoom * container.x;
      const pageHeightScreen = (ts.gridDims.pageHeight / ts.gridDims.totalWidth) * zoom * container.x;

      return {
        zoom,
        pageWidthScreen: Math.round(pageWidthScreen),
        pageHeightScreen: Math.round(pageHeightScreen),
      };
    }, level.getZoom);

    console.log(`Zoom ${level.name} (${result.zoom.toFixed(4)}): page = ${result.pageWidthScreen} × ${result.pageHeightScreen} px`);
  }

  // Now visually verify by zooming to make pages ~200px wide
  const targetWidth = 200;
  const neededZoom = targetWidth / (gridInfo.pageWidthNorm * gridInfo.containerWidth);

  console.log(`\nTo get ${targetWidth}px pages, need zoom: ${neededZoom.toFixed(4)}`);

  await page.evaluate((zoom) => {
    window.viewer.viewport.zoomTo(zoom, null, true);
  }, neededZoom);
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'test-results/l0-200px-pages.png' });
  console.log('Saved: test-results/l0-200px-pages.png (pages should be ~200px wide)');

  // Verify at minimum zoom - pages should be small but visible
  await page.evaluate(() => {
    const vp = window.viewer.viewport;
    vp.zoomTo(vp.getMinZoom(), null, true);
    vp.panTo(vp.getHomeBounds().getCenter(), true);
  });
  await page.waitForTimeout(1500);

  const minZoomInfo = await page.evaluate(() => {
    const vp = window.viewer.viewport;
    const ts = window.tileStreamerRef;
    const container = vp.getContainerSize();
    const zoom = vp.getZoom();
    const pageWidthNorm = ts.gridDims.pageWidth / ts.gridDims.totalWidth;

    return {
      zoom,
      pageWidthScreen: Math.round(pageWidthNorm * zoom * container.x),
    };
  });

  console.log(`\nAt minimum zoom (${minZoomInfo.zoom.toFixed(4)}): pages are ${minZoomInfo.pageWidthScreen}px wide`);

  await page.screenshot({ path: 'test-results/l0-min-zoom-measured.png' });
  console.log('Saved: test-results/l0-min-zoom-measured.png');

  // The pages at min zoom should be roughly 30-50px based on the calculations
  expect(minZoomInfo.pageWidthScreen).toBeGreaterThan(20);
  expect(minZoomInfo.pageWidthScreen).toBeLessThan(100);
});
