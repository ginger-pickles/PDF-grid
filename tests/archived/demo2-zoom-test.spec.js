const { test, expect } = require('@playwright/test');

test('demo-2.pdf blank tiles at zoom levels', async ({ page }) => {
  test.setTimeout(60000);

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[Auto-Inspector]') || text.includes('[Tile')) {
      console.log(text);
    }
  });

  await page.goto('http://localhost:8000/?pdf=demo/demo-2.pdf&debug=1');
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 15000 });

  const info = await page.evaluate(() => ({
    numPages: window.tileStreamerRef?.numPages,
    maxLevel: window.tileStreamerRef?.maxLevel,
    lowResCached: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size,
    highResCached: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size
  }));
  console.log('PDF Info:', JSON.stringify(info));

  // Wait for initial load
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/demo2-initial.png' });

  // Test different zoom levels
  const viewer = page.locator('#osd-viewer');
  const box = await viewer.boundingBox();

  console.log('\n=== Testing zoom levels ===');

  // Zoom in step by step
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => ({
      zoom: window.osdViewerRef?.viewport?.getZoom()?.toFixed(2),
      lowRes: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size,
      highRes: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size,
      tileCacheSize: window.tileStreamerRef?.tileCache?.cache?.size,
      visual: window.tileStreamerRef?.inspectVisual()
    }));

    console.log(`Zoom ${i+1}: level=${state.zoom}, lowRes=${state.lowRes}, highRes=${state.highRes}, tiles=${state.tileCacheSize}, stripes=${state.visual?.hasRedStripes}`);
    await page.screenshot({ path: `test-results/demo2-zoom${i+1}.png` });
  }

  // Check final state
  const finalState = await page.evaluate(() => ({
    numPages: window.tileStreamerRef?.numPages,
    lowResCached: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size,
    highResCached: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size,
    tileCacheSize: window.tileStreamerRef?.tileCache?.cache?.size
  }));
  console.log('\nFinal state:', JSON.stringify(finalState));
});
