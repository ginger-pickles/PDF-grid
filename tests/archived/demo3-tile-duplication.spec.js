const { test, expect } = require('@playwright/test');

test('demo-3.pdf tile duplication at page 1 zoom', async ({ page }) => {
  test.setTimeout(90000);

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Tile') || text.includes('page') || text.includes('draw')) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });

  await page.goto('http://localhost:8000/?pdf=demo/demo-3.pdf&debug=1');

  // Wait for viewer ready
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 20000 });
  console.log('Viewer ready');

  // Wait for initial rendering
  await page.waitForTimeout(3000);

  // Get viewer bounds
  const viewer = page.locator('#osd-viewer');
  const box = await viewer.boundingBox();

  // Take initial screenshot
  await page.screenshot({ path: 'test-results/demo3-tile-dup-initial.png' });

  // Zoom in to see page 1 in top row at higher detail
  console.log('\n=== Zooming in to page 1 area ===');

  // Move to top-left area where page 1 should be
  const targetX = box.x + box.width * 0.25;
  const targetY = box.y + box.height * 0.25;

  await page.mouse.move(targetX, targetY);

  // Zoom in with mouse wheel
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => {
      const zoom = window.osdViewerRef?.viewport?.getZoom()?.toFixed(2);
      const bounds = window.osdViewerRef?.viewport?.getBounds();
      return {
        zoom,
        bounds: bounds ? {
          x: bounds.x.toFixed(3),
          y: bounds.y.toFixed(3),
          width: bounds.width.toFixed(3),
          height: bounds.height.toFixed(3)
        } : null
      };
    });

    console.log(`Zoom ${i+1}: level=${state.zoom}, bounds=${JSON.stringify(state.bounds)}`);
    await page.screenshot({ path: `test-results/demo3-tile-dup-zoom${i+1}.png` });
  }

  // Check for visual tile issues
  const finalState = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    return {
      numPages: ts?.numPages,
      lowResCached: ts?.pageStreamer?.lowResPageCache?.size,
      highResCached: ts?.pageStreamer?.highResPageCache?.size,
      tileCacheSize: ts?.tileCache?.cache?.size
    };
  });

  console.log('\n=== Final State ===');
  console.log(JSON.stringify(finalState, null, 2));

  await page.screenshot({ path: 'test-results/demo3-tile-dup-final.png', fullPage: true });
});
