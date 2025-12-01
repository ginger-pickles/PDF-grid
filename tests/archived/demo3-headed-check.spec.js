const { test, expect } = require('@playwright/test');

test('demo-3.pdf headed check for tile duplication', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('http://localhost:8000/?pdf=demo/demo-3.pdf&debug=1');

  // Wait for viewer ready
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 30000 });

  // Wait for pages to load
  await page.waitForTimeout(10000);

  // Home view - see full grid
  await page.evaluate(() => {
    window.osdViewerRef.viewport.goHome();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/demo3-headed-home.png' });

  // Zoom to 2x centered on the grid
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(2);
    viewer.viewport.panTo(new OpenSeadragon.Point(0.5, 0.3));
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-headed-zoom2.png' });

  // Zoom to 3x
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(3);
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-headed-zoom3.png' });

  // Zoom to 4x
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(4);
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-headed-zoom4.png' });

  // Zoom to 6x
  await page.evaluate(() => {
    const viewer = window.osdViewerRef;
    viewer.viewport.zoomTo(6);
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo3-headed-zoom6.png' });

  console.log('Screenshots captured - check test-results/demo3-headed-*.png');
});
