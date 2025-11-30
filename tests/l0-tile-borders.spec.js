/**
 * L0 Tile Border Test
 * Enables tile borders to visualize tile boundaries and page placement
 */

const { test, expect } = require('@playwright/test');

test('Visualize L0 tiles with borders', async ({ page }) => {
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Enable tile borders
  await page.click('button:has-text("Tile Borders")');
  await page.waitForTimeout(500);

  // Go to minimum zoom
  await page.evaluate(() => {
    const vp = window.viewer.viewport;
    vp.zoomTo(vp.getMinZoom(), null, true);
  });
  await page.waitForTimeout(2000);

  // Get L0 tile info
  const tileInfo = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const vp = window.viewer.viewport;

    // Get info about L0 tiles
    const l0Scale = Math.pow(2, 0 - ts.maxLevel);
    const tileWidthInGrid = ts.tileWidth / l0Scale;
    const tileHeightInGrid = ts.tileHeight / l0Scale;

    // How many L0 tiles cover the grid?
    const tilesWideL0 = Math.ceil(ts.gridDims.totalWidth / tileWidthInGrid);
    const tilesHighL0 = Math.ceil(ts.gridDims.totalHeight / tileWidthInGrid);

    return {
      maxLevel: ts.maxLevel,
      l0Scale,
      tileSize: ts.tileWidth,
      tileWidthInGrid,
      gridWidth: ts.gridDims.totalWidth,
      gridHeight: ts.gridDims.totalHeight,
      tilesWideL0,
      tilesHighL0,
      pageWidth: ts.gridDims.pageWidth,
      pageHeight: ts.gridDims.pageHeight,
      // Expected page size on L0 tile
      pageWidthOnL0Tile: ts.gridDims.pageWidth * l0Scale,
      pageHeightOnL0Tile: ts.gridDims.pageHeight * l0Scale,
    };
  });

  console.log('\n=== L0 TILE INFO ===');
  console.log('Max level:', tileInfo.maxLevel);
  console.log('L0 scale:', tileInfo.l0Scale.toExponential(4));
  console.log('Tile size:', tileInfo.tileSize, 'px');
  console.log('Tile covers in grid coords:', Math.round(tileInfo.tileWidthInGrid), 'units');
  console.log('Grid:', tileInfo.gridWidth, '×', tileInfo.gridHeight);
  console.log('L0 tiles needed:', tileInfo.tilesWideL0, '×', tileInfo.tilesHighL0);
  console.log('\nPage dimensions:');
  console.log('  In grid:', tileInfo.pageWidth, '×', tileInfo.pageHeight);
  console.log('  On L0 tile:', tileInfo.pageWidthOnL0Tile.toFixed(1), '×', tileInfo.pageHeightOnL0Tile.toFixed(1), 'px');

  await page.screenshot({ path: 'test-results/l0-with-borders-minzoom.png' });
  console.log('\nSaved: test-results/l0-with-borders-minzoom.png');

  // Now zoom to home
  await page.evaluate(() => {
    window.viewer.viewport.goHome(true);
  });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'test-results/l0-with-borders-home.png' });
  console.log('Saved: test-results/l0-with-borders-home.png');

  // Zoom to level 1 to see larger tiles
  await page.evaluate(() => {
    window.viewer.viewport.zoomTo(1.0, null, true);
  });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'test-results/l0-with-borders-zoom1.png' });
  console.log('Saved: test-results/l0-with-borders-zoom1.png');

  // Check what tiles are at L0 in cache
  const cacheInfo = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const l0Tiles = [];

    for (const [key, value] of ts.tileCache.cache.entries()) {
      if (key.startsWith('0_')) {
        l0Tiles.push(key);
      }
    }

    return { l0Tiles, totalCached: ts.tileCache.size };
  });

  console.log('\n=== L0 TILES IN CACHE ===');
  console.log('Total cached tiles:', cacheInfo.totalCached);
  console.log('L0 tiles:', cacheInfo.l0Tiles.length);
  cacheInfo.l0Tiles.forEach(key => console.log('  ', key));

  expect(tileInfo.tilesWideL0).toBe(1); // At L0, should be 1 tile wide
});
