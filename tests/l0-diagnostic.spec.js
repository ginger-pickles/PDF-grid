/**
 * L0 Tile Diagnostic Test
 * Examines what's happening at the lowest zoom level
 */

const { test, expect } = require('@playwright/test');

test('Diagnose L0 tile rendering', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push('[' + msg.type() + '] ' + msg.text());
  });

  // Load test pattern PDF
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug');

  // Wait for viewer to be ready
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get L0 tile info
  const l0Info = await page.evaluate(() => {
    const viewer = window.viewer;
    const tileStreamer = window.tileStreamerRef;

    if (!tileStreamer) return { error: 'No tileStreamer' };

    const maxLevel = tileStreamer.maxLevel;
    const gridDims = tileStreamer.gridDims;

    // Calculate L0 scale
    const l0Scale = Math.pow(2, 0 - maxLevel);
    const tileWidthInGrid = tileStreamer.tileWidth / l0Scale;

    // Get cache stats from diagnostics
    const cacheStats = window.__PDFGridDiagnostics?.getCacheStats?.() || {};

    // Get L0 tile count
    let l0TileCount = 0;
    let l0TileKeys = [];
    try {
      const cache = tileStreamer.tileCache?.cache;
      if (cache instanceof Map) {
        for (const key of cache.keys()) {
          if (key.startsWith('0_')) {
            l0TileCount++;
            l0TileKeys.push(key);
          }
        }
      }
    } catch (e) {
      // Ignore cache iteration errors
    }

    return {
      maxLevel,
      l0Scale,
      tileWidthInGrid,
      tileSize: tileStreamer.tileWidth,
      gridDims: {
        totalWidth: gridDims.totalWidth,
        totalHeight: gridDims.totalHeight,
        pageWidth: gridDims.pageWidth,
        pageHeight: gridDims.pageHeight,
        numPages: gridDims.numPages
      },
      cacheStats,
      l0TileCount,
      l0TileKeys,
      // Calculate expected page size on L0 tile
      expectedPageWidthOnTile: gridDims.pageWidth * l0Scale,
      expectedPageHeightOnTile: gridDims.pageHeight * l0Scale
    };
  });

  console.log('\n=== L0 TILE DIAGNOSTIC ===');
  console.log('Max level:', l0Info.maxLevel);
  console.log('L0 scale:', l0Info.l0Scale?.toExponential(4));
  console.log('Tile width in grid coords:', l0Info.tileWidthInGrid?.toFixed(0));
  console.log('Tile size (pixels):', l0Info.tileSize);
  console.log('\nGrid dimensions:', JSON.stringify(l0Info.gridDims, null, 2));
  console.log('\nExpected page size on L0 tile:');
  console.log('  Width:', l0Info.expectedPageWidthOnTile?.toFixed(2), 'pixels');
  console.log('  Height:', l0Info.expectedPageHeightOnTile?.toFixed(2), 'pixels');
  console.log('\nCache stats:', JSON.stringify(l0Info.cacheStats, null, 2));
  console.log('\nL0 tiles in cache:', l0Info.l0TileCount);
  console.log('L0 tile keys:', l0Info.l0TileKeys);

  // Go to home view (L0)
  await page.evaluate(() => {
    window.viewer.viewport.goHome(true);
  });
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/l0-diagnostic.png' });

  // Get current zoom info
  const zoomInfo = await page.evaluate(() => {
    const viewport = window.viewer.viewport;
    return {
      zoom: viewport.getZoom(),
      minZoom: viewport.getMinZoom(),
      homeBounds: viewport.getHomeBounds()
    };
  });

  console.log('\n=== VIEWPORT AT HOME ===');
  console.log('Current zoom:', zoomInfo.zoom);
  console.log('Min zoom:', zoomInfo.minZoom);
  console.log('Home bounds:', JSON.stringify(zoomInfo.homeBounds, null, 2));

  // Print relevant console logs
  console.log('\n=== CONSOLE LOGS (L0 related) ===');
  logs.filter(l => l.includes('L0') || l.includes('level 0') || l.includes('minimap'))
      .slice(-15)
      .forEach(l => console.log(l));

  expect(l0Info.maxLevel).toBeGreaterThan(0);
});
