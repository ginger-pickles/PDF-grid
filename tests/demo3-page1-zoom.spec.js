const { test, expect } = require('@playwright/test');

test('demo-3.pdf zoom to page 1 - check for tile duplication', async ({ page }) => {
  test.setTimeout(120000);

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('dup') || text.includes('Tile') || text.includes('draw')) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });

  await page.goto('http://localhost:8000/?pdf=demo/demo-3.pdf&debug=1');

  // Wait for viewer ready
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 30000 });
  console.log('Viewer ready');

  // Wait for pages to render
  await page.waitForTimeout(8000);

  // Get grid info to find where page 1 is
  const gridInfo = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const dims = ts?.dimensions;
    // Page 1 position in the grid
    const page1Pos = ts?.getPagePosition?.(1);
    return {
      numPages: ts?.numPages,
      dims,
      page1Pos,
      lowResCached: ts?.pageStreamer?.lowResPageCache?.size
    };
  });
  console.log('Grid info:', JSON.stringify(gridInfo, null, 2));

  // Screenshot initial view
  await page.screenshot({ path: 'test-results/demo3-p1-initial.png' });

  // Pan to center on page 1 area (top-left of grid)
  // Grid starts at top-left, page 1 should be near 0.15, 0.15 in normalized coords
  console.log('\n=== Zooming to page 1 area ===');

  // Zoom 1: slight zoom, should show top row including page 1
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(1.5);
    viewer.viewport.panTo(new OpenSeadragon.Point(0.3, 0.25));
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-p1-zoom1.5.png' });
  console.log('Zoom 1.5 - top row view');

  // Zoom 2: closer, page 1 fills more of viewport
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(3);
    viewer.viewport.panTo(new OpenSeadragon.Point(0.2, 0.15));
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-p1-zoom3.png' });
  console.log('Zoom 3 - closer to page 1');

  // Zoom 3: even closer - this is where duplication might appear
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(5);
    viewer.viewport.panTo(new OpenSeadragon.Point(0.15, 0.12));
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-p1-zoom5.png' });
  console.log('Zoom 5 - page 1 detail');

  // Get current tile level info
  const tileInfo = await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    const tiledImage = viewer.world.getItemAt(0);
    return {
      zoom: viewer.viewport.getZoom()?.toFixed(2),
      level: tiledImage?.lastDrawnLevel,
      bounds: viewer.viewport.getBounds()
    };
  });
  console.log('Final tile info:', JSON.stringify(tileInfo));

  console.log('\n=== Check screenshots for tile duplication ===');
});
