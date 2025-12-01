/**
 * Simple diagnostic for demo-3.pdf rendering
 */
const { test, expect } = require('@playwright/test');

test('Demo-3 simple diagnostic', async ({ page }) => {
  console.log('\n=== DEMO-3 SIMPLE DIAGNOSTIC ===\n');

  // Capture all console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[') || text.includes('Error') || text.includes('render')) {
      console.log(`[Console] ${text}`);
    }
  });

  // Load demo-3.pdf
  await page.goto('http://localhost:8000?pdf=demo/demo-3.pdf&debug=1');

  // Wait for viewer ready
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  console.log('Viewer ready');

  // Get basic info
  const info = await page.evaluate(() => ({
    numPages: window.pdfDocRef?.numPages || 'unknown',
    hasPageStreamer: !!window.pageStreamerRef,
    hasTileStreamer: !!window.tileStreamerRef,
    hasViewer: !!window.viewer
  }));
  console.log(`Pages: ${info.numPages}`);
  console.log(`PageStreamer: ${info.hasPageStreamer}`);
  console.log(`TileStreamer: ${info.hasTileStreamer}`);
  console.log(`Viewer: ${info.hasViewer}`);

  // Wait 2 seconds
  await page.waitForTimeout(2000);

  // Check cache stats
  const stats1 = await page.evaluate(() => {
    const stats = window.__PDFGridDiagnostics?.getCacheStats();
    return {
      lowRes: stats?.pages?.low || 0,
      highRes: stats?.pages?.high || 0,
      tiles: stats?.tiles || 0
    };
  });
  console.log(`\nAfter 2s:`);
  console.log(`  Low-res pages: ${stats1.lowRes}`);
  console.log(`  High-res pages: ${stats1.highRes}`);
  console.log(`  Tiles: ${stats1.tiles}`);

  // Screenshot
  await page.screenshot({ path: 'test-results/demo3-simple-2s.png', fullPage: false });
  console.log('Screenshot saved: demo3-simple-2s.png');

  // Wait 8 more seconds
  await page.waitForTimeout(8000);

  // Check cache stats again
  const stats2 = await page.evaluate(() => {
    const stats = window.__PDFGridDiagnostics?.getCacheStats();
    return {
      lowRes: stats?.pages?.low || 0,
      highRes: stats?.pages?.high || 0,
      tiles: stats?.tiles || 0
    };
  });
  console.log(`\nAfter 10s total:`);
  console.log(`  Low-res pages: ${stats2.lowRes}`);
  console.log(`  High-res pages: ${stats2.highRes}`);
  console.log(`  Tiles: ${stats2.tiles}`);

  // Screenshot
  await page.screenshot({ path: 'test-results/demo3-simple-10s.png', fullPage: false });
  console.log('Screenshot saved: demo3-simple-10s.png');

  // Check the actual OSD canvas
  const canvasInfo = await page.evaluate(() => {
    const osdContainer = document.querySelector('.openseadragon-container');
    const canvas = document.querySelector('.openseadragon-canvas canvas');

    if (!canvas) return { error: 'No canvas found' };

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    // Sample from actual canvas center
    const cx = Math.floor(canvas.width / 2);
    const cy = Math.floor(canvas.height / 2);

    // Get a single pixel from center
    const pixel = ctx.getImageData(cx, cy, 1, 1).data;

    // Sample a grid of pixels
    const samples = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const px = Math.floor(canvas.width * (0.2 + x * 0.15));
        const py = Math.floor(canvas.height * (0.2 + y * 0.15));
        const p = ctx.getImageData(px, py, 1, 1).data;
        samples.push(`(${p[0]},${p[1]},${p[2]})`);
      }
    }

    return {
      canvasSize: `${canvas.width}x${canvas.height}`,
      boundingRect: `${Math.round(rect.width)}x${Math.round(rect.height)} at (${Math.round(rect.left)},${Math.round(rect.top)})`,
      centerPixel: `RGB(${pixel[0]},${pixel[1]},${pixel[2]})`,
      sampleGrid: samples.join(' ')
    };
  });

  console.log(`\nCanvas info:`);
  console.log(`  Size: ${canvasInfo.canvasSize}`);
  console.log(`  Bounding: ${canvasInfo.boundingRect}`);
  console.log(`  Center pixel: ${canvasInfo.centerPixel}`);
  console.log(`  Sample grid (5x5): ${canvasInfo.sampleGrid}`);

  // Check if center pixel looks like stripe (dark blue-gray)
  const isStripe = canvasInfo.centerPixel?.match(/RGB\((\d+),(\d+),(\d+)\)/);
  if (isStripe) {
    const [_, r, g, b] = isStripe;
    const looksLikeStripe = parseInt(r) < 50 && parseInt(g) < 50 && parseInt(b) < 70;
    console.log(`\n  CENTER PIXEL IS ${looksLikeStripe ? 'STRIPE (RENDERING FAILED)' : 'CONTENT'}`);
  }

  // Basic assertion
  expect(stats2.lowRes).toBeGreaterThan(0);
});
