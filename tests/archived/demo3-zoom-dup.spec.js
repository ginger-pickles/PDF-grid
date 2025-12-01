const { test, expect } = require('@playwright/test');

test('demo-3.pdf tile duplication when zoomed to page 1', async ({ page }) => {
  test.setTimeout(120000);

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Tile') || text.includes('draw') || text.includes('generate')) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });

  await page.goto('http://localhost:8000/?pdf=demo/demo-3.pdf&debug=1');

  // Wait for viewer ready
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 30000 });
  console.log('Viewer ready');

  // Wait for some pages to render
  await page.waitForTimeout(5000);

  // Take initial screenshot
  await page.screenshot({ path: 'test-results/demo3-dup-1-initial.png' });

  // Use OSD API to zoom in to page 1 area
  console.log('\n=== Zooming via OSD API ===');

  // Zoom level 1 - slight zoom
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(2);
    viewer.viewport.panTo(new OpenSeadragon.Point(0.15, 0.15));
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/demo3-dup-2-zoom2.png' });
  console.log('Zoom level 2 captured');

  // Zoom level 2 - more zoom
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(4);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/demo3-dup-3-zoom4.png' });
  console.log('Zoom level 4 captured');

  // Zoom level 3 - where duplication might occur
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(8);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/demo3-dup-4-zoom8.png' });
  console.log('Zoom level 8 captured');

  // Zoom level 4 - even more
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(16);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/demo3-dup-5-zoom16.png' });
  console.log('Zoom level 16 captured');

  // Get tile info at this zoom
  const tileInfo = await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    const tiledImage = viewer.world.getItemAt(0);
    const zoom = viewer.viewport.getZoom();
    const level = tiledImage ? tiledImage.lastDrawnLevel : null;
    return {
      zoom: zoom?.toFixed(2),
      level,
      bounds: viewer.viewport.getBounds()
    };
  });
  console.log('Tile info:', JSON.stringify(tileInfo));

  console.log('\nTest complete - check screenshots for duplication');
});
