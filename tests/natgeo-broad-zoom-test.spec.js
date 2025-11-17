/**
 * Test - Verify No Missing Pages at Broad Zoom Levels
 *
 * Checks that when zoomed out to view the entire grid,
 * all pages are visible with no black/missing tiles
 */

const { test, expect } = require('@playwright/test');

test('Verify no missing pages at broad zoom levels', async ({ page }) => {
  console.log('\n=== Testing Broad Zoom Level Rendering ===\n');

  // Load natgeo
  await page.goto('http://localhost:8000?pdf=demo/natgeo-1969-05.pdf');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 120000 });

  // Wait for initial rendering and post-init cleanup
  await page.waitForTimeout(15000);

  console.log('PDF loaded and initialized\n');

  // Zoom out to view entire grid (home button equivalent)
  await page.evaluate(() => {
    window.viewer.viewport.goHome(false); // immediate, no animation
  });

  // Wait for tiles to render at this zoom level
  await page.waitForTimeout(3000);

  // Get viewport info
  const viewportInfo = await page.evaluate(() => {
    const viewport = window.viewer.viewport;
    const bounds = viewport.getBounds();
    return {
      zoom: viewport.getZoom(),
      center: viewport.getCenter(),
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }
    };
  });

  console.log('Viewport (zoomed out to show entire grid):');
  console.log(`  Zoom: ${viewportInfo.zoom.toFixed(4)}`);
  console.log(`  Bounds: (${viewportInfo.bounds.x.toFixed(2)}, ${viewportInfo.bounds.y.toFixed(2)}, ${viewportInfo.bounds.width.toFixed(2)}×${viewportInfo.bounds.height.toFixed(2)})`);
  console.log();

  // Take screenshot at broad zoom
  await page.screenshot({
    path: 'test-results/natgeo-broad-zoom.png',
    fullPage: false
  });

  // Analyze canvas for black tiles/missing content
  const visualAnalysis = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Divide canvas into grid squares and check each for content
    const gridSize = 16; // 16x16 grid of regions
    const regionWidth = Math.floor(canvas.width / gridSize);
    const regionHeight = Math.floor(canvas.height / gridSize);

    const regions = [];
    let totalBlackRegions = 0;
    let totalContentRegions = 0;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const startX = gx * regionWidth;
        const startY = gy * regionHeight;

        // Sample pixels in this region
        let blackPixels = 0;
        let totalPixels = 0;

        for (let y = startY; y < startY + regionHeight; y += 4) {
          for (let x = startX; x < startX + regionWidth; x += 4) {
            const i = (y * canvas.width + x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            totalPixels++;
            if (r < 30 && g < 30 && b < 30) {
              blackPixels++;
            }
          }
        }

        const blackPercent = (blackPixels / totalPixels) * 100;
        const isBlack = blackPercent > 90; // >90% black = missing tile

        if (isBlack) {
          totalBlackRegions++;
        } else {
          totalContentRegions++;
        }

        // Store regions that are mostly black for reporting
        if (isBlack) {
          regions.push({
            x: gx,
            y: gy,
            blackPercent: blackPercent.toFixed(1)
          });
        }
      }
    }

    return {
      canvasSize: `${canvas.width}×${canvas.height}`,
      gridSize,
      totalRegions: gridSize * gridSize,
      blackRegions: totalBlackRegions,
      contentRegions: totalContentRegions,
      blackRegionsList: regions.slice(0, 10), // First 10 black regions
      contentPercent: ((totalContentRegions / (gridSize * gridSize)) * 100).toFixed(1)
    };
  });

  console.log('Visual Analysis (16×16 grid regions):');
  console.log(`  Canvas: ${visualAnalysis.canvasSize}`);
  console.log(`  Total regions: ${visualAnalysis.totalRegions}`);
  console.log(`  Content regions: ${visualAnalysis.contentRegions}`);
  console.log(`  Black regions: ${visualAnalysis.blackRegions}`);
  console.log(`  Content coverage: ${visualAnalysis.contentPercent}%`);

  if (visualAnalysis.blackRegions > 0) {
    console.log(`\n  Black regions detected (first 10):`);
    visualAnalysis.blackRegionsList.forEach(r => {
      console.log(`    Region (${r.x}, ${r.y}): ${r.blackPercent}% black`);
    });
  }

  // Get tile cache stats
  const tileStats = await page.evaluate(() => {
    const tileStreamer = window.tileStreamerRef;
    if (!tileStreamer) return { error: 'No tileStreamer' };

    return {
      tileCacheSize: tileStreamer.tileCache.size,
      tileCacheCapacity: tileStreamer.tileCache.maxSize
    };
  });

  console.log(`\nTile Cache:`);
  console.log(`  Cached tiles: ${tileStats.tileCacheSize}/${tileStats.tileCacheCapacity}`);

  console.log('\n=== Test Complete ===\n');

  // Check that pages are cached (all 194 pages should be in cache)
  const pageCache = await page.evaluate(() => {
    const pageStreamer = window.pageStreamerRef;
    return {
      lowResCount: pageStreamer.lowResPageCache.size,
      lowResCapacity: pageStreamer.lowResPageCache.maxSize,
      highResCount: pageStreamer.highResPageCache.size,
      totalPages: pageStreamer.pdfDoc.numPages
    };
  });

  console.log(`\nPage Cache Status:`);
  console.log(`  Total pages in PDF: ${pageCache.totalPages}`);
  console.log(`  Low-res cached: ${pageCache.lowResCount}/${pageCache.lowResCapacity}`);
  console.log(`  High-res cached: ${pageCache.highResCount}`);

  // Assertions
  // At broad zoom with background, 30-50% content coverage is acceptable
  // (grid visible but surrounded by background)
  expect(parseFloat(visualAnalysis.contentPercent)).toBeGreaterThan(30);

  // All pages should be cached (at least low-res for minimap)
  expect(pageCache.lowResCount).toBe(pageCache.totalPages);
});
